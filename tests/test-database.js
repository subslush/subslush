// =====================================================
// Comprehensive Database Testing Suite
// =====================================================
// Description: Complete database connectivity and CRUD testing
// Uses Node.js built-in test framework (node:test)

const { test: baseTest, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');

const testConfig = require('./test-config');
const testData = require('./test-data');

// Test utilities and helpers
class DatabaseTestSuite {
    constructor() {
        this.pools = new Map();
        this.testResults = {
            passed: 0,
            failed: 0,
            skipped: 0,
            performance: {}
        };
        this.cleanupTasks = [];
    }

    /**
     * Initialize database connection pool
     */
    async initializePool(config, name = 'default') {
        try {
            const pool = new Pool(config);
            this.pools.set(name, pool);

            // Test connection
            const client = await pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            console.log(`✅ Database pool initialized: ${name}`);
            return pool;
        } catch (error) {
            console.error(`❌ Failed to initialize pool ${name}:`, error.message);
            throw error;
        }
    }

    /**
     * Close all database pools
     */
    async closeAllPools() {
        for (const [name, pool] of this.pools) {
            try {
                await pool.end();
                console.log(`✅ Pool closed: ${name}`);
            } catch (error) {
                console.error(`⚠️  Error closing pool ${name}:`, error.message);
            }
        }
        this.pools.clear();
    }

    /**
     * Execute query with timing
     */
    async executeTimedQuery(pool, query, params = []) {
        const startTime = process.hrtime.bigint();
        try {
            const result = await pool.query(query, params);
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1000000;

            return {
                result,
                duration: durationMs,
                success: true
            };
        } catch (error) {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1000000;

            return {
                error,
                duration: durationMs,
                success: false
            };
        }
    }

    /**
     * Clean up test data
     */
    async cleanupTestData(pool) {
        const nonUserTables = ['admin_tasks', 'credits', 'subscriptions'];

        for (const table of nonUserTables) {
            try {
                const result = await pool.query(`
                    WITH to_delete AS (
                        SELECT id
                        FROM ${table}
                        WHERE created_at > NOW() - INTERVAL '1 hour'
                        LIMIT 10000
                    )
                    DELETE FROM ${table}
                    WHERE id IN (SELECT id FROM to_delete)
                `);
                console.log(`🧹 Cleaned ${result.rowCount} rows from ${table}`);
            } catch (error) {
                console.warn(`⚠️  Cleanup warning for ${table}:`, error.message);
            }
        }

        try {
            const result = await pool.query(`
                WITH to_delete AS (
                    SELECT id
                    FROM users
                    WHERE created_at > NOW() - INTERVAL '1 hour'
                       OR email LIKE '%@test.com'
                       OR email LIKE '%@example.com'
                    LIMIT 10000
                )
                DELETE FROM users
                WHERE id IN (SELECT id FROM to_delete)
            `);
            console.log(`🧹 Cleaned ${result.rowCount} rows from users`);
        } catch (error) {
            console.warn(`⚠️  Cleanup warning for users:`, error.message);
        }
    }

    /**
     * Add cleanup task
     */
    addCleanupTask(task) {
        this.cleanupTasks.push(task);
    }

    /**
     * Execute all cleanup tasks
     */
    async executeCleanup() {
        for (const task of this.cleanupTasks) {
            try {
                await task();
            } catch (error) {
                console.warn('⚠️  Cleanup task failed:', error.message);
            }
        }
        this.cleanupTasks = [];
    }
}

// Global test suite instance
const dbTest = new DatabaseTestSuite();

const test = (...args) => {
    let name;
    let options;
    let fn;

    if (typeof args[0] === 'function') {
        fn = args[0];
    } else if (typeof args[1] === 'function') {
        name = args[0];
        fn = args[1];
    } else {
        name = args[0];
        options = args[1];
        fn = args[2];
    }

    const skipTracker = { skipped: false };
    const wrappedFn = fn
        ? async (...fnArgs) => {
              const t = fnArgs[0];
              if (t && typeof t.skip === 'function') {
                  const originalSkip = t.skip.bind(t);
                  t.skip = (message) => {
                      skipTracker.skipped = true;
                      dbTest.testResults.skipped += 1;
                      return originalSkip(message);
                  };
              }
              return fn(...fnArgs);
          }
        : undefined;

    const testPromise =
        options !== undefined
            ? baseTest(name, options, wrappedFn)
            : baseTest(name, wrappedFn);

    testPromise
        .then(() => {
            if (!skipTracker.skipped) {
                dbTest.testResults.passed += 1;
            }
        })
        .catch(() => {
            if (!skipTracker.skipped) {
                dbTest.testResults.failed += 1;
            }
        });

    return testPromise;
};

// =====================================================
// TEST SUITE SETUP AND TEARDOWN
// =====================================================

describe('Database Test Suite', () => {
    before(async () => {
        console.log('\n🚀 Starting Database Test Suite');
        console.log('================================');

        testConfig.logSummary();

        // Initialize database pools for all configurations
        const configs = testConfig.getAllConfigs();

        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            const name = config.port === 5432 ? 'postgres' : 'pgbouncer';

            try {
                await dbTest.initializePool(config, name);
            } catch (error) {
                console.warn(`⚠️  Skipping ${name} tests - connection failed:`, error.message);
            }
        }

        if (dbTest.pools.size === 0) {
            throw new Error('No database connections available for testing');
        }
    });

    after(async () => {
        console.log('\n🧹 Cleaning up test environment...');

        // Execute cleanup tasks
        await dbTest.executeCleanup();

        // Clean test data from all pools
        for (const [name, pool] of dbTest.pools) {
            try {
                await dbTest.cleanupTestData(pool);
            } catch (error) {
                console.warn(`⚠️  Cleanup failed for ${name}:`, error.message);
            }
        }

        // Close all pools
        await dbTest.closeAllPools();

        // Print test summary
        console.log('\n📊 Test Summary');
        console.log('===============');
        console.log(`✅ Passed: ${dbTest.testResults.passed}`);
        console.log(`❌ Failed: ${dbTest.testResults.failed}`);
        console.log(`⏭️  Skipped: ${dbTest.testResults.skipped}`);

        if (Object.keys(dbTest.testResults.performance).length > 0) {
            console.log('\n⚡ Performance Results:');
            for (const [key, value] of Object.entries(dbTest.testResults.performance)) {
                console.log(`   ${key}: ${value}`);
            }
        }
    });

    // =====================================================
    // CONNECTION TESTING
    // =====================================================

    describe('Connection Testing', () => {
        test('Basic connectivity test', async () => {
            for (const [name, pool] of dbTest.pools) {
                const timedResult = await dbTest.executeTimedQuery(pool, 'SELECT NOW() as current_time, version() as db_version');

                assert.strictEqual(timedResult.success, true, `${name} connection should succeed`);
                assert.ok(timedResult.result.rows.length > 0, `${name} should return results`);
                assert.ok(timedResult.duration < 1000, `${name} connection should be fast (<1000ms), got ${timedResult.duration}ms`);

                console.log(`✅ ${name} connection: ${timedResult.duration.toFixed(2)}ms`);
                dbTest.testResults.performance[`${name}_connection_time`] = `${timedResult.duration.toFixed(2)}ms`;
            }
        });

        test('Authentication verification', async () => {
            // Test valid credentials (already tested above)
            for (const [name, pool] of dbTest.pools) {
                const result = await dbTest.executeTimedQuery(pool, 'SELECT current_user');
                assert.strictEqual(result.success, true, `${name} authentication should work`);
                assert.strictEqual(result.result.rows[0].current_user, testConfig.getConfig('postgres').user);
            }
        });

        test('Invalid credentials handling', async () => {
            const invalidConfig = testConfig.getInvalidConfig();

            try {
                const invalidPool = new Pool(invalidConfig);
                const client = await invalidPool.connect();
                await client.query('SELECT 1');
                client.release();
                await invalidPool.end();

                // If we get here, the test should fail
                assert.fail('Invalid credentials should not allow connection');
            } catch (error) {
                // This is expected
                assert.ok(error.message.includes('authentication') || error.message.includes('connection'), 'Should get authentication or connection error');
                console.log('✅ Invalid credentials properly rejected');
            }
        });

        test('Connection timeout handling', async () => {
            const timeoutConfig = {
                ...testConfig.getConfig('postgres'),
                host: '192.0.2.1', // Non-routable IP for timeout testing
                connectionTimeoutMillis: 1000
            };

            const startTime = Date.now();
            try {
                const timeoutPool = new Pool(timeoutConfig);
                const client = await timeoutPool.connect();
                client.release();
                await timeoutPool.end();

                assert.fail('Connection to non-routable IP should timeout');
            } catch (error) {
                const duration = Date.now() - startTime;
                assert.ok(duration < 2000, `Timeout should occur within 2 seconds, got ${duration}ms`);
                assert.ok(error.message.includes('timeout') || error.message.includes('ECONNREFUSED'), 'Should get timeout or connection refused error');
                console.log(`✅ Connection timeout handled properly: ${duration}ms`);
            }
        });

        test('Connection pool behavior', async () => {
            for (const [name, pool] of dbTest.pools) {
                // Test multiple concurrent connections
                const promises = [];
                for (let i = 0; i < 5; i++) {
                    promises.push(dbTest.executeTimedQuery(pool, 'SELECT pg_sleep(0.1), $1 as test_id', [i]));
                }

                const results = await Promise.all(promises);

                for (let i = 0; i < results.length; i++) {
                    assert.strictEqual(results[i].success, true, `${name} concurrent query ${i} should succeed`);
                    assert.strictEqual(parseInt(results[i].result.rows[0].test_id), i, `${name} query ${i} should return correct ID`);
                }

                console.log(`✅ ${name} connection pool handles concurrent connections`);
            }
        });

        test('Concurrent connection stress test', async () => {
            const stressConfig = testConfig.getStressTestConfig();
            const connectionCount = Math.min(stressConfig.connections, 20); // Limit for test environment

            for (const [name, pool] of dbTest.pools) {
                console.log(`🔥 Stress testing ${name} with ${connectionCount} connections...`);

                const startTime = Date.now();
                const promises = [];

                for (let i = 0; i < connectionCount; i++) {
                    promises.push(dbTest.executeTimedQuery(pool, 'SELECT $1 as connection_id, pg_backend_pid() as pid', [i]));
                }

                const results = await Promise.all(promises);
                const duration = Date.now() - startTime;

                // Verify all connections succeeded
                const successCount = results.filter(r => r.success).length;
                assert.strictEqual(successCount, connectionCount, `${name} all stress test connections should succeed`);

                // Check for unique backend PIDs (different connections)
                const pids = new Set(results.map(r => r.result.rows[0].pid));
                assert.ok(pids.size > 1, `${name} should use multiple backend connections`);

                console.log(`✅ ${name} stress test: ${connectionCount} connections in ${duration}ms`);
                dbTest.testResults.performance[`${name}_stress_test`] = `${connectionCount} connections in ${duration}ms`;
            }
        });
    });

    // =====================================================
    // SCHEMA VALIDATION TESTING
    // =====================================================

    describe('Schema Validation', () => {
        test('Verify all tables exist', async () => {
            const expectedTables = ['users', 'subscriptions', 'credits', 'admin_tasks', 'schema_migrations'];

            for (const [name, pool] of dbTest.pools) {
                const result = await dbTest.executeTimedQuery(pool, `
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                `);

                assert.strictEqual(result.success, true, `${name} should query tables successfully`);

                const actualTables = result.result.rows.map(row => row.table_name);

                for (const expectedTable of expectedTables) {
                    assert.ok(actualTables.includes(expectedTable), `${name} should have table: ${expectedTable}`);
                }

                console.log(`✅ ${name} all required tables exist:`, actualTables.join(', '));
            }
        });

        test('Verify table structures', async () => {
            const tableColumns = {
                users: ['id', 'email', 'created_at', 'last_login', 'status'],
                subscriptions: ['id', 'user_id', 'service_type', 'service_plan', 'start_date', 'end_date', 'renewal_date', 'credentials_encrypted', 'status', 'metadata', 'created_at'],
                credits: ['id', 'user_id', 'amount', 'transaction_type', 'transaction_hash', 'created_at', 'description'],
                admin_tasks: ['id', 'subscription_id', 'task_type', 'due_date', 'completed_at', 'assigned_admin', 'notes', 'priority', 'created_at']
            };

            for (const [name, pool] of dbTest.pools) {
                for (const [tableName, expectedColumns] of Object.entries(tableColumns)) {
                    const result = await dbTest.executeTimedQuery(pool, `
                        SELECT column_name, data_type, is_nullable
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                        AND table_name = $1
                        ORDER BY ordinal_position
                    `, [tableName]);

                    assert.strictEqual(result.success, true, `${name} should query ${tableName} columns`);

                    const actualColumns = result.result.rows.map(row => row.column_name);

                    for (const expectedColumn of expectedColumns) {
                        assert.ok(actualColumns.includes(expectedColumn), `${name} table ${tableName} should have column: ${expectedColumn}`);
                    }

                    console.log(`✅ ${name} ${tableName} structure verified`);
                }
            }
        });

        test('Verify foreign key constraints', async () => {
            const foreignKeys = {
                'subscriptions.user_id': 'users.id',
                'credits.user_id': 'users.id',
                'admin_tasks.subscription_id': 'subscriptions.id',
                'admin_tasks.assigned_admin': 'users.id'
            };

            for (const [name, pool] of dbTest.pools) {
                const result = await dbTest.executeTimedQuery(pool, `
                    SELECT
                        tc.table_name,
                        kcu.column_name,
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                        ON tc.constraint_name = kcu.constraint_name
                    JOIN information_schema.constraint_column_usage AS ccu
                        ON ccu.constraint_name = tc.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = 'public'
                `);

                assert.strictEqual(result.success, true, `${name} should query foreign keys`);

                const actualForeignKeys = new Set();
                result.result.rows.forEach(row => {
                    actualForeignKeys.add(`${row.table_name}.${row.column_name}`);
                });

                for (const expectedFK of Object.keys(foreignKeys)) {
                    assert.ok(actualForeignKeys.has(expectedFK), `${name} should have foreign key: ${expectedFK}`);
                }

                console.log(`✅ ${name} foreign key constraints verified`);
            }
        });

        test('Verify check constraints', async () => {
            for (const [name, pool] of dbTest.pools) {
                // Test user status constraint
                try {
                    await pool.query("INSERT INTO users (email, status) VALUES ('test@invalid.com', 'invalid_status')");
                    assert.fail(`${name} should reject invalid user status`);
                } catch (error) {
                    assert.ok(error.message.includes('check constraint'), `${name} should enforce user status constraint`);
                }

                // Test positive amount constraint
                try {
                    const userId = testData.generateUUID();
                    await pool.query("INSERT INTO users (id, email) VALUES ($1, 'test@constraint.com')", [userId]);
                    await pool.query("INSERT INTO credits (user_id, amount, transaction_type) VALUES ($1, -10.00, 'deposit')", [userId]);
                    assert.fail(`${name} should reject negative amounts`);
                } catch (error) {
                    assert.ok(error.message.includes('check constraint') || error.message.includes('violates'), `${name} should enforce positive amount constraint`);
                }

                console.log(`✅ ${name} check constraints working`);
            }
        });

        test('Verify unique constraints', async () => {
            for (const [name, pool] of dbTest.pools) {
                const testEmail = `unique-test-${Date.now()}@test.com`;

                // Insert first user
                await pool.query("INSERT INTO users (email) VALUES ($1)", [testEmail]);

                // Try to insert duplicate email
                try {
                    await pool.query("INSERT INTO users (email) VALUES ($1)", [testEmail]);
                    assert.fail(`${name} should reject duplicate email`);
                } catch (error) {
                    assert.ok(error.message.includes('unique') || error.message.includes('duplicate'), `${name} should enforce email uniqueness`);
                }

                // Cleanup
                await pool.query("DELETE FROM users WHERE email = $1", [testEmail]);

                console.log(`✅ ${name} unique constraints working`);
            }
        });

        test('Verify UUID generation', async () => {
            for (const [name, pool] of dbTest.pools) {
                const testEmail = `uuid-test-${Date.now()}@test.com`;

                const result = await dbTest.executeTimedQuery(pool, "INSERT INTO users (email) VALUES ($1) RETURNING id", [testEmail]);

                assert.strictEqual(result.success, true, `${name} should insert with auto-generated UUID`);

                const generatedId = result.result.rows[0].id;
                assert.ok(generatedId, `${name} should generate UUID`);
                assert.match(generatedId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, `${name} should generate valid UUID format`);

                // Cleanup
                await pool.query("DELETE FROM users WHERE email = $1", [testEmail]);

                console.log(`✅ ${name} UUID generation working`);
            }
        });

        test('Verify JSONB functionality', async () => {
            for (const [name, pool] of dbTest.pools) {
                const testUser = testData.generateUser();
                const testSubscription = testData.generateSubscription(testUser.id);

                // Insert test user and subscription
                await pool.query("INSERT INTO users (id, email) VALUES ($1, $2)", [testUser.id, testUser.email]);
                await pool.query(`
                    INSERT INTO subscriptions (id, user_id, service_type, service_plan, start_date, end_date, renewal_date, status, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    testSubscription.id, testSubscription.user_id, testSubscription.service_type,
                    testSubscription.service_plan, testSubscription.start_date, testSubscription.end_date,
                    testSubscription.renewal_date, testSubscription.status, JSON.stringify(testSubscription.metadata)
                ]);

                // Test JSONB queries
                const result = await dbTest.executeTimedQuery(pool, `
                    SELECT metadata, metadata->>'region' as region, metadata->>'payment_method' as payment_method
                    FROM subscriptions
                    WHERE id = $1
                `, [testSubscription.id]);

                assert.strictEqual(result.success, true, `${name} should query JSONB data`);
                assert.strictEqual(result.result.rows[0].region, testSubscription.metadata.region, `${name} should extract JSONB field`);
                assert.strictEqual(result.result.rows[0].payment_method, testSubscription.metadata.payment_method, `${name} should extract JSONB field`);

                // Cleanup
                await pool.query("DELETE FROM subscriptions WHERE id = $1", [testSubscription.id]);
                await pool.query("DELETE FROM users WHERE id = $1", [testUser.id]);

                console.log(`✅ ${name} JSONB functionality working`);
            }
        });
    });

    // =====================================================
    // MULTI-ITEM CHECKOUT FOUNDATIONS
    // =====================================================

    describe('Multi-item checkout schema', () => {
        test('payment_events and payment_items tables exist', async () => {
            for (const [name, pool] of dbTest.pools) {
                const result = await dbTest.executeTimedQuery(pool, `
                    SELECT
                        to_regclass('public.payment_events') AS payment_events,
                        to_regclass('public.payment_items') AS payment_items
                `);

                assert.strictEqual(result.success, true, `${name} should query table registry`);
                assert.ok(result.result.rows[0].payment_events, `${name} should have payment_events table`);
                assert.ok(result.result.rows[0].payment_items, `${name} should have payment_items table`);
            }
        });

        test('core multi-item columns exist', async () => {
            const columnChecks = [
                { table: 'users', column: 'is_guest' },
                { table: 'orders', column: 'checkout_session_key' },
                { table: 'orders', column: 'stripe_session_id' },
                { table: 'order_items', column: 'coupon_discount_cents' },
                { table: 'subscriptions', column: 'order_item_id' },
                { table: 'payments', column: 'checkout_mode' },
                { table: 'payments', column: 'order_item_id' },
                { table: 'credit_transactions', column: 'order_item_id' },
                { table: 'coupons', column: 'apply_scope' },
            ];

            for (const [name, pool] of dbTest.pools) {
                for (const check of columnChecks) {
                    const result = await dbTest.executeTimedQuery(pool, `
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = $1
                          AND column_name = $2
                        LIMIT 1
                    `, [check.table, check.column]);

                    assert.strictEqual(result.success, true, `${name} should query column metadata`);
                    assert.ok(
                        result.result.rows.length > 0,
                        `${name} should have column ${check.table}.${check.column}`
                    );
                }
            }
        });

        test('guest_claim_tokens enforce unique token hashes', async () => {
            for (const [name, pool] of dbTest.pools) {
                const guestId = testData.generateUUID();
                const tokenHash = `token-${Date.now()}-${Math.random()}`;
                const email = `guest-${Date.now()}@example.com`;

                await pool.query(
                    `INSERT INTO guest_identities (id, email) VALUES ($1, $2)`,
                    [guestId, email]
                );

                await pool.query(
                    `INSERT INTO guest_claim_tokens
                     (guest_identity_id, token_hash, expires_at)
                     VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
                    [guestId, tokenHash]
                );

                try {
                    await pool.query(
                        `INSERT INTO guest_claim_tokens
                         (guest_identity_id, token_hash, expires_at)
                         VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
                        [guestId, tokenHash]
                    );
                    assert.fail(`${name} should reject duplicate guest claim token hash`);
                } catch (error) {
                    assert.ok(
                        error.message.includes('unique') || error.message.includes('duplicate'),
                        `${name} should enforce guest_claim_tokens uniqueness`
                    );
                } finally {
                    await pool.query('DELETE FROM guest_claim_tokens WHERE guest_identity_id = $1', [guestId]);
                    await pool.query('DELETE FROM guest_identities WHERE id = $1', [guestId]);
                }
            }
        });

        test('subscription order_item_id backfill works for single-item orders', async () => {
            for (const [name, pool] of dbTest.pools) {
                const userId = testData.generateUUID();
                const orderId = testData.generateUUID();
                const orderItemId = testData.generateUUID();
                const subscriptionId = testData.generateUUID();
                const email = `backfill-${Date.now()}@example.com`;

                await pool.query(
                    'INSERT INTO users (id, email) VALUES ($1, $2)',
                    [userId, email]
                );

                await pool.query(
                    `INSERT INTO orders (id, user_id, status)
                     VALUES ($1, $2, 'cart')`,
                    [orderId, userId]
                );

                await pool.query(
                    `INSERT INTO order_items
                     (id, order_id, quantity, unit_price_cents, currency, total_price_cents)
                     VALUES ($1, $2, 1, 1000, 'USD', 1000)`,
                    [orderItemId, orderId]
                );

                await pool.query(
                    `INSERT INTO subscriptions
                     (id, user_id, service_type, service_plan, start_date, end_date, renewal_date, status, order_id)
                     VALUES ($1, $2, 'spotify', 'premium', NOW(), NOW() + INTERVAL '30 days', NULL, 'active', $3)`,
                    [subscriptionId, userId, orderId]
                );

                await pool.query(
                    `
                    WITH single_order_items AS (
                      SELECT order_id, MIN(id) AS order_item_id
                      FROM order_items
                      GROUP BY order_id
                      HAVING COUNT(*) = 1
                    )
                    UPDATE subscriptions s
                    SET order_item_id = soi.order_item_id
                    FROM single_order_items soi
                    WHERE s.order_id = soi.order_id
                      AND s.order_item_id IS NULL
                    `
                );

                const result = await pool.query(
                    'SELECT order_item_id FROM subscriptions WHERE id = $1',
                    [subscriptionId]
                );
                assert.strictEqual(
                    result.rows[0].order_item_id,
                    orderItemId,
                    `${name} should backfill order_item_id for single-item order`
                );

                await pool.query('DELETE FROM subscriptions WHERE id = $1', [subscriptionId]);
                await pool.query('DELETE FROM order_items WHERE id = $1', [orderItemId]);
                await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
                await pool.query('DELETE FROM users WHERE id = $1', [userId]);
            }
        });

        test('allocation parity and payment-item enforcement triggers', async () => {
            for (const [name, pool] of dbTest.pools) {
                const userId = testData.generateUUID();
                const orderId = testData.generateUUID();
                const orderItemId = testData.generateUUID();
                const orderItemId2 = testData.generateUUID();
                const paymentId = testData.generateUUID();
                const email = `allocation-${Date.now()}@example.com`;

                await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, email]);

                // Happy path should commit cleanly
                {
                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        await client.query(
                            `INSERT INTO orders
                             (id, user_id, status, currency, subtotal_cents, discount_cents, coupon_discount_cents, total_cents)
                             VALUES ($1, $2, 'pending_payment', 'USD', 1000, 0, 100, 900)`,
                            [orderId, userId]
                        );
                        await client.query(
                            `INSERT INTO order_items
                             (id, order_id, quantity, unit_price_cents, currency, total_price_cents, coupon_discount_cents)
                             VALUES ($1, $2, 1, 900, 'USD', 900, 100)`,
                            [orderItemId, orderId]
                        );
                        await client.query(
                            `INSERT INTO payments
                             (id, user_id, provider, provider_payment_id, status, purpose, amount, currency, order_item_id)
                             VALUES ($1, $2, 'stripe', $3, 'pending', 'subscription', 9, 'USD', $4)`,
                            [paymentId, userId, `pi_${Date.now()}`, orderItemId]
                        );
                        await client.query(
                            `INSERT INTO payment_items
                             (payment_id, order_item_id, allocated_subtotal_cents, allocated_discount_cents, allocated_total_cents)
                             VALUES ($1, $2, 1000, 100, 900)`,
                            [paymentId, orderItemId]
                        );
                        await client.query('COMMIT');
                    } catch (error) {
                        await client.query('ROLLBACK');
                        throw error;
                    } finally {
                        client.release();
                    }
                }

                // Mismatch should fail on commit (deferrable trigger)
                {
                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        await client.query(
                            `UPDATE order_items SET coupon_discount_cents = 0 WHERE id = $1`,
                            [orderItemId]
                        );
                        await client.query('COMMIT');
                        assert.fail(`${name} should reject coupon allocation mismatch`);
                    } catch (error) {
                        await client.query('ROLLBACK');
                        assert.ok(
                            error.message.includes('Order coupon allocation mismatch'),
                            `${name} should enforce coupon allocation parity`
                        );
                    } finally {
                        client.release();
                    }
                }

                // Payment items count > 1 must force payments.order_item_id = NULL
                {
                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        await client.query(
                            `INSERT INTO order_items
                             (id, order_id, quantity, unit_price_cents, currency, total_price_cents, coupon_discount_cents)
                             VALUES ($1, $2, 1, 0, 'USD', 0, 0)`,
                            [orderItemId2, orderId]
                        );
                        await client.query(
                            `INSERT INTO payment_items
                             (payment_id, order_item_id, allocated_subtotal_cents, allocated_discount_cents, allocated_total_cents)
                             VALUES ($1, $2, 0, 0, 0)`,
                            [paymentId, orderItemId2]
                        );
                        await client.query('COMMIT');
                        assert.fail(`${name} should reject multiple items with payment order_item_id set`);
                    } catch (error) {
                        await client.query('ROLLBACK');
                        assert.ok(
                            error.message.includes('payments.order_item_id must be NULL') ||
                            error.message.includes('payments.order_item_id must match'),
                            `${name} should enforce payment item singleton constraint`
                        );
                    } finally {
                        client.release();
                    }
                }

                await pool.query('DELETE FROM payment_items WHERE payment_id = $1', [paymentId]);
                await pool.query('DELETE FROM payments WHERE id = $1', [paymentId]);
                await pool.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
                await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
                await pool.query('DELETE FROM users WHERE id = $1', [userId]);
            }
        });
    });

    // =====================================================
    // CRUD OPERATIONS TESTING
    // =====================================================

    describe('CRUD Operations', () => {
        let poolDatasets = new Map();

        const buildCrudDataset = () => {
            const users = testData.generateUsers(3);
            const subscriptions = [];
            const credits = [];
            const tasks = [];

            users.forEach(user => {
                const userSubscriptions = testData.generateSubscriptions(user.id, 2);
                const userCredits = testData.generateCredits(user.id, 3);

                subscriptions.push(...userSubscriptions);
                credits.push(...userCredits);

                userSubscriptions.forEach(sub => {
                    const subTasks = testData.generateAdminTasks(sub.id, user.id, 1);
                    tasks.push(...subTasks);
                });
            });

            return { users, subscriptions, credits, tasks };
        };

        const getPoolDataset = (name) => {
            const dataset = poolDatasets.get(name);
            if (!dataset) {
                throw new Error(`Missing CRUD dataset for pool: ${name}`);
            }
            return dataset;
        };

        beforeEach(() => {
            poolDatasets = new Map();
            for (const [name] of dbTest.pools) {
                poolDatasets.set(name, buildCrudDataset());
            }
        });

        afterEach(async () => {
            // Clean up test data after each test
            for (const [name, pool] of dbTest.pools) {
                const dataset = poolDatasets.get(name);
                if (!dataset) continue;
                try {
                    const userIds = dataset.users.map(u => `'${u.id}'`).join(',');
                    if (userIds) {
                        await pool.query(`DELETE FROM admin_tasks WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id IN (${userIds}))`);
                        await pool.query(`DELETE FROM credits WHERE user_id IN (${userIds})`);
                        await pool.query(`DELETE FROM subscriptions WHERE user_id IN (${userIds})`);
                        await pool.query(`DELETE FROM users WHERE id IN (${userIds})`);
                    }
                } catch (error) {
                    console.warn(`⚠️  Cleanup warning for ${name}:`, error.message);
                }
            }
        });

        describe('CREATE Operations', () => {
            test('Insert users with various data combinations', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { users } = getPoolDataset(name);
                    for (const user of users) {
                        const result = await dbTest.executeTimedQuery(pool, `
                            INSERT INTO users (id, email, created_at, last_login, status)
                            VALUES ($1, $2, $3, $4, $5)
                            RETURNING *
                        `, [user.id, user.email, user.created_at, user.last_login, user.status]);

                        assert.strictEqual(result.success, true, `${name} should insert user`);
                        assert.strictEqual(result.result.rows[0].email, user.email, `${name} should return correct email`);
                        assert.strictEqual(result.result.rows[0].status, user.status, `${name} should return correct status`);
                    }

                    console.log(`✅ ${name} inserted ${users.length} users`);
                }
            });

            test('Create subscriptions with foreign key relationships', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { users, subscriptions } = getPoolDataset(name);
                    // First insert users
                    for (const user of users) {
                        await pool.query("INSERT INTO users (id, email, status) VALUES ($1, $2, $3)", [user.id, user.email, user.status]);
                    }

                    // Then insert subscriptions
                    for (const subscription of subscriptions) {
                        const result = await dbTest.executeTimedQuery(pool, `
                            INSERT INTO subscriptions (id, user_id, service_type, service_plan, start_date, end_date, renewal_date, status, metadata)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                            RETURNING *
                        `, [
                            subscription.id, subscription.user_id, subscription.service_type,
                            subscription.service_plan, subscription.start_date, subscription.end_date,
                            subscription.renewal_date, subscription.status, JSON.stringify(subscription.metadata)
                        ]);

                        assert.strictEqual(result.success, true, `${name} should insert subscription`);
                        assert.strictEqual(result.result.rows[0].user_id, subscription.user_id, `${name} should maintain foreign key`);
                        assert.strictEqual(result.result.rows[0].service_type, subscription.service_type, `${name} should return correct service type`);
                    }

                    console.log(`✅ ${name} inserted ${subscriptions.length} subscriptions`);
                }
            });

            test('Add credits with different transaction types', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { users, credits } = getPoolDataset(name);
                    // Insert users first
                    for (const user of users) {
                        await pool.query("INSERT INTO users (id, email, status) VALUES ($1, $2, $3)", [user.id, user.email, user.status]);
                    }

                    // Insert credits
                    for (const credit of credits) {
                        const result = await dbTest.executeTimedQuery(pool, `
                            INSERT INTO credits (id, user_id, amount, transaction_type, transaction_hash, created_at, description)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                            RETURNING *
                        `, [
                            credit.id, credit.user_id, credit.amount, credit.transaction_type,
                            credit.transaction_hash, credit.created_at, credit.description
                        ]);

                        assert.strictEqual(result.success, true, `${name} should insert credit`);
                        assert.strictEqual(result.result.rows[0].transaction_type, credit.transaction_type, `${name} should return correct transaction type`);
                        assert.strictEqual(parseFloat(result.result.rows[0].amount), credit.amount, `${name} should return correct amount`);
                    }

                    console.log(`✅ ${name} inserted ${credits.length} credits`);
                }
            });

            test('Create admin tasks with proper references', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { users, subscriptions, tasks } = getPoolDataset(name);
                    // Insert prerequisite data
                    for (const user of users) {
                        await pool.query("INSERT INTO users (id, email, status) VALUES ($1, $2, $3)", [user.id, user.email, user.status]);
                    }

                    for (const subscription of subscriptions) {
                        await pool.query(`
                            INSERT INTO subscriptions (id, user_id, service_type, service_plan, start_date, end_date, renewal_date, status)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        `, [
                            subscription.id, subscription.user_id, subscription.service_type,
                            subscription.service_plan, subscription.start_date, subscription.end_date,
                            subscription.renewal_date, subscription.status
                        ]);
                    }

                    // Insert admin tasks
                    for (const task of tasks) {
                        const result = await dbTest.executeTimedQuery(pool, `
                            INSERT INTO admin_tasks (id, subscription_id, task_type, due_date, completed_at, assigned_admin, notes, priority, created_at)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                            RETURNING *
                        `, [
                            task.id, task.subscription_id, task.task_type, task.due_date,
                            task.completed_at, task.assigned_admin, task.notes, task.priority, task.created_at
                        ]);

                        assert.strictEqual(result.success, true, `${name} should insert admin task`);
                        assert.strictEqual(result.result.rows[0].subscription_id, task.subscription_id, `${name} should maintain subscription reference`);
                        assert.strictEqual(result.result.rows[0].task_type, task.task_type, `${name} should return correct task type`);
                    }

                    console.log(`✅ ${name} inserted ${tasks.length} admin tasks`);
                }
            });
        });

        describe('READ Operations', () => {
            beforeEach(async () => {
                // Insert all test data
                for (const [name, pool] of dbTest.pools) {
                    const { users, subscriptions, credits, tasks } = getPoolDataset(name);
                    // Insert users
                    for (const user of users) {
                        await pool.query("INSERT INTO users (id, email, created_at, last_login, status) VALUES ($1, $2, $3, $4, $5)",
                            [user.id, user.email, user.created_at, user.last_login, user.status]);
                    }

                    // Insert subscriptions
                    for (const subscription of subscriptions) {
                        await pool.query(`
                            INSERT INTO subscriptions (id, user_id, service_type, service_plan, start_date, end_date, renewal_date, status, metadata)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        `, [
                            subscription.id, subscription.user_id, subscription.service_type,
                            subscription.service_plan, subscription.start_date, subscription.end_date,
                            subscription.renewal_date, subscription.status, JSON.stringify(subscription.metadata)
                        ]);
                    }

                    // Insert credits
                    for (const credit of credits) {
                        await pool.query(`
                            INSERT INTO credits (id, user_id, amount, transaction_type, transaction_hash, created_at, description)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                        `, [
                            credit.id, credit.user_id, credit.amount, credit.transaction_type,
                            credit.transaction_hash, credit.created_at, credit.description
                        ]);
                    }

                    // Insert admin tasks
                    for (const task of tasks) {
                        await pool.query(`
                            INSERT INTO admin_tasks (id, subscription_id, task_type, due_date, completed_at, assigned_admin, notes, priority, created_at)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        `, [
                            task.id, task.subscription_id, task.task_type, task.due_date,
                            task.completed_at, task.assigned_admin, task.notes, task.priority, task.created_at
                        ]);
                    }
                }
            });

            test('Query users by email and status', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { users } = getPoolDataset(name);
                    const testUser = users[0];

                    // Query by email
                    const emailResult = await dbTest.executeTimedQuery(pool,
                        "SELECT * FROM users WHERE email = $1", [testUser.email]);

                    assert.strictEqual(emailResult.success, true, `${name} should query by email`);
                    assert.strictEqual(emailResult.result.rows.length, 1, `${name} should find one user by email`);
                    assert.strictEqual(emailResult.result.rows[0].id, testUser.id, `${name} should return correct user`);

                    // Query by status
                    const statusResult = await dbTest.executeTimedQuery(pool,
                        "SELECT * FROM users WHERE status = $1", [testUser.status]);

                    assert.strictEqual(statusResult.success, true, `${name} should query by status`);
                    assert.ok(statusResult.result.rows.length > 0, `${name} should find users by status`);

                    console.log(`✅ ${name} user queries working (${emailResult.duration.toFixed(2)}ms)`);
                }
            });

            test('Fetch subscriptions by user_id and service_type', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { users, subscriptions } = getPoolDataset(name);
                    const testUser = users[0];
                    const userSubscriptions = subscriptions.filter(s => s.user_id === testUser.id);

                    // Query by user_id
                    const userResult = await dbTest.executeTimedQuery(pool,
                        "SELECT * FROM subscriptions WHERE user_id = $1", [testUser.id]);

                    assert.strictEqual(userResult.success, true, `${name} should query subscriptions by user_id`);
                    assert.strictEqual(userResult.result.rows.length, userSubscriptions.length, `${name} should return all user subscriptions`);

                    // Query by service_type
                    const serviceType = userSubscriptions[0].service_type;
                    const serviceResult = await dbTest.executeTimedQuery(pool,
                        "SELECT * FROM subscriptions WHERE service_type = $1", [serviceType]);

                    assert.strictEqual(serviceResult.success, true, `${name} should query subscriptions by service_type`);
                    assert.ok(serviceResult.result.rows.length > 0, `${name} should find subscriptions by service type`);

                    console.log(`✅ ${name} subscription queries working (${userResult.duration.toFixed(2)}ms)`);
                }
            });

            test('Calculate credit balances for users', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { users } = getPoolDataset(name);
                    const testUser = users[0];

                    const balanceResult = await dbTest.executeTimedQuery(pool, `
                        SELECT
                            user_id,
                            SUM(CASE WHEN transaction_type IN ('deposit', 'bonus', 'refund') THEN amount ELSE 0 END) as credits,
                            SUM(CASE WHEN transaction_type IN ('purchase', 'withdrawal') THEN amount ELSE 0 END) as debits,
                            SUM(CASE WHEN transaction_type IN ('deposit', 'bonus', 'refund') THEN amount ELSE -amount END) as balance
                        FROM credits
                        WHERE user_id = $1
                        GROUP BY user_id
                    `, [testUser.id]);

                    assert.strictEqual(balanceResult.success, true, `${name} should calculate credit balance`);

                    if (balanceResult.result.rows.length > 0) {
                        const balance = balanceResult.result.rows[0];
                        assert.ok(typeof balance.balance === 'string' || typeof balance.balance === 'number', `${name} should return numeric balance`);
                        assert.ok(parseFloat(balance.credits) >= 0, `${name} credits should be non-negative`);
                        assert.ok(parseFloat(balance.debits) >= 0, `${name} debits should be non-negative`);

                        console.log(`✅ ${name} balance calculation working (${balanceResult.duration.toFixed(2)}ms)`);
                    }
                }
            });

            test('Retrieve admin tasks by various filters', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { tasks } = getPoolDataset(name);
                    // Query by task type
                    const taskType = tasks[0].task_type;
                    const typeResult = await dbTest.executeTimedQuery(pool,
                        "SELECT * FROM admin_tasks WHERE task_type = $1", [taskType]);

                    assert.strictEqual(typeResult.success, true, `${name} should query tasks by type`);
                    assert.ok(typeResult.result.rows.length > 0, `${name} should find tasks by type`);

                    // Query by priority
                    const priority = tasks[0].priority;
                    const priorityResult = await dbTest.executeTimedQuery(pool,
                        "SELECT * FROM admin_tasks WHERE priority = $1", [priority]);

                    assert.strictEqual(priorityResult.success, true, `${name} should query tasks by priority`);
                    assert.ok(priorityResult.result.rows.length > 0, `${name} should find tasks by priority`);

                    // Query incomplete tasks
                    const incompleteResult = await dbTest.executeTimedQuery(pool,
                        "SELECT * FROM admin_tasks WHERE completed_at IS NULL");

                    assert.strictEqual(incompleteResult.success, true, `${name} should query incomplete tasks`);

                    console.log(`✅ ${name} admin task queries working (${typeResult.duration.toFixed(2)}ms)`);
                }
            });
        });

        describe('UPDATE Operations', () => {
            beforeEach(async () => {
                // Insert test data for updates
                for (const [name, pool] of dbTest.pools) {
                    const { users, subscriptions, credits, tasks } = getPoolDataset(name);
                    for (const user of users) {
                        await pool.query("INSERT INTO users (id, email, created_at, last_login, status) VALUES ($1, $2, $3, $4, $5)",
                            [user.id, user.email, user.created_at, user.last_login, user.status]);
                    }

                    for (const subscription of subscriptions) {
                        await pool.query(`
                            INSERT INTO subscriptions (id, user_id, service_type, service_plan, start_date, end_date, renewal_date, status)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        `, [
                            subscription.id, subscription.user_id, subscription.service_type,
                            subscription.service_plan, subscription.start_date, subscription.end_date,
                            subscription.renewal_date, subscription.status
                        ]);
                    }

                    for (const credit of credits) {
                        await pool.query(`
                            INSERT INTO credits (id, user_id, amount, transaction_type, created_at, description)
                            VALUES ($1, $2, $3, $4, $5, $6)
                        `, [credit.id, credit.user_id, credit.amount, credit.transaction_type, credit.created_at, credit.description]);
                    }

                    for (const task of tasks) {
                        await pool.query(`
                            INSERT INTO admin_tasks (id, subscription_id, task_type, due_date, assigned_admin, notes, priority, created_at)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        `, [task.id, task.subscription_id, task.task_type, task.due_date, task.assigned_admin, task.notes, task.priority, task.created_at]);
                    }
                }
            });

            test('Modify user profiles and track last_login', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { users } = getPoolDataset(name);
                    const testUser = users[0];
                    const newLoginTime = new Date();

                    const updateResult = await dbTest.executeTimedQuery(pool, `
                        UPDATE users
                        SET last_login = $1, status = $2
                        WHERE id = $3
                        RETURNING *
                    `, [newLoginTime, 'active', testUser.id]);

                    assert.strictEqual(updateResult.success, true, `${name} should update user`);
                    assert.strictEqual(updateResult.result.rows.length, 1, `${name} should update one user`);
                    assert.strictEqual(updateResult.result.rows[0].status, 'active', `${name} should update status`);

                    console.log(`✅ ${name} user update working (${updateResult.duration.toFixed(2)}ms)`);
                }
            });

            test('Update subscription status and dates', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { subscriptions } = getPoolDataset(name);
                    const testSubscription = subscriptions[0];
                    const newEndDate = testData.generateFutureDate(400);

                    const updateResult = await dbTest.executeTimedQuery(pool, `
                        UPDATE subscriptions
                        SET status = $1, end_date = $2
                        WHERE id = $3
                        RETURNING *
                    `, ['expired', newEndDate, testSubscription.id]);

                    assert.strictEqual(updateResult.success, true, `${name} should update subscription`);
                    assert.strictEqual(updateResult.result.rows.length, 1, `${name} should update one subscription`);
                    assert.strictEqual(updateResult.result.rows[0].status, 'expired', `${name} should update status`);

                    console.log(`✅ ${name} subscription update working (${updateResult.duration.toFixed(2)}ms)`);
                }
            });

            test('Complete admin tasks', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { tasks } = getPoolDataset(name);
                    const testTask = tasks[0];
                    const completionTime = new Date();

                    const updateResult = await dbTest.executeTimedQuery(pool, `
                        UPDATE admin_tasks
                        SET completed_at = $1, notes = $2
                        WHERE id = $3
                        RETURNING *
                    `, [completionTime, 'Task completed by test', testTask.id]);

                    assert.strictEqual(updateResult.success, true, `${name} should update admin task`);
                    assert.strictEqual(updateResult.result.rows.length, 1, `${name} should update one task`);
                    assert.ok(updateResult.result.rows[0].completed_at, `${name} should set completion time`);

                    console.log(`✅ ${name} admin task update working (${updateResult.duration.toFixed(2)}ms)`);
                }
            });
        });

        describe('DELETE Operations', () => {
            beforeEach(async () => {
                // Insert test data for deletion tests
                for (const [name, pool] of dbTest.pools) {
                    const { users, subscriptions, tasks } = getPoolDataset(name);
                    for (const user of users) {
                        await pool.query("INSERT INTO users (id, email, status) VALUES ($1, $2, $3)", [user.id, user.email, user.status]);
                    }

                    for (const subscription of subscriptions) {
                        await pool.query(`
                            INSERT INTO subscriptions (id, user_id, service_type, service_plan, start_date, end_date, renewal_date, status)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        `, [
                            subscription.id, subscription.user_id, subscription.service_type,
                            subscription.service_plan, subscription.start_date, subscription.end_date,
                            subscription.renewal_date, subscription.status
                        ]);
                    }

                    for (const task of tasks) {
                        await pool.query(`
                            INSERT INTO admin_tasks (id, subscription_id, task_type, due_date, created_at)
                            VALUES ($1, $2, $3, $4, $5)
                        `, [task.id, task.subscription_id, task.task_type, task.due_date, task.created_at]);
                    }
                }
            });

            test('Test cascade deletes (user -> subscriptions -> admin_tasks)', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { users } = getPoolDataset(name);
                    const testUser = users[0];

                    // Count related records before deletion
                    const beforeCounts = await dbTest.executeTimedQuery(pool, `
                        SELECT
                            (SELECT COUNT(*) FROM subscriptions WHERE user_id = $1) as subscriptions,
                            (SELECT COUNT(*) FROM admin_tasks WHERE subscription_id IN (
                                SELECT id FROM subscriptions WHERE user_id = $1
                            )) as tasks
                    `, [testUser.id]);

                    assert.strictEqual(beforeCounts.success, true, `${name} should count related records`);
                    const beforeSubs = parseInt(beforeCounts.result.rows[0].subscriptions);
                    const beforeTasks = parseInt(beforeCounts.result.rows[0].tasks);

                    // Delete the user (should cascade)
                    const deleteResult = await dbTest.executeTimedQuery(pool,
                        "DELETE FROM users WHERE id = $1", [testUser.id]);

                    assert.strictEqual(deleteResult.success, true, `${name} should delete user`);

                    // Verify cascade deletion
                    const afterCounts = await dbTest.executeTimedQuery(pool, `
                        SELECT
                            (SELECT COUNT(*) FROM subscriptions WHERE user_id = $1) as subscriptions,
                            (SELECT COUNT(*) FROM admin_tasks WHERE subscription_id IN (
                                SELECT id FROM subscriptions WHERE user_id = $1
                            )) as tasks
                    `, [testUser.id]);

                    assert.strictEqual(afterCounts.success, true, `${name} should count after deletion`);
                    assert.strictEqual(parseInt(afterCounts.result.rows[0].subscriptions), 0, `${name} should cascade delete subscriptions`);
                    assert.strictEqual(parseInt(afterCounts.result.rows[0].tasks), 0, `${name} should cascade delete admin tasks`);

                    console.log(`✅ ${name} cascade deletion working: ${beforeSubs} subscriptions, ${beforeTasks} tasks deleted`);
                }
            });

            test('Verify referential integrity', async () => {
                for (const [name, pool] of dbTest.pools) {
                    const { subscriptions } = getPoolDataset(name);
                    const testSubscription = subscriptions[0];

                    // Try to delete a user that has subscriptions (should fail if no cascade)
                    // But since we have CASCADE, let's test a different integrity constraint

                    // Try to insert a subscription with invalid user_id
                    try {
                        await pool.query(`
                            INSERT INTO subscriptions (user_id, service_type, service_plan, start_date, end_date, renewal_date, status)
                            VALUES ($1, 'spotify', 'premium', NOW(), NOW() + INTERVAL '1 year', NOW() + INTERVAL '11 months', 'active')
                        `, ['00000000-0000-0000-0000-000000000000']); // Non-existent user ID

                        assert.fail(`${name} should reject subscription with invalid user_id`);
                    } catch (error) {
                        assert.ok(error.message.includes('foreign key') || error.message.includes('violates'), `${name} should enforce foreign key constraint`);
                    }

                    console.log(`✅ ${name} referential integrity working`);
                }
            });
        });
    });

    // =====================================================
    // PERFORMANCE BASELINE TESTING
    // =====================================================

    describe('Performance Baseline Testing', () => {
        test('Insert performance: batch operations', async (t) => {
            const testSettings = testConfig.getTestSettings();
            if (!testSettings.performance) {
                t.skip('Performance testing disabled');
                return;
            }

            const batchSizes = [100, 1000];
            const performance = testConfig.getTestSettings().performance_targets;

            for (const [name, pool] of dbTest.pools) {
                for (const batchSize of batchSizes) {
                    console.log(`📊 Testing ${name} batch insert: ${batchSize} records`);

                    const batchUsers = testData.generateUsers(batchSize);
                    const startTime = Date.now();

                    // Insert users in batch
                    const values = batchUsers.map((user, i) =>
                        `($${i*5+1}, $${i*5+2}, $${i*5+3}, $${i*5+4}, $${i*5+5})`
                    ).join(', ');

                    const params = batchUsers.flatMap(user =>
                        [user.id, user.email, user.created_at, user.last_login, user.status]
                    );

                    const result = await dbTest.executeTimedQuery(pool, `
                        INSERT INTO users (id, email, created_at, last_login, status)
                        VALUES ${values}
                    `, params);

                    const duration = Date.now() - startTime;
                    const rate = Math.round(batchSize / (duration / 1000));

                    assert.strictEqual(result.success, true, `${name} batch insert should succeed`);

                    console.log(`✅ ${name} ${batchSize} records: ${duration}ms (${rate} records/sec)`);
                    dbTest.testResults.performance[`${name}_batch_${batchSize}`] = `${rate} records/sec`;

                    // Cleanup
                    const userIds = batchUsers.map(u => `'${u.id}'`).join(',');
                    await pool.query(`DELETE FROM users WHERE id IN (${userIds})`);
                }
            }
        });

        test('Query performance: simple and complex queries', async (t) => {
            const testSettings = testConfig.getTestSettings();
            if (!testSettings.performance) {
                t.skip('Performance testing disabled');
                return;
            }

            for (const [name, pool] of dbTest.pools) {
                // Setup test data per pool to avoid collisions
                const testUsers = testData.generateUsers(100);
                const testSubscriptions = [];

                testUsers.forEach(user => {
                    testSubscriptions.push(...testData.generateSubscriptions(user.id, 2));
                });

                // Insert test data
                console.log(`📊 Setting up performance test data for ${name}...`);

                for (const user of testUsers) {
                    await pool.query("INSERT INTO users (id, email, status) VALUES ($1, $2, $3)", [user.id, user.email, user.status]);
                }

                for (const subscription of testSubscriptions) {
                    await pool.query(`
                        INSERT INTO subscriptions (id, user_id, service_type, service_plan, start_date, end_date, renewal_date, status)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [
                        subscription.id, subscription.user_id, subscription.service_type,
                        subscription.service_plan, subscription.start_date, subscription.end_date,
                        subscription.renewal_date, subscription.status
                    ]);
                }

                // Test simple queries
                const simpleQuery = await dbTest.executeTimedQuery(pool,
                    "SELECT * FROM users WHERE status = 'active' LIMIT 10");

                assert.strictEqual(simpleQuery.success, true, `${name} simple query should succeed`);
                assert.ok(simpleQuery.duration < 100, `${name} simple query should be fast (<100ms), got ${simpleQuery.duration}ms`);

                // Test complex query
                const complexQuery = await dbTest.executeTimedQuery(pool, `
                    SELECT
                        u.email,
                        COUNT(s.id) as subscription_count,
                        MAX(s.end_date) as latest_expiry
                    FROM users u
                    LEFT JOIN subscriptions s ON u.id = s.user_id
                    WHERE u.status = 'active'
                    GROUP BY u.id, u.email
                    ORDER BY subscription_count DESC
                    LIMIT 20
                `);

                assert.strictEqual(complexQuery.success, true, `${name} complex query should succeed`);
                assert.ok(complexQuery.duration < 500, `${name} complex query should be reasonable (<500ms), got ${complexQuery.duration}ms`);

                console.log(`✅ ${name} query performance: simple ${simpleQuery.duration.toFixed(2)}ms, complex ${complexQuery.duration.toFixed(2)}ms`);

                dbTest.testResults.performance[`${name}_simple_query`] = `${simpleQuery.duration.toFixed(2)}ms`;
                dbTest.testResults.performance[`${name}_complex_query`] = `${complexQuery.duration.toFixed(2)}ms`;

                // Cleanup
                const userIds = testUsers.map(u => `'${u.id}'`).join(',');
                await pool.query(`DELETE FROM subscriptions WHERE user_id IN (${userIds})`);
                await pool.query(`DELETE FROM users WHERE id IN (${userIds})`);
            }
        });

        test('Connection establishment time measurement', async (t) => {
            const testSettings = testConfig.getTestSettings();
            if (!testSettings.performance) {
                t.skip('Performance testing disabled');
                return;
            }

            for (const configName of ['postgres', 'pgbouncer']) {
                if (!dbTest.pools.has(configName)) continue;

                const config = testConfig.getConfig(configName);
                const measurements = [];

                for (let i = 0; i < 5; i++) {
                    const startTime = Date.now();

                    const tempPool = new Pool({
                        ...config,
                        max: 1
                    });

                    try {
                        const client = await tempPool.connect();
                        await client.query('SELECT 1');
                        client.release();

                        const duration = Date.now() - startTime;
                        measurements.push(duration);

                        await tempPool.end();
                    } catch (error) {
                        console.warn(`⚠️  Connection test ${i} failed for ${configName}:`, error.message);
                    }
                }

                if (measurements.length > 0) {
                    const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
                    const maxTime = Math.max(...measurements);

                    console.log(`✅ ${configName} connection time: avg ${avgTime.toFixed(2)}ms, max ${maxTime}ms`);
                    dbTest.testResults.performance[`${configName}_connection_avg`] = `${avgTime.toFixed(2)}ms`;
                    dbTest.testResults.performance[`${configName}_connection_max`] = `${maxTime}ms`;

                    assert.ok(avgTime < 200, `${configName} average connection time should be reasonable (<200ms), got ${avgTime}ms`);
                }
            }
        });
    });

    // =====================================================
    // ERROR HANDLING TESTING
    // =====================================================

    describe('Error Handling', () => {
        test('Constraint violation handling', async () => {
            for (const [name, pool] of dbTest.pools) {
                // Test unique constraint violation
                const testEmail = `constraint-test-${Date.now()}@test.com`;

                await pool.query("INSERT INTO users (email) VALUES ($1)", [testEmail]);

                try {
                    await pool.query("INSERT INTO users (email) VALUES ($1)", [testEmail]);
                    assert.fail(`${name} should reject duplicate email`);
                } catch (error) {
                    assert.ok(error.message.includes('unique') || error.message.includes('duplicate'), `${name} should provide meaningful constraint error`);
                }

                // Cleanup
                await pool.query("DELETE FROM users WHERE email = $1", [testEmail]);

                console.log(`✅ ${name} constraint violation handling working`);
            }
        });

        test('SQL injection protection', async () => {
            for (const [name, pool] of dbTest.pools) {
                const maliciousInput = "'; DROP TABLE users; --";

                // This should be safe with parameterized queries
                const result = await dbTest.executeTimedQuery(pool,
                    "SELECT * FROM users WHERE email = $1", [maliciousInput]);

                assert.strictEqual(result.success, true, `${name} should handle malicious input safely`);
                assert.strictEqual(result.result.rows.length, 0, `${name} should return no results for malicious input`);

                // Verify table still exists
                const tableCheck = await dbTest.executeTimedQuery(pool,
                    "SELECT tablename FROM pg_tables WHERE tablename = 'users' AND schemaname = 'public'");

                assert.strictEqual(tableCheck.success, true, `${name} table check should succeed`);
                assert.strictEqual(tableCheck.result.rows.length, 1, `${name} users table should still exist`);

                console.log(`✅ ${name} SQL injection protection working`);
            }
        });

        test('Transaction rollback testing', async () => {
            for (const [name, pool] of dbTest.pools) {
                const client = await pool.connect();

                try {
                    await client.query('BEGIN');

                    // Insert a user
                    const testUserId = testData.generateUUID();
                    await client.query("INSERT INTO users (id, email) VALUES ($1, $2)", [testUserId, `rollback-test-${Date.now()}@test.com`]);

                    // Verify user exists in transaction
                    const inTxResult = await client.query("SELECT * FROM users WHERE id = $1", [testUserId]);
                    assert.strictEqual(inTxResult.rows.length, 1, `${name} user should exist in transaction`);

                    // Rollback
                    await client.query('ROLLBACK');

                    // Verify user doesn't exist after rollback
                    const afterRollbackResult = await client.query("SELECT * FROM users WHERE id = $1", [testUserId]);
                    assert.strictEqual(afterRollbackResult.rows.length, 0, `${name} user should not exist after rollback`);

                    console.log(`✅ ${name} transaction rollback working`);

                } finally {
                    client.release();
                }
            }
        });
    });
});

module.exports = dbTest;
