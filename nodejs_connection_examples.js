// =====================================================
// Node.js Connection Examples for PgBouncer
// =====================================================
// Description: Database connection examples using both direct PostgreSQL
//              and PgBouncer pooled connections for subscription platform
// Dependencies: pg (PostgreSQL client), dotenv (environment variables)

const { Pool, Client } = require('pg');
require('dotenv').config();

// =====================================================
// DIRECT POSTGRESQL CONNECTION (WITHOUT PGBOUNCER)
// =====================================================

const directConfig = {
    host: 'localhost',
    port: 5432,
    database: 'subscription_platform',
    user: 'subscription_user',
    password: 'subscription_pass_2024',

    // Connection pool settings for direct connection
    max: 20,                    // Maximum connections in pool
    idleTimeoutMillis: 30000,   // Close idle connections after 30 seconds
    connectionTimeoutMillis: 2000, // Return error after 2 seconds if no connection available

    // SSL settings (adjust based on your setup)
    ssl: false,

    // Application name for monitoring
    application_name: 'subscription_platform_direct'
};

// Create direct connection pool
const directPool = new Pool(directConfig);

// =====================================================
// PGBOUNCER POOLED CONNECTION
// =====================================================

const pgbouncerConfig = {
    host: 'localhost',
    port: 6432,                 // PgBouncer port
    database: 'subscription_platform',
    user: 'subscription_user',
    password: 'subscription_pass_2024',

    // PgBouncer-optimized pool settings
    max: 75,                    // Higher max since PgBouncer handles the real pooling
    idleTimeoutMillis: 10000,   // Shorter idle timeout for client-side pool
    connectionTimeoutMillis: 5000, // Longer timeout for PgBouncer

    // SSL settings
    ssl: false,

    // Application name for monitoring
    application_name: 'subscription_platform_pooled'
};

// Create PgBouncer connection pool
const pgbouncerPool = new Pool(pgbouncerConfig);

// =====================================================
// CONNECTION EXAMPLES AND USAGE PATTERNS
// =====================================================

