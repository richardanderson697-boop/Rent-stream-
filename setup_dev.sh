#!/bin/bash

# ============================================================================
# RentStream Quick Start Setup Script
# This script sets up the complete RentStream database environment
# ============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_header() { echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"; }

# ============================================================================
# Configuration
# ============================================================================

PROJECT_NAME="RentStream"
DB_CONTAINER_NAME="rentstream-db"
REDIS_CONTAINER_NAME="rentstream-redis"

# ============================================================================
# Functions
# ============================================================================

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check for Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_success "Node.js $NODE_VERSION installed"
    else
        print_error "Node.js is not installed"
        echo "Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi
    
    # Check for npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "npm $NPM_VERSION installed"
    else
        print_error "npm is not installed"
        exit 1
    fi
    
    # Check for Docker
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version)
        print_success "Docker installed: $DOCKER_VERSION"
    else
        print_warning "Docker is not installed (optional for local development)"
        echo "You can install Docker from https://www.docker.com/"
    fi
    
    # Check for psql (PostgreSQL client)
    if command -v psql &> /dev/null; then
        PSQL_VERSION=$(psql --version)
        print_success "PostgreSQL client installed: $PSQL_VERSION"
    else
        print_warning "psql client not found (optional but recommended)"
    fi
}

setup_project_structure() {
    print_header "Setting Up Project Structure"
    
    # Create directories
    mkdir -p migrations
    mkdir -p seeds
    mkdir -p src
    mkdir -p scripts
    mkdir -p logs
    
    print_success "Created project directories"
    
    # Create .gitignore if it doesn't exist
    if [ ! -f .gitignore ]; then
        cat > .gitignore << 'EOF'
# Dependencies
node_modules/
package-lock.json

# Environment
.env
.env.local
.env.*.local

# Build output
dist/
*.js
*.js.map
*.d.ts
!scripts/*.js

# Logs
logs/
*.log

# OS files
.DS_Store

# IDE
.vscode/
.idea/
EOF
        print_success "Created .gitignore"
    fi
    
    # Create .env.example if it doesn't exist
    if [ ! -f .env.example ]; then
        cat > .env.example << 'EOF'
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rentstream
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false

# Migration Configuration
MIGRATIONS_DIR=./migrations
SEEDS_DIR=./seeds

# Application Configuration (for future use)
NODE_ENV=development
PORT=3000
JWT_SECRET=change-this-in-production
STRIPE_SECRET_KEY=sk_test_your_key_here
EOF
        print_success "Created .env.example"
    fi
    
    # Create .env if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.example .env
        print_success "Created .env from .env.example"
        print_warning "Please update .env with your actual configuration"
    fi
}

install_dependencies() {
    print_header "Installing Dependencies"
    
    if [ ! -f package.json ]; then
        print_error "package.json not found. Please create it first."
        exit 1
    fi
    
    npm install
    print_success "Dependencies installed"
}

start_docker_services() {
    print_header "Starting Docker Services"
    
    if ! command -v docker &> /dev/null; then
        print_warning "Docker not available, skipping Docker services"
        return
    fi
    
    # Check if docker-compose file exists
    if [ ! -f docker-compose.yml ]; then
        print_error "docker-compose.yml not found"
        return
    fi
    
    # Start services
    print_info "Starting PostgreSQL and Redis..."
    docker-compose up -d
    
    # Wait for PostgreSQL to be ready
    print_info "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
        if docker exec $DB_CONTAINER_NAME pg_isready -U postgres &> /dev/null; then
            print_success "PostgreSQL is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            print_error "PostgreSQL failed to start within 30 seconds"
            exit 1
        fi
        sleep 1
    done
    
    # Wait for Redis to be ready
    print_info "Waiting for Redis to be ready..."
    for i in {1..30}; do
        if docker exec $REDIS_CONTAINER_NAME redis-cli ping &> /dev/null; then
            print_success "Redis is ready"
            break
        fi
        if [ $i -eq 30 ]; then
            print_error "Redis failed to start within 30 seconds"
            exit 1
        fi
        sleep 1
    done
}

run_migrations() {
    print_header "Running Database Migrations"
    
    # Check if migrations directory has files
    if [ ! "$(ls -A migrations/*.sql 2>/dev/null)" ]; then
        print_warning "No migration files found in migrations/ directory"
        print_info "Please add your migration files and run: npm run migrate:up"
        return
    fi
    
    # Initialize migration system
    print_info "Initializing migration tracking..."
    npm run migrate init
    
    # Run migrations
    print_info "Running migrations..."
    npm run migrate:up
    
    print_success "Migrations completed"
}

run_seeds() {
    print_header "Running Seed Data"
    
    # Check if seeds directory has files
    if [ ! "$(ls -A seeds/*.sql 2>/dev/null)" ]; then
        print_warning "No seed files found in seeds/ directory"
        return
    fi
    
    read -p "Do you want to load seed data? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run migrate:seed
        print_success "Seed data loaded"
    else
        print_info "Skipping seed data"
    fi
}

check_database_status() {
    print_header "Database Status"
    
    npm run migrate:status
}

print_completion() {
    print_header "Setup Complete! 🎉"
    
    echo -e "${GREEN}Your RentStream database environment is ready!${NC}\n"
    
    echo "Quick Commands:"
    echo "  npm run migrate:status    - Check migration status"
    echo "  npm run migrate:up        - Run pending migrations"
    echo "  npm run migrate:down      - Rollback last migration"
    echo "  npm run migrate:create    - Create new migration"
    echo "  npm run migrate:seed      - Load seed data"
    echo "  npm run migrate:fresh     - Reset and reload everything"
    echo ""
    
    echo "Docker Commands:"
    echo "  docker-compose up -d      - Start services"
    echo "  docker-compose down       - Stop services"
    echo "  docker-compose logs -f    - View logs"
    echo ""
    
    echo "Database Connection:"
    echo "  Host:     localhost"
    echo "  Port:     5432"
    echo "  Database: rentstream"
    echo "  User:     postgres"
    echo "  Password: postgres"
    echo ""
    
    if [ -f seeds/001_sample_users.sql ]; then
        echo "Sample Login Credentials (password: password123):"
        echo "  Landlord:    john.landlord@example.com"
        echo "  Tenant:      alice.tenant@example.com"
        echo "  Maintenance: tom.maintenance@example.com"
        echo "  Admin:       admin@rentstream.com"
        echo ""
    fi
    
    print_info "For more information, see README.md"
}

# ============================================================================
# Main Script
# ============================================================================

main() {
    clear
    
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║               RentStream Setup Script                         ║"
    echo "║                                                               ║"
    echo "║   Property Management Platform - Database Setup              ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
    
    check_prerequisites
    setup_project_structure
    
    # Ask if user wants to install dependencies
    if [ -f package.json ]; then
        if [ ! -d node_modules ]; then
            read -p "Install npm dependencies? (Y/n) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                install_dependencies
            fi
        else
            print_success "Dependencies already installed"
        fi
    fi
    
    # Ask if user wants to start Docker services
    if command -v docker &> /dev/null && [ -f docker-compose.yml ]; then
        read -p "Start Docker services (PostgreSQL & Redis)? (Y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            start_docker_services
        fi
    fi
    
    # Ask if user wants to run migrations
    read -p "Run database migrations? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        run_migrations
    fi
    
    # Ask if user wants to run seeds
    if [ "$(ls -A seeds/*.sql 2>/dev/null)" ]; then
        run_seeds
    fi
    
    # Show status
    check_database_status
    
    print_completion
}

# Run main function
main "$@"

# ============================================================================
# Additional Helper Scripts
# ============================================================================

# Create a backup script
cat > scripts/backup.sh << 'BACKUP_SCRIPT'
#!/bin/bash
# Database backup script

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
BACKUP_FILE="$BACKUP_DIR/rentstream_backup_$TIMESTAMP.sql"

mkdir -p $BACKUP_DIR

echo "Creating backup: $BACKUP_FILE"

docker exec rentstream-db pg_dump -U postgres rentstream > $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo "✓ Backup created successfully"
    
    # Compress backup
    gzip $BACKUP_FILE
    echo "✓ Backup compressed: ${BACKUP_FILE}.gz"
    
    # Keep only last 10 backups
    ls -t $BACKUP_DIR/*.sql.gz | tail -n +11 | xargs -r rm
    echo "✓ Old backups cleaned up"
else
    echo "✗ Backup failed"
    exit 1
fi
BACKUP_SCRIPT

chmod +x scripts/backup.sh

# Create a restore script
cat > scripts/restore.sh << 'RESTORE_SCRIPT'
#!/bin/bash
# Database restore script

if [ -z "$1" ]; then
    echo "Usage: ./scripts/restore.sh <backup_file>"
    echo ""
    echo "Available backups:"
    ls -lh backups/*.sql.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE=$1

if [[ $BACKUP_FILE == *.gz ]]; then
    echo "Decompressing backup..."
    gunzip -c $BACKUP_FILE | docker exec -i rentstream-db psql -U postgres rentstream
else
    cat $BACKUP_FILE | docker exec -i rentstream-db psql -U postgres rentstream
fi

if [ $? -eq 0 ]; then
    echo "✓ Database restored successfully from $BACKUP_FILE"
else
    echo "✗ Restore failed"
    exit 1
fi
RESTORE_SCRIPT

chmod +x scripts/restore.sh

print_success "Created helper scripts in scripts/ directory"