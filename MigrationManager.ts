// ============================================================================
// RentStream Database Migration Manager
// TypeScript + Node.js + PostgreSQL
// ============================================================================

import { Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

interface MigrationConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | object;
  migrationsDir: string;
  seedsDir?: string;
}

interface Migration {
  id: number;
  name: string;
  filename: string;
  checksum: string;
  appliedAt?: Date;
  executionTimeMs?: number;
}

interface MigrationResult {
  success: boolean;
  migration: Migration;
  error?: Error;
  executionTimeMs: number;
}

// ============================================================================
// Migration Manager Class
// ============================================================================

class MigrationManager {
  private pool: Pool;
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  /**
   * Initialize the migrations table
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          migration_id INTEGER UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          filename VARCHAR(255) NOT NULL,
          checksum VARCHAR(64) NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          execution_time_ms INTEGER,
          rolled_back BOOLEAN DEFAULT FALSE,
          rolled_back_at TIMESTAMP WITH TIME ZONE
        );

        CREATE INDEX IF NOT EXISTS idx_schema_migrations_migration_id 
          ON schema_migrations(migration_id);
        CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at 
          ON schema_migrations(applied_at);
      `);

      console.log('✓ Migration tracking table initialized');
    } catch (error) {
      console.error('✗ Failed to initialize migrations table:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all migration files from the migrations directory
   */
  private async getMigrationFiles(): Promise<Migration[]> {
    const migrationsDir = path.resolve(this.config.migrationsDir);
    
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found: ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .filter(f => f.match(/^\d+_.*\.sql$/))
      .sort();

    const migrations: Migration[] = [];

    for (const filename of files) {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) continue;

      const id = parseInt(match[1], 10);
      const name = match[2].replace(/_/g, ' ');
      const filepath = path.join(migrationsDir, filename);
      const content = fs.readFileSync(filepath, 'utf-8');
      const checksum = crypto.createHash('sha256').update(content).digest('hex');

      migrations.push({
        id,
        name,
        filename,
        checksum,
      });
    }

