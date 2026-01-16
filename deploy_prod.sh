#!/bin/bash
# ============================================================================
# RentStream Deployment Script
# Production deployment automation
# ============================================================================

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_header() { 
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
}

# ============================================================================
# Filename: deploy.sh
# ============================================================================

print_header "RentStream Production Deployment"

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed"
    exit 1
fi

print_success "Prerequisites checked"

# Check .env file
if [ ! -f .env ]; then
    print_error ".env file not found"
    print_info "Copy .env.example to .env and fill in the values"
    exit 1
fi

print_success ".env file found"

# Load environment variables
source .env

# Create necessary directories
print_info "Creating directories..."
mkdir -p backups logs docker/nginx/ssl

# Build images
print_header "Building Docker Images"
docker-compose build --no-cache
print_success "Images built successfully"

# Start database services first
print_header "Starting Database Services"
docker-compose up -d postgres redis
print_info "Waiting for database to be ready..."

# Wait for PostgreSQL
for i in {1..30}; do
    if docker-compose exec -T postgres pg_isready -U postgres &> /dev/null; then
        print_success "PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "PostgreSQL failed to start"
        exit 1
    fi
    sleep 2
done

# Wait for Redis
for i in {1..30}; do
    if docker-compose exec -T redis redis-cli -a "$REDIS_PASSWORD" ping &> /dev/null; then
        print_success "Redis is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "Redis failed to start"
        exit 1
    fi
    sleep 2
done

# Run migrations
print_header "Running Database Migrations"
docker-compose --profile migration up migrations
print_success "Migrations completed"

# Ask about seed data
read -p "Load seed data? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Loading seed data..."
    docker-compose exec api npm run migrate:seed
    print_success "Seed data loaded"
fi

# Start remaining services
print_header "Starting Application Services"
docker-compose up -d api nginx
print_success "Services started"

# Wait for API to be healthy
print_info "Waiting for API to be healthy..."
for i in {1..60}; do
    if curl -f http://localhost:3000/health &> /dev/null; then
        print_success "API is healthy"
        break
    fi
    if [ $i -eq 60 ]; then
        print_error "API failed to become healthy"
        print_info "Check logs with: docker-compose logs api"
        exit 1
    fi
    sleep 2
done

# Show status
print_header "Deployment Status"
docker-compose ps

print_header "Deployment Complete! 🎉"
echo ""
echo "Services:"
echo "  API:       http://localhost:3000"
echo "  API Docs:  http://localhost:3000/api-docs"
echo "  Health:    http://localhost:3000/health"
echo ""
echo "Useful commands:"
echo "  View logs:        docker-compose logs -f"
echo "  Stop services:    docker-compose down"
echo "  Restart:          docker-compose restart"
echo "  Database backup:  make backup"
echo ""
print_info "Check README-DEPLOYMENT.md for more information"

---
# ============================================================================
# Filename: scripts/health-check.sh
# Health check script for monitoring
# ============================================================================

#!/bin/bash

API_URL="${1:-http://localhost:3000}"
MAX_RETRIES=3
RETRY_DELAY=5

check_service() {
    local service_name=$1
    local endpoint=$2
    
    echo "Checking $service_name..."
    
    for i in $(seq 1 $MAX_RETRIES); do
        if curl -f -s "$endpoint" > /dev/null; then
            echo "✓ $service_name is healthy"
            return 0
        fi
        
        if [ $i -lt $MAX_RETRIES ]; then
            echo "  Retry $i/$MAX_RETRIES..."
            sleep $RETRY_DELAY
        fi
    done
    
    echo "✗ $service_name is unhealthy"
    return 1
}

# Check all services
ALL_HEALTHY=true

check_service "API" "$API_URL/health" || ALL_HEALTHY=false
check_service "Database" "$API_URL/health/db" || ALL_HEALTHY=false
check_service "Redis" "$API_URL/health/redis" || ALL_HEALTHY=false

if [ "$ALL_HEALTHY" = true ]; then
    echo ""
    echo "✓ All services are healthy"
    exit 0
else
    echo ""
    echo "✗ Some services are unhealthy"
    exit 1
fi

---
# ============================================================================
# Filename: scripts/backup.sh
# Automated backup script
# ============================================================================

#!/bin/bash

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

echo "Starting backup at $(date)"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
echo "Backing up PostgreSQL database..."
docker-compose exec -T postgres pg_dump -U postgres rentstream | gzip > "$BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz"

