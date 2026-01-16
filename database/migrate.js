#!/usr/bin/env node

// =====================================================
// Database Migration Runner
// =====================================================
// Description: Command-line tool for managing database migrations
// Usage: node migrate.js [command] [options]

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const DatabaseConnection = require('./connection');

class MigrationRunner {
    constructor() {
        this.db = new DatabaseConnection();
        this.migrationsDir = path.join(__dirname, 'migrations');
        this.dryRun = false;
        this.verbose = false;
        this.backupEnabled = false;

        // Parse command line arguments
        this.parseArguments();
    }

    /**
     * Parse command line arguments
     */
    parseArguments() {
        const args = process.argv.slice(2);
        this.command = args[0] || 'status';
        this.migrationName = args[1];

        // Parse flags
        this.dryRun = args.includes('--dry-run');
        this.verbose = args.includes('--verbose');
        this.backupEnabled = args.includes('--backup');
        this.force = args.includes('--force');

        // Set environment variable for verbose logging
        if (this.verbose) {
            process.env.MIGRATION_VERBOSE = 'true';
        }
    }

    /**
     * Main entry point
     */
    async run() {
        try {
            console.log('🚀 Database Migration Runner');
            console.log('==============================');

            if (this.dryRun) {
                console.log('🔍 DRY RUN MODE - No changes will be applied');
            }

            if (this.verbose) {
                console.log('📝 VERBOSE MODE - Detailed logging enabled');
            }

            await this.db.connect();
            await this.db.createMigrationsTable();

            switch (this.command.toLowerCase()) {
                case 'up':
                    await this.migrateUp();
                    break;
                case 'down':
                    await this.migrateDown();
                    break;
                case 'status':
                    await this.showStatus();
                    break;
                case 'create':
                    await this.createMigration();
                    break;
                case 'test':
                    await this.testConnection();
                    break;
                case 'validate':
                    await this.validateMigrations();
                    break;
                case 'rollback':
                    await this.rollbackToVersion();
                    break;
                default:
                    this.showUsage();
            }

        } catch (error) {
            console.error('❌ Migration runner failed:', error.message);
            if (this.verbose) {
                console.error('Stack trace:', error.stack);
            }
            process.exit(1);

        } finally {
            await this.db.disconnect();
        }
    }

    /**
     * Apply pending migrations
     */
    async migrateUp() {
        try {
            console.log('\n📈 Running UP migrations...');

            await this.db.acquireLock();

            const migrationFiles = await this.getMigrationFiles();
            const appliedMigrations = await this.db.getAppliedMigrations();
            const appliedVersions = new Set(appliedMigrations.map(m => m.version));

            const pendingMigrations = migrationFiles.filter(
                file => !appliedVersions.has(this.getVersionFromFilename(file))
            );

            if (pendingMigrations.length === 0) {
                console.log('✅ No pending migrations found');
                return;
            }

            console.log(`📋 Found ${pendingMigrations.length} pending migration(s):`);
            pendingMigrations.forEach(file => {
                console.log(`   📄 ${file}`);
            });

            if (this.dryRun) {
                console.log('\n🔍 DRY RUN - Would apply these migrations');
                return;
            }

            for (const file of pendingMigrations) {
                await this.applyMigration(file, 'up');
            }

            console.log('\n✅ All migrations applied successfully');

        } catch (error) {
            console.error('❌ Migration UP failed:', error.message);
            throw error;

        } finally {
            await this.db.releaseLock();
        }
    }

    /**
     * Rollback last migration
     */
    async migrateDown() {
        try {
            console.log('\n📉 Running DOWN migration...');

            await this.db.acquireLock();

            const appliedMigrations = await this.db.getAppliedMigrations();

            if (appliedMigrations.length === 0) {
                console.log('✅ No migrations to rollback');
                return;
            }

            const lastMigration = appliedMigrations[appliedMigrations.length - 1];
            const migrationFile = await this.findMigrationFile(lastMigration.version);

            if (!migrationFile) {
                throw new Error(`Migration file not found for version: ${lastMigration.version}`);
            }

            console.log(`📋 Rolling back migration: ${migrationFile}`);

            if (this.dryRun) {
                console.log('\n🔍 DRY RUN - Would rollback this migration');
                return;
            }

            await this.applyMigration(migrationFile, 'down');
            console.log('\n✅ Migration rolled back successfully');

        } catch (error) {
            console.error('❌ Migration DOWN failed:', error.message);
            throw error;

        } finally {
            await this.db.releaseLock();
        }
    }

