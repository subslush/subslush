// =====================================================
// Database Test Configuration
// =====================================================
// Description: Configuration management for database testing
// Node.js built-in test framework compatible

const fs = require('fs');
const path = require('path');

class TestConfig {
    constructor() {
        this.loadEnvironmentVariables();
        this.setupConfigurations();
        this.validateConfiguration();
    }

    /**
     * Load environment variables from .env.test file
     */
    loadEnvironmentVariables() {
        const envTestPath = path.join(__dirname, '..', '.env.test');

        try {
            if (fs.existsSync(envTestPath)) {
                const envContent = fs.readFileSync(envTestPath, 'utf8');
                const envLines = envContent.split('\n');

                envLines.forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine && !trimmedLine.startsWith('#')) {
                        const [key, ...valueParts] = trimmedLine.split('=');
                        if (key && valueParts.length > 0) {
                            const value = valueParts.join('=').replace(/^["']|["']$/g, '');
                            process.env[key.trim()] = value;
                        }
                    }
                });
            }
        } catch (error) {
            console.warn('Warning: Could not load .env.test file:', error.message);
        }
    }

    /**
     * Setup database configurations for different test scenarios
     */
    setupConfigurations() {
        this.config = {
            // PostgreSQL Direct Connection
            postgres: {
                host: process.env.TEST_DB_HOST || 'localhost',
                port: parseInt(process.env.TEST_DB_PORT) || 5432,
                database: process.env.TEST_DB_DATABASE || 'subscription_platform',
                user: process.env.TEST_DB_USER || 'subscription_user',
                password: process.env.TEST_DB_PASSWORD || 'subscription_pass_2024',

                // Connection pool settings for testing
                max: parseInt(process.env.TEST_DB_POOL_MAX) || 10,
                idleTimeoutMillis: parseInt(process.env.TEST_DB_IDLE_TIMEOUT) || 30000,
                connectionTimeoutMillis: parseInt(process.env.TEST_DB_CONNECTION_TIMEOUT) || 5000,

                // SSL configuration
                ssl: process.env.TEST_DB_SSL === 'true' ? {
                    rejectUnauthorized: false
                } : false,

                // Application identification
                application_name: 'database_test_suite'
            },

            // PgBouncer Connection (if available)
            pgbouncer: {
                host: process.env.TEST_PGBOUNCER_HOST || 'localhost',
                port: parseInt(process.env.TEST_PGBOUNCER_PORT) || 6432,
                database: process.env.TEST_DB_DATABASE || 'subscription_platform',
                user: process.env.TEST_DB_USER || 'subscription_user',
                password: process.env.TEST_DB_PASSWORD || 'subscription_pass_2024',

                // PgBouncer optimized settings
                max: parseInt(process.env.TEST_PGBOUNCER_POOL_MAX) || 20,
                idleTimeoutMillis: parseInt(process.env.TEST_PGBOUNCER_IDLE_TIMEOUT) || 10000,
                connectionTimeoutMillis: parseInt(process.env.TEST_PGBOUNCER_CONNECTION_TIMEOUT) || 5000,

                ssl: process.env.TEST_DB_SSL === 'true' ? {
                    rejectUnauthorized: false
                } : false,

                application_name: 'pgbouncer_test_suite'
            },

            // Invalid configuration for negative testing
            invalid: {
                host: 'invalid-host',
                port: 9999,
                database: 'invalid_database',
                user: 'invalid_user',
                password: 'invalid_password',
                connectionTimeoutMillis: 1000,
                application_name: 'invalid_test'
            },

            // Test execution settings
            test: {
                timeout: parseInt(process.env.TEST_TIMEOUT) || 30000,
                retries: parseInt(process.env.TEST_RETRIES) || 1,
                parallel: process.env.TEST_PARALLEL === 'true',
                verbose: process.env.TEST_VERBOSE === 'true',
                performance: process.env.TEST_PERFORMANCE === 'true',
                cleanup: process.env.TEST_CLEANUP !== 'false',

                // Stress testing configuration
                stress: {
                    connections: parseInt(process.env.TEST_STRESS_CONNECTIONS) || 50,
                    duration: parseInt(process.env.TEST_STRESS_DURATION) || 10000,
                    queries_per_connection: parseInt(process.env.TEST_STRESS_QUERIES) || 10
                },

                // Performance testing configuration
                performance_targets: {
                    connection_time_ms: parseInt(process.env.TEST_TARGET_CONNECTION_MS) || 100,
                    query_time_ms: parseInt(process.env.TEST_TARGET_QUERY_MS) || 50,
                    batch_insert_rows_per_second: parseInt(process.env.TEST_TARGET_INSERT_RPS) || 1000
                },

                // Data generation settings
                data: {
                    users_count: parseInt(process.env.TEST_USERS_COUNT) || 100,
                    subscriptions_per_user: parseInt(process.env.TEST_SUBSCRIPTIONS_PER_USER) || 2,
                    credits_per_user: parseInt(process.env.TEST_CREDITS_PER_USER) || 5,
                    tasks_per_subscription: parseInt(process.env.TEST_TASKS_PER_SUBSCRIPTION) || 1
                }
            }
        };

        // Additional derived configurations
        this.config.all_databases = [this.config.postgres];

        // Only add PgBouncer if it's configured differently
        if (this.config.pgbouncer.port !== this.config.postgres.port) {
            this.config.all_databases.push(this.config.pgbouncer);
        }
    }

    /**
     * Validate configuration completeness
     */
    validateConfiguration() {
        const required = ['host', 'port', 'database', 'user', 'password'];

        for (const configName of ['postgres', 'pgbouncer']) {
            const config = this.config[configName];

            for (const field of required) {
                if (!config[field]) {
                    throw new Error(`Missing required configuration: ${configName}.${field}`);
                }
            }
        }
    }

    /**
     * Get configuration for specific database type
     */
    getConfig(type = 'postgres') {
        if (!this.config[type]) {
            throw new Error(`Unknown configuration type: ${type}`);
        }
        return { ...this.config[type] };
    }

    /**
     * Get all database configurations for testing
     */
    getAllConfigs() {
        return this.config.all_databases.map(config => ({ ...config }));
    }

    /**
     * Get test execution settings
     */
    getTestSettings() {
        return { ...this.config.test };
    }

    /**
     * Get invalid configuration for negative testing
     */
    getInvalidConfig() {
        return { ...this.config.invalid };
    }

    /**
     * Check if PgBouncer testing is enabled
     */
    isPgBouncerEnabled() {
        return this.config.pgbouncer.port !== this.config.postgres.port;
    }

    /**
     * Get connection string for logging (without password)
     */
    getConnectionString(type = 'postgres', includePassword = false) {
        const config = this.getConfig(type);
        const password = includePassword ? config.password : '***';
        return `postgresql://${config.user}:${password}@${config.host}:${config.port}/${config.database}`;
    }

    /**
     * Log configuration summary
     */
    logSummary() {
        console.log('\n📋 Test Configuration Summary');
        console.log('==============================');
        console.log(`PostgreSQL: ${this.getConnectionString('postgres')}`);

        if (this.isPgBouncerEnabled()) {
            console.log(`PgBouncer:  ${this.getConnectionString('pgbouncer')}`);
        }

        console.log(`Test Timeout: ${this.config.test.timeout}ms`);
        console.log(`Parallel Tests: ${this.config.test.parallel}`);
        console.log(`Performance Tests: ${this.config.test.performance}`);
        console.log(`Cleanup Enabled: ${this.config.test.cleanup}`);
        console.log('');
    }

    /**
     * Get database-specific test configuration
     */
    getDatabaseTestConfig(connectionConfig) {
        return {
            connection: connectionConfig,
            test_table_prefix: `test_${Date.now()}_`,
            test_timeout: this.config.test.timeout,
            cleanup_on_failure: true,

            // Test data configuration
            test_data: {
                users: this.config.test.data.users_count,
                subscriptions_per_user: this.config.test.data.subscriptions_per_user,
                credits_per_user: this.config.test.data.credits_per_user,
                tasks_per_subscription: this.config.test.data.tasks_per_subscription
            },

            // Performance thresholds
            performance_thresholds: {
                connection_time: this.config.test.performance_targets.connection_time_ms,
                query_time: this.config.test.performance_targets.query_time_ms,
                batch_insert_rate: this.config.test.performance_targets.batch_insert_rows_per_second
            }
        };
    }

    /**
     * Get stress test configuration
     */
    getStressTestConfig() {
        return {
            connections: this.config.test.stress.connections,
            duration: this.config.test.stress.duration,
            queries_per_connection: this.config.test.stress.queries_per_connection,

            // Derived settings
            total_queries: this.config.test.stress.connections * this.config.test.stress.queries_per_connection,
            queries_per_second: Math.floor(
                (this.config.test.stress.connections * this.config.test.stress.queries_per_connection) /
                (this.config.test.stress.duration / 1000)
            )
        };
    }

    /**
     * Create test-specific database configuration
     */
    createTestDbConfig(baseConfig, testName) {
        return {
            ...baseConfig,
            application_name: `${baseConfig.application_name}_${testName}`,

            // Test-specific connection limits
            max: Math.min(baseConfig.max, 5), // Limit connections during tests

            // Shorter timeouts for faster test feedback
            connectionTimeoutMillis: Math.min(baseConfig.connectionTimeoutMillis, 3000),

            // Test metadata
            test_name: testName,
            test_timestamp: new Date().toISOString()
        };
    }

    /**
     * Get environment-specific settings
     */
    getEnvironmentSettings() {
        const env = process.env.NODE_ENV || 'test';

        return {
            environment: env,
            is_ci: process.env.CI === 'true',
            is_debug: process.env.DEBUG === 'true',
            log_level: process.env.LOG_LEVEL || 'info',

            // CI/CD specific settings
            ci_settings: {
                timeout_multiplier: process.env.CI === 'true' ? 2 : 1,
                retry_count: process.env.CI === 'true' ? 3 : 1,
                parallel_limit: process.env.CI === 'true' ? 2 : 4
            }
        };
    }
}

// Export singleton instance
const testConfig = new TestConfig();

module.exports = testConfig;