// Example 1: Basic query using direct connection
async function queryDirectConnection() {
    const client = await directPool.connect();
    try {
        console.log('🔗 Direct Connection - Testing basic query...');
        const result = await client.query('SELECT COUNT(*) as user_count FROM users');
        console.log(`📊 Direct: Found ${result.rows[0].user_count} users`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Direct connection error:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Example 2: Basic query using PgBouncer
async function queryPgBouncerConnection() {
    const client = await pgbouncerPool.connect();
    try {
        console.log('🏊 PgBouncer Connection - Testing basic query...');
        const result = await client.query('SELECT COUNT(*) as subscription_count FROM subscriptions');
        console.log(`📊 PgBouncer: Found ${result.rows[0].subscription_count} subscriptions`);
        return result.rows[0];
    } catch (error) {
        console.error('❌ PgBouncer connection error:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Example 3: Transaction handling with PgBouncer (session mode)
async function handleTransactionWithPgBouncer(userId, amount, serviceType) {
    const client = await pgbouncerPool.connect();
    try {
        await client.query('BEGIN');

        // Deduct credits
        const creditResult = await client.query(
            'INSERT INTO credits (user_id, amount, transaction_type, description) VALUES ($1, $2, $3, $4) RETURNING id',
            [userId, -Math.abs(amount), 'purchase', `Purchase ${serviceType} subscription`]
        );

        // Create subscription
        const subscriptionResult = await client.query(
            'INSERT INTO subscriptions (user_id, service_type, service_plan, start_date, end_date, renewal_date) VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL \'1 year\', NOW() + INTERVAL \'11 months\') RETURNING id',
            [userId, serviceType, 'premium']
        );

        await client.query('COMMIT');
        console.log(`✅ Transaction successful: Credit ${creditResult.rows[0].id}, Subscription ${subscriptionResult.rows[0].id}`);

        return {
            creditId: creditResult.rows[0].id,
            subscriptionId: subscriptionResult.rows[0].id
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Transaction failed:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Example 4: Connection testing and health checks
async function testConnections() {
    console.log('\n🔍 Testing database connections...\n');

    try {
        // Test direct connection
        const directStart = Date.now();
        await queryDirectConnection();
        const directTime = Date.now() - directStart;
        console.log(`⏱️  Direct connection time: ${directTime}ms`);

        // Test PgBouncer connection
        const pgbouncerStart = Date.now();
        await queryPgBouncerConnection();
        const pgbouncerTime = Date.now() - pgbouncerStart;
        console.log(`⏱️  PgBouncer connection time: ${pgbouncerTime}ms`);

        // Performance comparison
        const improvement = ((directTime - pgbouncerTime) / directTime * 100).toFixed(1);
        console.log(`📈 Performance improvement with PgBouncer: ${improvement}%`);

    } catch (error) {
        console.error('❌ Connection test failed:', error.message);
    }
}

// Example 5: Concurrent connection stress test
async function stressTestConnections(connectionCount = 50) {
    console.log(`\n🚀 Stress testing with ${connectionCount} concurrent connections...\n`);

    const testQuery = 'SELECT pg_sleep(0.1), NOW() as timestamp, inet_server_addr() as server_ip';

    // Test direct connections
    console.log('Testing direct connections...');
    const directPromises = Array.from({ length: connectionCount }, async (_, i) => {
        const client = await directPool.connect();
        try {
            const result = await client.query(testQuery);
            return { index: i, success: true, timestamp: result.rows[0].timestamp };
        } catch (error) {
            return { index: i, success: false, error: error.message };
        } finally {
            client.release();
        }
    });

    const directStart = Date.now();
    const directResults = await Promise.allSettled(directPromises);
    const directTime = Date.now() - directStart;
    const directSuccessful = directResults.filter(r => r.status === 'fulfilled' && r.value.success).length;

    // Test PgBouncer connections
    console.log('Testing PgBouncer connections...');
    const pgbouncerPromises = Array.from({ length: connectionCount }, async (_, i) => {
        const client = await pgbouncerPool.connect();
        try {
            const result = await client.query(testQuery);
            return { index: i, success: true, timestamp: result.rows[0].timestamp };
        } catch (error) {
            return { index: i, success: false, error: error.message };
        } finally {
            client.release();
        }
    });

    const pgbouncerStart = Date.now();
    const pgbouncerResults = await Promise.allSettled(pgbouncerPromises);
    const pgbouncerTime = Date.now() - pgbouncerStart;
    const pgbouncerSuccessful = pgbouncerResults.filter(r => r.status === 'fulfilled' && r.value.success).length;

    // Results
    console.log('\n📊 Stress Test Results:');
    console.log(`Direct: ${directSuccessful}/${connectionCount} successful in ${directTime}ms`);
    console.log(`PgBouncer: ${pgbouncerSuccessful}/${connectionCount} successful in ${pgbouncerTime}ms`);
    console.log(`Performance improvement: ${((directTime - pgbouncerTime) / directTime * 100).toFixed(1)}%`);
}

// Example 6: Environment-based configuration
function createConfigFromEnv() {
    return {
        // Use environment variables for configuration
        host: process.env.PGBOUNCER_HOST || 'localhost',
        port: parseInt(process.env.PGBOUNCER_PORT) || 6432,
        database: process.env.POSTGRES_DB || 'subscription_platform',
        user: process.env.POSTGRES_USER || 'subscription_user',
        password: process.env.POSTGRES_PASSWORD || 'subscription_pass_2024',

        // Pool configuration
        max: parseInt(process.env.POOL_MAX_CONNECTIONS) || 75,
        idleTimeoutMillis: parseInt(process.env.POOL_IDLE_TIMEOUT) || 10000,
        connectionTimeoutMillis: parseInt(process.env.POOL_CONNECTION_TIMEOUT) || 5000,

        // SSL configuration
        ssl: process.env.POSTGRES_SSL === 'true',

        application_name: process.env.APP_NAME || 'subscription_platform'
    };
}

// Example 7: Graceful shutdown
async function gracefulShutdown() {
    console.log('\n🛑 Shutting down database connections...');

    try {
        await directPool.end();
        console.log('✅ Direct pool closed');

        await pgbouncerPool.end();
        console.log('✅ PgBouncer pool closed');

        console.log('✅ All database connections closed gracefully');
    } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
    }
}

// =====================================================
// MAIN EXECUTION
// =====================================================

async function main() {
    try {
        // Run connection tests
        await testConnections();

        // Run stress test (uncomment for testing)
        // await stressTestConnections(100);

        // Example transaction
        // const userId = '550e8400-e29b-41d4-a716-446655440000'; // Example UUID
        // await handleTransactionWithPgBouncer(userId, 9.99, 'spotify');

    } catch (error) {
        console.error('❌ Main execution error:', error.message);
    }
}

// Handle process termination
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Export for use in other modules
module.exports = {
    directPool,
    pgbouncerPool,
    queryDirectConnection,
    queryPgBouncerConnection,
    handleTransactionWithPgBouncer,
    testConnections,
    stressTestConnections,
    gracefulShutdown,
    createConfigFromEnv
};

// Run if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}