    /**
     * Apply a single migration
     */
    async applyMigration(filename, direction) {
        try {
            const version = this.getVersionFromFilename(filename);
            const name = this.getNameFromFilename(filename);
            const filePath = path.join(this.migrationsDir, filename);

            console.log(`\n🔄 Applying ${direction.toUpperCase()}: ${filename}`);

            const content = await fs.readFile(filePath, 'utf8');
            const hasMarkers = this.hasMigrationMarkers(content);
            if (!hasMarkers && direction === 'up') {
                console.warn(
                    `⚠️  Legacy migration format detected in ${filename}; applying full file as UP migration`
                );
            }
            const sql = this.extractSqlForDirection(content, direction);
            const cleanedSql = this.stripPsqlMeta(sql);
            const checksum = this.calculateChecksum(content);

            if (!cleanedSql.trim()) {
                console.warn(`⚠️  No ${direction.toUpperCase()} migration found in ${filename}`);
                return;
            }

            const startTime = Date.now();

            await this.db.transaction(async (client) => {
                // Split SQL into individual statements
                const statements = this.splitSqlStatements(cleanedSql);

                for (const statement of statements) {
                    if (statement.trim()) {
                        if (this.verbose) {
                            console.log(`   🔍 Executing: ${statement.substring(0, 100)}...`);
                        }
                        await client.query(statement);
                    }
                }
            });

            const executionTime = Date.now() - startTime;

            if (direction === 'up') {
                await this.db.recordMigration(version, name, executionTime, checksum);
            } else {
                await this.db.removeMigration(version);
            }

            console.log(`✅ ${direction.toUpperCase()} completed in ${executionTime}ms`);

        } catch (error) {
            console.error(`❌ Migration ${direction.toUpperCase()} failed:`, error.message);
            throw error;
        }
    }

    /**
     * Show migration status
     */
    async showStatus() {
        try {
            console.log('\n📊 Migration Status');
            console.log('==================');

            const migrationFiles = await this.getMigrationFiles();
            const appliedMigrations = await this.db.getAppliedMigrations();
            const appliedVersions = new Set(appliedMigrations.map(m => m.version));

            console.log(`\n📄 Migration Files: ${migrationFiles.length}`);
            console.log(`✅ Applied: ${appliedMigrations.length}`);
            console.log(`⏳ Pending: ${migrationFiles.length - appliedMigrations.length}`);

            if (appliedMigrations.length > 0) {
                console.log('\n📋 Applied Migrations:');
                appliedMigrations.forEach(migration => {
                    const duration = migration.execution_time_ms ? `(${migration.execution_time_ms}ms)` : '';
                    console.log(`   ✅ ${migration.version} - ${migration.name} ${duration}`);
                    console.log(`      Applied: ${migration.applied_at}`);
                });
            }

            const pendingMigrations = migrationFiles.filter(
                file => !appliedVersions.has(this.getVersionFromFilename(file))
            );

            if (pendingMigrations.length > 0) {
                console.log('\n📋 Pending Migrations:');
                pendingMigrations.forEach(file => {
                    console.log(`   ⏳ ${file}`);
                });
            }

            // Show database info
            const dbInfo = await this.db.getDatabaseInfo();
            console.log('\n🗄️  Database Information:');
            console.log(`   📍 Database: ${dbInfo.database}`);
            console.log(`   👤 User: ${dbInfo.user}`);
            console.log(`   📊 Version: ${dbInfo.version.split(' ').slice(0, 2).join(' ')}`);

        } catch (error) {
            console.error('❌ Failed to show status:', error.message);
            throw error;
        }
    }

    /**
     * Create new migration file
     */
    async createMigration() {
        try {
            if (!this.migrationName) {
                throw new Error('Migration name is required. Usage: node migrate.js create <name>');
            }

            const timestamp = this.generateTimestamp();
            const filename = `${timestamp}_${this.migrationName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.sql`;
            const filePath = path.join(this.migrationsDir, filename);

            const template = this.getMigrationTemplate(this.migrationName);

            await fs.writeFile(filePath, template);

            console.log(`✅ Migration created: ${filename}`);
            console.log(`📁 Location: ${filePath}`);
            console.log('\n📝 Next steps:');
            console.log('   1. Edit the migration file with your SQL changes');
            console.log('   2. Run: node migrate.js up');

        } catch (error) {
            console.error('❌ Failed to create migration:', error.message);
            throw error;
        }
    }