# Backup Redis (if needed)
echo "Backing up Redis data..."
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" --rdb /data/dump.rdb
docker cp rentstream-redis:/data/dump.rdb "$BACKUP_DIR/redis_${TIMESTAMP}.rdb"

# Backup uploaded files
echo "Backing up uploaded files..."
tar -czf "$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz" -C "$(docker volume inspect rentstream_api_uploads -f '{{.Mountpoint}}')" .

# Clean old backups
echo "Cleaning old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.rdb" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed successfully at $(date)"
echo "Backup location: $BACKUP_DIR"
ls -lh "$BACKUP_DIR" | tail -5

---
# ============================================================================
# Filename: scripts/restore.sh
# Restore from backup
# ============================================================================

#!/bin/bash

set -e

if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    ls -lh backups/*.sql.gz | tail -10
    exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "WARNING: This will restore the database from backup."
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure? (yes/no) " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo "Restore cancelled"
    exit 0
fi

echo "Stopping API service..."
docker-compose stop api

echo "Restoring database..."
gunzip -c "$BACKUP_FILE" | docker-compose exec -T postgres psql -U postgres rentstream

echo "Restarting API service..."
docker-compose start api

echo "Restore completed successfully"
echo "Run health check: ./scripts/health-check.sh"

---
# ============================================================================
# Filename: scripts/ssl-setup.sh
# SSL certificate setup with Let's Encrypt
# ============================================================================

#!/bin/bash

set -e

DOMAIN="${1:-api.rentstream.com}"
EMAIL="${2:-admin@rentstream.com}"

echo "Setting up SSL for $DOMAIN"

# Install certbot
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    if [ -f /etc/debian_version ]; then
        sudo apt-get update
        sudo apt-get install -y certbot python3-certbot-nginx
    elif [ -f /etc/redhat-release ]; then
        sudo yum install -y certbot python3-certbot-nginx
    else
        echo "Please install certbot manually"
        exit 1
    fi
fi

# Stop nginx if running
docker-compose stop nginx || true

# Obtain certificate
echo "Obtaining SSL certificate..."
sudo certbot certonly --standalone \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive

# Copy certificates to docker volume
sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem docker/nginx/ssl/
sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem docker/nginx/ssl/

# Set permissions
sudo chmod 644 docker/nginx/ssl/fullchain.pem
sudo chmod 600 docker/nginx/ssl/privkey.pem

# Restart nginx
docker-compose up -d nginx

echo "SSL certificate installed successfully"
echo "Certificate will expire on: $(sudo certbot certificates | grep Expiry)"

# Setup auto-renewal
echo "Setting up auto-renewal..."
(crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet && docker-compose restart nginx") | crontab -

---
# ============================================================================
# Filename: scripts/scale.sh
# Scale API instances
# ============================================================================

#!/bin/bash

INSTANCES="${1:-3}"

echo "Scaling API to $INSTANCES instances..."

docker-compose up -d --scale api=$INSTANCES

echo "Waiting for instances to be healthy..."
sleep 10

echo "Current instances:"
docker-compose ps api

---
# ============================================================================
# Filename: scripts/update.sh
# Zero-downtime update script
# ============================================================================

#!/bin/bash

set -e

echo "Starting zero-downtime update..."

# Pull latest code
echo "Pulling latest code..."
git pull origin main

# Build new image
echo "Building new image..."
docker-compose build api

# Start new instances alongside old ones
echo "Starting new instances..."
docker-compose up -d --scale api=2 --no-recreate

# Wait for new instances to be healthy
echo "Waiting for new instances to be healthy..."
sleep 30

# Health check
if ./scripts/health-check.sh; then
    echo "New instances are healthy, removing old instances..."
    docker-compose up -d --scale api=1
    echo "Update completed successfully"
else
    echo "New instances failed health check, rolling back..."
    docker-compose up -d --scale api=1
    exit 1
fi

---
# ============================================================================
# Filename: README-DEPLOYMENT.md
# Deployment Documentation
# ============================================================================

# RentStream Deployment Guide

Complete guide for deploying RentStream to production using Docker.

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 4GB RAM minimum (8GB recommended)
- 50GB disk space minimum
- Domain name (for SSL)

## Quick Start

### 1. Initial Setup

```bash
# Clone repository
git clone https://github.com/your-org/rentstream.git
cd rentstream

# Copy environment template
cp .env.example .env

# Edit .env with your values
nano .env
```

### 2. Deploy

```bash
# Make scripts executable
chmod +x deploy.sh scripts/*.sh

# Run deployment
./deploy.sh
```

### 3. Verify

```bash
# Check service status
docker-compose ps

# Run health check
./scripts/health-check.sh

# View logs
docker-compose logs -f api
```

## Production Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. SSL Setup

```bash
# Setup SSL with Let's Encrypt
./scripts/ssl-setup.sh api.rentstream.com admin@rentstream.com

# Certificates will auto-renew every 90 days
```

### 3. Deploy Application

```bash
# Run full deployment
make prod-deploy

# Or step by step:
make build
make up
make migrate
make seed  # Optional
```

## Configuration

### Environment Variables

**Required:**
- `DB_PASSWORD` - PostgreSQL password
- `REDIS_PASSWORD` - Redis password
- `JWT_SECRET` - JWT signing secret (min 32 chars)
- `STRIPE_SECRET_KEY` - Stripe API key
- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials

**Optional:**
- `API_PORT` - API port (default: 3000)
- `THROTTLE_LIMIT` - Rate limit (default: 100)
- See `.env.example` for full list

### Scaling

```bash
# Scale API instances
./scripts/scale.sh 5

# Or using docker-compose
docker-compose up -d --scale api=5
```

### Resource Limits

Edit `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
    reservations:
      cpus: '2'
      memory: 1G
```

## Operations

### Backups

```bash
# Manual backup
make backup

# Automated daily backups (add to crontab)
0 2 * * * cd /path/to/rentstream && ./scripts/backup.sh

# Restore from backup
make restore FILE=backups/postgres_20240115_020000.sql.gz
```

### Updates

```bash
# Zero-downtime update
./scripts/update.sh

# Or manual update
git pull
docker-compose build
docker-compose up -d
```

### Monitoring

```bash
# Start monitoring stack
make monitoring-up

# Access Grafana
http://your-server:3001

# Access Prometheus
http://your-server:9090
```

### Logs

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail=100 api
```

## Troubleshooting

### API won't start

```bash
# Check logs
docker-compose logs api

# Check database connection
docker-compose exec api npm run db:check

# Restart service
docker-compose restart api
```

### Database connection errors

```bash
# Check PostgreSQL status
docker-compose exec postgres pg_isready

# Check credentials
docker-compose exec postgres psql -U postgres -d rentstream -c "SELECT 1"

# Reset database
docker-compose down postgres
docker volume rm rentstream_postgres_data
docker-compose up -d postgres
make migrate
```

### Out of memory

```bash
# Check memory usage
docker stats

# Increase swap
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### SSL certificate issues

```bash
# Renew certificates manually
sudo certbot renew

# Check certificate status
sudo certbot certificates

# Test auto-renewal
sudo certbot renew --dry-run
```

## Security Checklist

- [ ] Change all default passwords
- [ ] Enable firewall (ufw/iptables)
- [ ] Setup SSL/TLS certificates
- [ ] Configure backup strategy
- [ ] Enable monitoring and alerts
- [ ] Setup log aggregation
- [ ] Configure rate limiting
- [ ] Review security headers
- [ ] Setup intrusion detection
- [ ] Configure automated updates

## Performance Tuning

### PostgreSQL

```sql
-- Check slow queries
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;

-- Analyze tables
ANALYZE VERBOSE;

-- Vacuum database
VACUUM ANALYZE;
```

### Redis

```bash
# Check memory usage
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO memory

# Clear cache
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" FLUSHALL
```

### Nginx

```nginx
# Edit docker/nginx/nginx.conf
worker_processes auto;
worker_connections 4096;
keepalive_timeout 65;
```

## Maintenance

### Regular Tasks

**Daily:**
- Monitor error logs
- Check disk space
- Review security alerts

**Weekly:**
- Review backup integrity
- Check for updates
- Analyze performance metrics

**Monthly:**
- Update dependencies
- Review and rotate logs
- Security audit
- Load testing

### Commands Reference

```bash
# Service Management
make up              # Start services
make down            # Stop services
make restart         # Restart services
make ps              # List containers
make logs            # View logs

# Database
make migrate         # Run migrations
make seed            # Load seed data
make backup          # Backup database
make restore         # Restore database

# Monitoring
make stats           # Container stats
make monitoring-up   # Start monitoring

# Deployment
make build           # Build images
make prod-deploy     # Full deployment
```

## Support

For issues or questions:
- Check logs: `docker-compose logs`
- Run health check: `./scripts/health-check.sh`
- Review documentation: `/docs`
- Contact: support@rentstream.com

## License

Copyright © 2024 RentStream. All rights reserved.