    return migrations;
  }

  /**
   * Get applied migrations from the database
   */
  private async getAppliedMigrations(): Promise<Migration[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          migration_id as id,
          name,
          filename,
          checksum,
          applied_at,
          execution_time_ms
        FROM schema_migrations
        WHERE rolled_back = FALSE
        ORDER BY migration_id ASC
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        filename: row.filename,
        checksum: row.checksum,
        appliedAt: row.applied_at,
        executionTimeMs: row.execution_time_ms,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get pending migrations
   */
  private async getPendingMigrations(): Promise<Migration[]> {
    const allMigrations = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));

    return allMigrations.filter(m => !appliedIds.has(m.id));
  }

  /**
   * Validate migration checksums
   */
  private async validateMigrations(): Promise<void> {
    const allMigrations = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();

    for (const applied of appliedMigrations) {
      const current = allMigrations.find(m => m.id === applied.id);
      
      if (!current) {
        throw new Error(
          `Migration ${applied.id} (${applied.filename}) was applied but file is missing`
        );
      }

      if (current.checksum !== applied.checksum) {
        throw new Error(
          `Migration ${applied.id} (${applied.filename}) checksum mismatch!\n` +
          `Applied: ${applied.checksum}\n` +
          `Current: ${current.checksum}\n` +
          `Migration files should never be modified after being applied.`
        );
      }
    }

    console.log('✓ All applied migrations validated successfully');
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(
    migration: Migration,
    client: PoolClient
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const filepath = path.join(this.config.migrationsDir, migration.filename);
    const sql = fs.readFileSync(filepath, 'utf-8');

    try {
      console.log(`\n→ Applying migration ${migration.id}: ${migration.name}`);

      // Execute the migration SQL
      await client.query(sql);

      const executionTimeMs = Date.now() - startTime;

      // Record the migration
      await client.query(
        `INSERT INTO schema_migrations 
         (migration_id, name, filename, checksum, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5)`,
        [migration.id, migration.name, migration.filename, migration.checksum, executionTimeMs]
      );

      console.log(`✓ Migration ${migration.id} applied successfully (${executionTimeMs}ms)`);

      return {
        success: true,
        migration,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      console.error(`✗ Migration ${migration.id} failed:`, error);

      return {
        success: false,
        migration,
        error: error as Error,
        executionTimeMs,
      };
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate(): Promise<void> {
    await this.initialize();
    await this.validateMigrations();

    const pending = await this.getPendingMigrations();

    if (pending.length === 0) {
      console.log('\n✓ Database is up to date. No migrations to apply.');
      return;
    }

    console.log(`\nFound ${pending.length} pending migration(s):\n`);
    pending.forEach(m => {
      console.log(`  ${m.id}. ${m.name}`);
    });

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      for (const migration of pending) {
        const result = await this.applyMigration(migration, client);
        
        if (!result.success) {
          await client.query('ROLLBACK');
          throw new Error(
            `Migration ${migration.id} failed. All changes rolled back.\n` +
            `Error: ${result.error?.message}`
          );
        }
      }

      await client.query('COMMIT');
      console.log('\n✓ All migrations applied successfully!');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('\n✗ Migration failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Rollback the last migration
   */
  async rollback(steps: number = 1): Promise<void> {
    const appliedMigrations = await this.getAppliedMigrations();
    
    if (appliedMigrations.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    const toRollback = appliedMigrations.slice(-steps).reverse();
    console.log(`\nRolling back ${toRollback.length} migration(s):\n`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const migration of toRollback) {
        console.log(`→ Rolling back migration ${migration.id}: ${migration.name}`);

        // Look for a rollback file
        const rollbackFilename = migration.filename.replace('.sql', '.down.sql');
        const rollbackPath = path.join(this.config.migrationsDir, rollbackFilename);

        if (!fs.existsSync(rollbackPath)) {
          throw new Error(
            `Rollback file not found for migration ${migration.id}: ${rollbackFilename}`
          );
        }

        const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');
        await client.query(rollbackSql);

        // Mark as rolled back
        await client.query(
          `UPDATE schema_migrations 
           SET rolled_back = TRUE, rolled_back_at = CURRENT_TIMESTAMP
           WHERE migration_id = $1`,
          [migration.id]
        );

        console.log(`✓ Migration ${migration.id} rolled back successfully`);
      }

      await client.query('COMMIT');
      console.log('\n✓ Rollback completed successfully!');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('\n✗ Rollback failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Display migration status
   */
  async status(): Promise<void> {
    await this.initialize();

    const allMigrations = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    Migration Status                           ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log(`Database: ${this.config.database}`);
    console.log(`Total migrations: ${allMigrations.length}`);
    console.log(`Applied: ${appliedMigrations.length}`);
    console.log(`Pending: ${allMigrations.length - appliedMigrations.length}\n`);

    console.log('ID  | Status   | Name                              | Applied At');
    console.log('----+----------+-----------------------------------+-------------------------');

    for (const migration of allMigrations) {
      const applied = appliedMigrations.find(m => m.id === migration.id);
      const status = applied ? '✓ Applied' : '○ Pending';
      const appliedAt = applied 
        ? applied.appliedAt?.toISOString().replace('T', ' ').substring(0, 19) 
        : '-';

      console.log(
        `${migration.id.toString().padEnd(3)} | ${status.padEnd(8)} | ` +
        `${migration.name.substring(0, 33).padEnd(33)} | ${appliedAt}`
      );
    }

    console.log();
  }

  /**
   * Create a new migration file
   */
  async create(name: string): Promise<void> {
    const allMigrations = await this.getMigrationFiles();
    const nextId = allMigrations.length > 0 
      ? Math.max(...allMigrations.map(m => m.id)) + 1 
      : 1;

    const paddedId = nextId.toString().padStart(3, '0');
    const sanitizedName = name.toLowerCase().replace(/\s+/g, '_');
    const filename = `${paddedId}_${sanitizedName}.sql`;
    const rollbackFilename = `${paddedId}_${sanitizedName}.down.sql`;

    const filepath = path.join(this.config.migrationsDir, filename);
    const rollbackPath = path.join(this.config.migrationsDir, rollbackFilename);

    // Create migrations directory if it doesn't exist
    if (!fs.existsSync(this.config.migrationsDir)) {
      fs.mkdirSync(this.config.migrationsDir, { recursive: true });
    }

    // Create migration file
    const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}
-- ============================================================================

-- Write your migration SQL here


-- ============================================================================
`;

    fs.writeFileSync(filepath, template);

    // Create rollback file
    const rollbackTemplate = `-- Rollback Migration: ${name}
-- Created: ${new Date().toISOString()}
-- ============================================================================

-- Write your rollback SQL here


-- ============================================================================
`;

    fs.writeFileSync(rollbackPath, rollbackTemplate);

    console.log(`\n✓ Created migration files:`);
    console.log(`  ${filepath}`);
    console.log(`  ${rollbackPath}\n`);
  }

  /**
   * Run seed data
   */
  async seed(): Promise<void> {
    if (!this.config.seedsDir) {
      console.log('No seeds directory configured');
      return;
    }

    const seedsDir = path.resolve(this.config.seedsDir);
    
    if (!fs.existsSync(seedsDir)) {
      console.log(`Seeds directory not found: ${seedsDir}`);
      return;
    }

    const files = fs.readdirSync(seedsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No seed files found');
      return;
    }

    console.log(`\nRunning ${files.length} seed file(s):\n`);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const filename of files) {
        console.log(`→ Running seed: ${filename}`);
        const filepath = path.join(seedsDir, filename);
        const sql = fs.readFileSync(filepath, 'utf-8');
        await client.query(sql);
        console.log(`✓ Seed ${filename} completed`);
      }

      await client.query('COMMIT');
      console.log('\n✓ All seeds applied successfully!');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('\n✗ Seed failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reset database (DANGER: drops all tables)
   */
  async reset(): Promise<void> {
    console.log('\n⚠️  WARNING: This will DROP ALL TABLES in the database!');
    console.log('Database:', this.config.database);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Drop all tables
      const result = await client.query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
      `);

      for (const row of result.rows) {
        console.log(`→ Dropping table: ${row.tablename}`);
        await client.query(`DROP TABLE IF EXISTS ${row.tablename} CASCADE`);
      }

      // Drop all types
      const typesResult = await client.query(`
        SELECT typname 
        FROM pg_type 
        WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND typtype = 'e'
      `);

      for (const row of typesResult.rows) {
        console.log(`→ Dropping type: ${row.typname}`);
        await client.query(`DROP TYPE IF EXISTS ${row.typname} CASCADE`);
      }

      await client.query('COMMIT');
      console.log('\n✓ Database reset completed!');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('\n✗ Reset failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Load configuration from environment or config file
  const config: MigrationConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'rentstream',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
    migrationsDir: process.env.MIGRATIONS_DIR || './migrations',
    seedsDir: process.env.SEEDS_DIR || './seeds',
  };

  const manager = new MigrationManager(config);

  try {
    switch (command) {
      case 'init':
        await manager.initialize();
        break;

      case 'migrate':
      case 'up':
        await manager.migrate();
        break;

      case 'rollback':
      case 'down':
        const steps = parseInt(args[1], 10) || 1;
        await manager.rollback(steps);
        break;

      case 'status':
        await manager.status();
        break;

      case 'create':
        if (!args[1]) {
          console.error('Error: Migration name required');
          console.log('Usage: npm run migrate create <migration_name>');
          process.exit(1);
        }
        await manager.create(args.slice(1).join(' '));
        break;

      case 'seed':
        await manager.seed();
        break;

      case 'reset':
        await manager.reset();
        console.log('\nRun "npm run migrate" to reapply all migrations');
        break;

      case 'fresh':
        await manager.reset();
        await manager.migrate();
        await manager.seed();
        break;

      default:
        console.log(`
RentStream Migration Manager

Usage:
  npm run migrate <command> [options]

Commands:
  init              Initialize migration tracking table
  migrate, up       Run all pending migrations
  rollback, down    Rollback last migration (or specify steps)
  status            Show migration status
  create <name>     Create a new migration file
  seed              Run seed files
  reset             Drop all tables (DANGER!)
  fresh             Reset + migrate + seed

Examples:
  npm run migrate status
  npm run migrate up
  npm run migrate down 2
  npm run migrate create add_user_preferences
  npm run migrate fresh

Environment Variables:
  DB_HOST           Database host (default: localhost)
  DB_PORT           Database port (default: 5432)
  DB_NAME           Database name (default: rentstream)
  DB_USER           Database user (default: postgres)
  DB_PASSWORD       Database password (default: postgres)
  DB_SSL            Use SSL (default: false)
  MIGRATIONS_DIR    Migrations directory (default: ./migrations)
  SEEDS_DIR         Seeds directory (default: ./seeds)
        `);
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await manager.close();
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

export { MigrationManager, MigrationConfig, Migration, MigrationResult };