    /**
     * Test database connection
     */
    async testConnection() {
        console.log('\n🔍 Testing database connection...');
        const success = await this.db.testConnection();

        if (success) {
            console.log('✅ Database connection test passed');
        } else {
            console.log('❌ Database connection test failed');
            process.exit(1);
        }
    }

    /**
     * Validate all migration files
     */
    async validateMigrations() {
        try {
            console.log('\n🔍 Validating migration files...');

            const migrationFiles = await this.getMigrationFiles();
            let hasErrors = false;

            for (const file of migrationFiles) {
                console.log(`\n📄 Validating: ${file}`);

                const filePath = path.join(this.migrationsDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                const hasMarkers = this.hasMigrationMarkers(content);

                // Check file format
                const upSql = this.stripPsqlMeta(
                    this.extractSqlForDirection(content, 'up')
                );
                const downSql = this.stripPsqlMeta(
                    this.extractSqlForDirection(content, 'down')
                );

                if (!upSql.trim()) {
                    console.error(`   ❌ No UP migration found`);
                    hasErrors = true;
                }

                if (hasMarkers && !downSql.trim()) {
                    console.error(`   ❌ No DOWN migration found`);
                    hasErrors = true;
                } else if (!hasMarkers) {
                    console.warn(`   ⚠️  Legacy migration format (no Down migration)`);
                }

                // Check for transaction blocks
                if (!upSql.includes('BEGIN') || !upSql.includes('COMMIT')) {
                    console.warn(`   ⚠️  UP migration missing transaction block`);
                }

                if (downSql.trim() && (!downSql.includes('BEGIN') || !downSql.includes('COMMIT'))) {
                    console.warn(`   ⚠️  DOWN migration missing transaction block`);
                }

                if (!hasErrors) {
                    console.log(`   ✅ Valid`);
                }
            }

            if (hasErrors) {
                console.log('\n❌ Migration validation failed');
                process.exit(1);
            } else {
                console.log('\n✅ All migrations are valid');
            }

        } catch (error) {
            console.error('❌ Validation failed:', error.message);
            throw error;
        }
    }

    /**
     * Rollback to specific version
     */
    async rollbackToVersion() {
        try {
            if (!this.migrationName) {
                throw new Error('Version is required. Usage: node migrate.js rollback <version>');
            }

            console.log(`\n🔄 Rolling back to version: ${this.migrationName}`);

            await this.db.acquireLock();

            const appliedMigrations = await this.db.getAppliedMigrations();
            const targetIndex = appliedMigrations.findIndex(m => m.version === this.migrationName);

            if (targetIndex === -1) {
                throw new Error(`Version ${this.migrationName} not found in applied migrations`);
            }

            const migrationsToRollback = appliedMigrations.slice(targetIndex + 1).reverse();

            if (migrationsToRollback.length === 0) {
                console.log('✅ Already at target version');
                return;
            }

            console.log(`📋 Will rollback ${migrationsToRollback.length} migration(s):`);
            migrationsToRollback.forEach(m => console.log(`   📄 ${m.version} - ${m.name}`));

            if (this.dryRun) {
                console.log('\n🔍 DRY RUN - Would rollback these migrations');
                return;
            }

            for (const migration of migrationsToRollback) {
                const migrationFile = await this.findMigrationFile(migration.version);
                if (migrationFile) {
                    await this.applyMigration(migrationFile, 'down');
                }
            }

            console.log('\n✅ Rollback completed successfully');

        } catch (error) {
            console.error('❌ Rollback failed:', error.message);
            throw error;

        } finally {
            await this.db.releaseLock();
        }
    }

    /**
     * Get all migration files
     */
    async getMigrationFiles() {
        try {
            const files = await fs.readdir(this.migrationsDir);
            return files
                .filter(file => file.endsWith('.sql'))
                .sort(); // Lexicographic sort works with YYYYMMDD_HHMMSS format

        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`📁 Creating migrations directory: ${this.migrationsDir}`);
                await fs.mkdir(this.migrationsDir, { recursive: true });
                return [];
            }
            throw error;
        }
    }

    /**
     * Find migration file by version
     */
    async findMigrationFile(version) {
        const files = await this.getMigrationFiles();
        return files.find(file => this.getVersionFromFilename(file) === version);
    }

    /**
     * Extract SQL for specific direction from migration file
     */
    extractSqlForDirection(content, direction) {
        const upMatch = content.match(/-- Up Migration\s*\n([\s\S]*?)(?=-- Down Migration|$)/i);
        const downMatch = content.match(/-- Down Migration\s*\n([\s\S]*?)$/i);
        const hasMarkers = this.hasMigrationMarkers(content);

        if (direction === 'up') {
            if (upMatch) {
                return upMatch[1].trim();
            }
            return hasMarkers ? '' : content.trim();
        } else {
            return downMatch ? downMatch[1].trim() : '';
        }
    }

    /**
     * Detect legacy migrations that omit Up/Down markers
     */
    hasMigrationMarkers(content) {
        return /-- Up Migration/i.test(content) || /-- Down Migration/i.test(content);
    }

    /**
     * Strip psql meta-commands (e.g., \echo) that are invalid in node-postgres
     */
    stripPsqlMeta(sql) {
        return sql
            .split('\n')
            .filter(line => !line.trim().startsWith('\\'))
            .join('\n');
    }

    /**
     * Split SQL into individual statements
     */
    splitSqlStatements(sql) {
        // Split by semicolon, but preserve transaction blocks
        const statements = [];
        let currentStatement = '';
        let inTransactionBlock = false;

        const lines = sql.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.toUpperCase() === 'BEGIN;') {
                inTransactionBlock = true;
                currentStatement += line + '\n';
            } else if (trimmed.toUpperCase() === 'COMMIT;' || trimmed.toUpperCase() === 'ROLLBACK;') {
                currentStatement += line + '\n';
                if (inTransactionBlock) {
                    statements.push(currentStatement.trim());
                    currentStatement = '';
                    inTransactionBlock = false;
                }
            } else if (trimmed.endsWith(';') && !inTransactionBlock) {
                currentStatement += line;
                statements.push(currentStatement.trim());
                currentStatement = '';
            } else {
                currentStatement += line + '\n';
            }
        }

        if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
        }

        return statements.filter(stmt => stmt.trim());
    }

    /**
     * Generate timestamp for migration filename
     */
    generateTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}_${hours}${minutes}${seconds}`;
    }

    /**
     * Get version from filename
     */
    getVersionFromFilename(filename) {
        const match = filename.match(/^(\d{8})(?:_(\d{6}))?/);
        if (!match) {
            return null;
        }
        return match[2] ? `${match[1]}_${match[2]}` : match[1];
    }

    /**
     * Get name from filename
     */
    getNameFromFilename(filename) {
        const match = filename.match(/^\d{8}(?:_\d{6})?_(.+)\.sql$/);
        return match ? match[1].replace(/_/g, ' ') : filename;
    }

    /**
     * Calculate checksum for migration content
     */
    calculateChecksum(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Get migration template
     */
    getMigrationTemplate(name) {
        const description = name.replace(/_/g, ' ');
        return `-- Migration: ${description}
