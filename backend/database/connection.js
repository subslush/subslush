// =====================================================
// Database Connection Helper
// =====================================================
// Description: Manages PostgreSQL connections for migration system
// Supports both direct connections and PgBouncer pooling

const { Pool, Client } = require('pg');
require('dotenv').config();

class DatabaseConnection {
    constructor(options = {}) {
        this.config = {
            host: options.host || process.env.DB_HOST || 'localhost',
            port: parseInt(options.port || process.env.DB_PORT || '5432'),
            database: options.database || process.env.DB_DATABASE || 'subscription_platform',
            user: options.user || process.env.DB_USER || 'subscription_user',
            password: options.password || process.env.DB_PASSWORD || 'subscription_pass_2024',

            // Connection pool settings optimized for migrations
            max: parseInt(process.env.DB_POOL_MAX || '2'), // Low pool size for migrations
            idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
            connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),

            // SSL configuration
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,

            // Application name for monitoring
            application_name: process.env.DB_APPLICATION_NAME || 'migration_runner'
        };

        this.pool = null;
        this.client = null;
        this.isConnected = false;
        this.lockAcquired = false;

        // Bind methods to preserve context
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.query = this.query.bind(this);
        this.transaction = this.transaction.bind(this);
    }

    /**
     * Establish database connection
     */
    async connect() {
        try {
            if (this.isConnected) {
                return;
            }

            this.pool = new Pool(this.config);
            this.client = await this.pool.connect();
            this.isConnected = true;

            // Test connection
            await this.client.query('SELECT NOW() as connected_at');

            console.log(`✅ Connected to PostgreSQL database: ${this.config.database}`);
            console.log(`📊 Connection details: ${this.config.host}:${this.config.port}`);

        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw new Error(`Failed to connect to database: ${error.message}`);
        }
    }

    /**
     * Close database connection
     */
    async disconnect() {
        try {
            if (this.lockAcquired) {
                await this.releaseLock();
            }

            if (this.client) {
                this.client.release();
                this.client = null;
            }

            if (this.pool) {
                await this.pool.end();
                this.pool = null;
            }

            this.isConnected = false;
            console.log('✅ Database connection closed');

        } catch (error) {
            console.error('⚠️  Error closing database connection:', error.message);
        }
    }

    /**
     * Execute a query
     */
    async query(text, params = []) {
        if (!this.isConnected || !this.client) {
            throw new Error('Database not connected');
        }

        try {
            const start = Date.now();
            const result = await this.client.query(text, params);
            const duration = Date.now() - start;

            if (process.env.MIGRATION_VERBOSE === 'true') {
                console.log(`🔍 Query executed in ${duration}ms:`, text.substring(0, 100) + '...');
            }

            return result;

        } catch (error) {
            console.error('❌ Query execution failed:', error.message);
            console.error('🔍 Failed query:', text.substring(0, 200) + '...');
            throw error;
        }
    }

    /**
     * Execute queries within a transaction
     */
    async transaction(callback) {
        if (!this.isConnected || !this.client) {
            throw new Error('Database not connected');
        }

        try {
            await this.client.query('BEGIN');
            console.log('🔄 Transaction started');

            const result = await callback(this.client);

            await this.client.query('COMMIT');
            console.log('✅ Transaction committed');

            return result;

        } catch (error) {
            try {
                await this.client.query('ROLLBACK');
                console.log('🔄 Transaction rolled back');
            } catch (rollbackError) {
                console.error('❌ Rollback failed:', rollbackError.message);
            }

            console.error('❌ Transaction failed:', error.message);
            throw error;
        }
    }

    /**
     * Acquire migration lock to prevent concurrent migrations
     */
    async acquireLock(lockId = 'migration_lock') {
        try {
            // Use PostgreSQL advisory locks
            const lockQuery = 'SELECT pg_advisory_lock($1) as lock_acquired';
            const hashCode = this.hashString(lockId);

            await this.query(lockQuery, [hashCode]);
            this.lockAcquired = true;

            console.log(`🔒 Migration lock acquired: ${lockId}`);

        } catch (error) {
            console.error('❌ Failed to acquire migration lock:', error.message);
            throw new Error('Could not acquire migration lock. Another migration may be running.');
        }
    }

    /**
     * Release migration lock
     */
    async releaseLock(lockId = 'migration_lock') {
        try {
            if (!this.lockAcquired) {
                return;
            }

            const unlockQuery = 'SELECT pg_advisory_unlock($1) as lock_released';
            const hashCode = this.hashString(lockId);

            await this.query(unlockQuery, [hashCode]);
            this.lockAcquired = false;

            console.log(`🔓 Migration lock released: ${lockId}`);

        } catch (error) {
            console.error('⚠️  Failed to release migration lock:', error.message);
        }
    }

    /**
     * Check if migrations table exists
     */
    async migrationsTableExists() {
        try {
            const query = `
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = 'schema_migrations'
                );
            `;

            const result = await this.query(query);
            return result.rows[0].exists;

        } catch (error) {
            console.error('❌ Error checking migrations table:', error.message);
            return false;
        }
    }

    /**
     * Create migrations table
     */
    async createMigrationsTable() {
        try {
            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    id SERIAL PRIMARY KEY,
                    version VARCHAR(255) UNIQUE NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    applied_at TIMESTAMP DEFAULT NOW(),
                    execution_time_ms INTEGER,
                    checksum VARCHAR(64),
                    applied_by VARCHAR(100) DEFAULT CURRENT_USER
                );

                CREATE INDEX IF NOT EXISTS idx_schema_migrations_version
                ON schema_migrations(version);

                CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
                ON schema_migrations(applied_at);

                COMMENT ON TABLE schema_migrations IS 'Tracks database schema migration history';
                COMMENT ON COLUMN schema_migrations.version IS 'Migration timestamp in YYYYMMDD_HHMMSS format';
                COMMENT ON COLUMN schema_migrations.checksum IS 'SHA-256 hash of migration content for integrity verification';
            `;

            await this.query(createTableQuery);
            console.log('✅ Migrations table created/verified');

        } catch (error) {
            console.error('❌ Failed to create migrations table:', error.message);
            throw error;
        }
    }

    /**
     * Get applied migrations
     */
    async getAppliedMigrations() {
        try {
            const query = `
                SELECT version, name, applied_at, execution_time_ms, checksum
                FROM schema_migrations
                ORDER BY version ASC
            `;

            const result = await this.query(query);
            return result.rows;

        } catch (error) {
            console.error('❌ Error fetching applied migrations:', error.message);
            throw error;
        }
    }

    /**
     * Record migration as applied
     */
    async recordMigration(version, name, executionTime, checksum) {
        try {
            const query = `
                INSERT INTO schema_migrations (version, name, execution_time_ms, checksum)
                VALUES ($1, $2, $3, $4)
            `;

            await this.query(query, [version, name, executionTime, checksum]);
            console.log(`📝 Migration recorded: ${version} - ${name}`);

        } catch (error) {
            console.error('❌ Error recording migration:', error.message);
            throw error;
        }
    }

    /**
     * Remove migration record (for rollback)
     */
    async removeMigration(version) {
        try {
            const query = 'DELETE FROM schema_migrations WHERE version = $1';
            const result = await this.query(query, [version]);

            if (result.rowCount > 0) {
                console.log(`🗑️  Migration record removed: ${version}`);
            } else {
                console.warn(`⚠️  Migration record not found: ${version}`);
            }

        } catch (error) {
            console.error('❌ Error removing migration record:', error.message);
            throw error;
        }
    }

    /**
     * Get database version and info
     */
    async getDatabaseInfo() {
        try {
            const queries = {
                version: 'SELECT version() as version',
                current_database: 'SELECT current_database() as database',
                current_user: 'SELECT current_user as user',
                current_timestamp: 'SELECT current_timestamp as timestamp'
            };

            const info = {};
            for (const [key, query] of Object.entries(queries)) {
                const result = await this.query(query);
                info[key] = result.rows[0][key === 'current_timestamp' ? 'timestamp' : key];
            }

            return info;

        } catch (error) {
            console.error('❌ Error getting database info:', error.message);
            throw error;
        }
    }

    /**
     * Test database connection
     */
    async testConnection() {
        try {
            await this.connect();
            const info = await this.getDatabaseInfo();

            console.log('🔍 Database Connection Test Results:');
            console.log(`   📍 Database: ${info.database}`);
            console.log(`   👤 User: ${info.user}`);
            console.log(`   🕒 Timestamp: ${info.timestamp}`);
            console.log(`   📊 Version: ${info.version.split(' ').slice(0, 2).join(' ')}`);

            return true;

        } catch (error) {
            console.error('❌ Database connection test failed:', error.message);
            return false;
        }
    }

    /**
     * Create a simple hash of a string (for advisory locks)
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Get connection configuration (without password)
     */
    getConnectionInfo() {
        const { password, ...safeConfig } = this.config;
        return {
            ...safeConfig,
            password: '***'
        };
    }
}

module.exports = DatabaseConnection;