-- Created: ${new Date().toISOString()}

-- Up Migration
BEGIN;

-- Add your UP migration SQL here
-- Example:
-- CREATE TABLE example_table (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP DEFAULT NOW()
-- );

COMMIT;

-- Down Migration
BEGIN;

-- Add your DOWN migration SQL here
-- Example:
-- DROP TABLE IF EXISTS example_table;

COMMIT;
`;
    }

    /**
     * Show usage information
     */
    showUsage() {
        console.log('\n📖 Migration Runner Usage:');
        console.log('==========================');
        console.log('');
        console.log('Commands:');
        console.log('  up              Apply all pending migrations');
        console.log('  down            Rollback the last migration');
        console.log('  status          Show migration status');
        console.log('  create <name>   Create a new migration file');
        console.log('  test            Test database connection');
        console.log('  validate        Validate all migration files');
        console.log('  rollback <ver>  Rollback to specific version');
        console.log('');
        console.log('Options:');
        console.log('  --dry-run       Show what would be done without applying changes');
        console.log('  --verbose       Enable detailed logging');
        console.log('  --backup        Create backup before applying migrations');
        console.log('  --force         Force operation (use with caution)');
        console.log('');
        console.log('Examples:');
        console.log('  node migrate.js up');
        console.log('  node migrate.js down --dry-run');
        console.log('  node migrate.js create add_user_preferences');
        console.log('  node migrate.js status --verbose');
        console.log('  node migrate.js rollback 20241219_120000');
    }
}

// Run the migration runner if this file is executed directly
if (require.main === module) {
    const runner = new MigrationRunner();
    runner.run().catch(error => {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = MigrationRunner;
