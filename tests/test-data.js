// =====================================================
// Test Data Generation Utilities
// =====================================================
// Description: Faker-like functionality using built-in JavaScript
// No external dependencies - pure Node.js implementation

const crypto = require('crypto');

class TestDataGenerator {
    constructor() {
        this.setupSeeds();
        this.initializeData();
    }

    /**
     * Setup random seeds for reproducible data generation
     */
    setupSeeds() {
        this.seed = Date.now() + Math.random(); // Fixed seed for reproducible tests
        this.random = this.createSeededRandom(this.seed);
    }

    /**
     * Create seeded random number generator for reproducible results
     */
    createSeededRandom(seed) {
        let currentSeed = seed;
        return () => {
            currentSeed = (currentSeed * 9301 + 49297) % 233280;
            return currentSeed / 233280;
        };
    }

    /**
     * Initialize static data arrays for generation
     */
    initializeData() {
        this.data = {
            firstNames: [
                'John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Jessica',
                'William', 'Ashley', 'James', 'Amanda', 'Christopher', 'Stephanie', 'Daniel',
                'Nicole', 'Matthew', 'Elizabeth', 'Anthony', 'Heather', 'Mark', 'Michelle',
                'Donald', 'Kimberly', 'Steven', 'Amy', 'Paul', 'Angela', 'Andrew', 'Brenda'
            ],

            lastNames: [
                'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
                'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
                'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
                'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'
            ],

            domains: [
                'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
                'protonmail.com', 'example.com', 'test.com', 'demo.org', 'sample.net'
            ],

            services: [
                { type: 'spotify', plans: ['premium', 'family', 'individual'] },
                { type: 'netflix', plans: ['basic', 'standard', 'premium', 'family'] },
                { type: 'tradingview', plans: ['basic', 'pro', 'premium'] }
            ],

            transactionTypes: ['deposit', 'purchase', 'refund', 'bonus', 'withdrawal'],

            taskTypes: ['credential_provision', 'renewal', 'cancellation', 'support', 'verification'],

            priorities: ['low', 'medium', 'high', 'urgent'],

            statuses: {
                user: ['active', 'inactive', 'suspended'],
                subscription: ['active', 'expired', 'cancelled', 'pending'],
                task: ['pending', 'assigned', 'completed']
            },

            regions: ['US', 'EU', 'CA', 'AU', 'UK', 'JP', 'BR', 'IN'],

            paymentMethods: ['crypto', 'credit_card', 'paypal', 'bank_transfer', 'gift_card'],

            descriptions: [
                'Initial deposit', 'Subscription payment', 'Refund processed', 'Bonus credit',
                'Crypto deposit confirmed', 'Payment received', 'Account credit', 'Promotional bonus',
                'Subscription renewal', 'Service upgrade', 'Cashback reward', 'Welcome bonus'
            ]
        };
    }

    /**
     * Generate random integer between min and max (inclusive)
     */
    randomInt(min, max) {
        return Math.floor(this.random() * (max - min + 1)) + min;
    }

    /**
     * Generate random float between min and max
     */
    randomFloat(min, max, decimals = 2) {
        const value = this.random() * (max - min) + min;
        return parseFloat(value.toFixed(decimals));
    }

    /**
     * Pick random element from array
     */
    randomChoice(array) {
        return array[this.randomInt(0, array.length - 1)];
    }

    /**
     * Generate random boolean with optional probability
     */
    randomBool(probability = 0.5) {
        return this.random() < probability;
    }

    /**
     * Generate random UUID v4
     */
    generateUUID() {
        return crypto.randomUUID();
    }

    /**
     * Generate random email address
     */
    generateEmail(index = null) {
        const firstName = this.randomChoice(this.data.firstNames).toLowerCase();
        const lastName = this.randomChoice(this.data.lastNames).toLowerCase();
        const domain = this.randomChoice(this.data.domains);
        const number = index !== null ? index : this.randomInt(1, 999);

        return `${firstName}.${lastName}${number}@${domain}`;
    }

    /**
     * Generate random full name
     */
    generateName() {
        const firstName = this.randomChoice(this.data.firstNames);
        const lastName = this.randomChoice(this.data.lastNames);
        return { firstName, lastName, fullName: `${firstName} ${lastName}` };
    }

    /**
     * Generate random date within range
     */
    generateDate(startDate, endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        const randomTime = start + this.random() * (end - start);
        return new Date(randomTime);
    }

    /**
     * Generate future date from now
     */
    generateFutureDate(daysFromNow = 365) {
        const now = new Date();
        const future = new Date(now.getTime() + (daysFromNow * 24 * 60 * 60 * 1000));
        return this.generateDate(now, future);
    }

    /**
     * Generate past date from now
     */
    generatePastDate(daysAgo = 365) {
        const now = new Date();
        const past = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
        return this.generateDate(past, now);
    }

    /**
     * Generate cryptocurrency transaction hash
     */
    generateTxHash() {
        const chars = '0123456789abcdef';
        let hash = '0x';
        for (let i = 0; i < 64; i++) {
            hash += chars[this.randomInt(0, chars.length - 1)];
        }
        return hash;
    }

    /**
     * Generate subscription metadata
     */
    generateMetadata() {
        return {
            region: this.randomChoice(this.data.regions),
            payment_method: this.randomChoice(this.data.paymentMethods),
            auto_renew: this.randomBool(0.8),
            promotional: this.randomBool(0.3),
            source: this.randomChoice(['web', 'mobile', 'api', 'referral']),
            created_by: 'test_user'
        };
    }

    /**
     * Generate a single user record
     */
    generateUser(index = null) {
        const name = this.generateName();
        const createdAt = this.generatePastDate(30);
        const hasLoggedIn = this.randomBool(0.7);

        return {
            id: this.generateUUID(),
            email: this.generateEmail(index),
            created_at: createdAt,
            last_login: hasLoggedIn ? this.generateDate(createdAt, new Date()) : null,
            status: this.randomChoice(this.data.statuses.user),
            // Additional fields for testing
            _test_name: name.fullName,
            _test_index: index
        };
    }

    /**
     * Generate multiple users
     */
    generateUsers(count = 10) {
        const users = [];
        for (let i = 0; i < count; i++) {
            users.push(this.generateUser(i + 1));
        }
        return users;
    }

    /**
     * Generate a single subscription record
     */
    generateSubscription(userId, index = null) {
        const service = this.randomChoice(this.data.services);
        const plan = this.randomChoice(service.plans);
        const startDate = this.generatePastDate(180);
        const endDate = new Date(startDate.getTime() + (365 * 24 * 60 * 60 * 1000));
        const renewalDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000));

        return {
            id: this.generateUUID(),
            user_id: userId,
            service_type: service.type,
            service_plan: plan,
            start_date: startDate,
            end_date: endDate,
            renewal_date: renewalDate,
            credentials_encrypted: this.randomBool(0.6) ? 'encrypted_credentials_data' : null,
            status: this.randomChoice(this.data.statuses.subscription),
            metadata: this.generateMetadata(),
            created_at: startDate,
            _test_index: index
        };
    }

    /**
     * Generate multiple subscriptions for a user
     */
    generateSubscriptions(userId, count = 2) {
        const subscriptions = [];
        for (let i = 0; i < count; i++) {
            subscriptions.push(this.generateSubscription(userId, i + 1));
        }
        return subscriptions;
    }

    /**
     * Generate a single credit transaction
     */
    generateCredit(userId, index = null) {
        const transactionType = this.randomChoice(this.data.transactionTypes);
        const amount = this.randomFloat(5.00, 500.00);
        const createdAt = this.generatePastDate(90);

        return {
            id: this.generateUUID(),
            user_id: userId,
            amount: amount,
            transaction_type: transactionType,
            transaction_hash: transactionType === 'deposit' ? this.generateTxHash() : null,
            created_at: createdAt,
            description: this.randomChoice(this.data.descriptions),
            _test_index: index
        };
    }

    /**
     * Generate multiple credit transactions for a user
     */
    generateCredits(userId, count = 5) {
        const credits = [];
        for (let i = 0; i < count; i++) {
            credits.push(this.generateCredit(userId, i + 1));
        }
        return credits;
    }

    /**
     * Generate a single admin task
     */
    generateAdminTask(subscriptionId, assignedAdmin = null, index = null) {
        const createdAt = this.generatePastDate(14);
        const dueDate = this.generateFutureDate(30);
        const isCompleted = this.randomBool(0.4);

        return {
            id: this.generateUUID(),
            subscription_id: subscriptionId,
            task_type: this.randomChoice(this.data.taskTypes),
            due_date: dueDate,
            completed_at: isCompleted ? this.generateDate(createdAt, new Date()) : null,
            assigned_admin: assignedAdmin,
            notes: `Test task notes ${index || this.randomInt(1, 1000)}`,
            priority: this.randomChoice(this.data.priorities),
            created_at: createdAt,
            _test_index: index
        };
    }

    /**
     * Generate multiple admin tasks for a subscription
     */
    generateAdminTasks(subscriptionId, assignedAdmin = null, count = 1) {
        const tasks = [];
        for (let i = 0; i < count; i++) {
            tasks.push(this.generateAdminTask(subscriptionId, assignedAdmin, i + 1));
        }
        return tasks;
    }

    /**
     * Generate complete test dataset
     */
    generateCompleteDataset(options = {}) {
        const {
            userCount = 10,
            subscriptionsPerUser = 2,
            creditsPerUser = 5,
            tasksPerSubscription = 1
        } = options;

        console.log('🎲 Generating test dataset...');
        console.log(`   Users: ${userCount}`);
        console.log(`   Subscriptions per user: ${subscriptionsPerUser}`);
        console.log(`   Credits per user: ${creditsPerUser}`);
        console.log(`   Tasks per subscription: ${tasksPerSubscription}`);

        const dataset = {
            users: [],
            subscriptions: [],
            credits: [],
            admin_tasks: []
        };

        // Generate users
        dataset.users = this.generateUsers(userCount);

        // Generate subscriptions, credits, and tasks for each user
        dataset.users.forEach(user => {
            // Generate subscriptions
            const userSubscriptions = this.generateSubscriptions(user.id, subscriptionsPerUser);
            dataset.subscriptions.push(...userSubscriptions);

            // Generate credits
            const userCredits = this.generateCredits(user.id, creditsPerUser);
            dataset.credits.push(...userCredits);

            // Generate admin tasks for each subscription
            userSubscriptions.forEach(subscription => {
                const subscriptionTasks = this.generateAdminTasks(
                    subscription.id,
                    user.id, // Assign some tasks to the user for testing
                    tasksPerSubscription
                );
                dataset.admin_tasks.push(...subscriptionTasks);
            });
        });

        console.log('✅ Test dataset generated:');
        console.log(`   Total users: ${dataset.users.length}`);
        console.log(`   Total subscriptions: ${dataset.subscriptions.length}`);
        console.log(`   Total credits: ${dataset.credits.length}`);
        console.log(`   Total admin tasks: ${dataset.admin_tasks.length}`);

        return dataset;
    }

    /**
     * Generate batch insert SQL statements
     */
    generateBatchInsertSQL(tableName, records, chunkSize = 100) {
        if (records.length === 0) return [];

        const chunks = [];
        for (let i = 0; i < records.length; i += chunkSize) {
            chunks.push(records.slice(i, i + chunkSize));
        }

        return chunks.map(chunk => {
            const columns = Object.keys(chunk[0]).filter(key => !key.startsWith('_test'));
            const values = chunk.map(record => {
                return columns.map(col => {
                    const value = record[col];
                    if (value === null) return 'NULL';
                    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
                    if (value instanceof Date) return `'${value.toISOString()}'`;
                    if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
                    return value;
                }).join(', ');
            });

            return {
                sql: `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${values.map(v => `(${v})`).join(', ')};`,
                rowCount: chunk.length
            };
        });
    }

    /**
     * Generate test data with specific constraints for edge case testing
     */
    generateEdgeCaseData() {
        const now = new Date();

        return {
            // User edge cases
            users: [
                {
                    id: this.generateUUID(),
                    email: 'test+user@example.com', // Email with plus
                    created_at: now,
                    last_login: null,
                    status: 'active'
                },
                {
                    id: this.generateUUID(),
                    email: 'very.long.email.address.for.testing@very-long-domain-name-example.com',
                    created_at: new Date(now.getTime() - 1000), // 1 second ago
                    last_login: now,
                    status: 'inactive'
                }
            ],

            // Subscription edge cases
            subscriptions: [
                {
                    id: this.generateUUID(),
                    user_id: null, // Will be set to first user
                    service_type: 'spotify',
                    service_plan: 'premium',
                    start_date: now,
                    end_date: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Expires tomorrow
                    renewal_date: new Date(now.getTime() + 12 * 60 * 60 * 1000), // Renews in 12 hours
                    credentials_encrypted: null,
                    status: 'active',
                    metadata: { test: 'edge_case', nested: { value: 123 } },
                    created_at: now
                }
            ],

            // Credit edge cases
            credits: [
                {
                    id: this.generateUUID(),
                    user_id: null, // Will be set
                    amount: 0.01, // Minimum amount
                    transaction_type: 'deposit',
                    transaction_hash: this.generateTxHash(),
                    created_at: now,
                    description: 'Minimum amount test'
                },
                {
                    id: this.generateUUID(),
                    user_id: null, // Will be set
                    amount: 9999.99, // Maximum amount
                    transaction_type: 'deposit',
                    transaction_hash: null,
                    created_at: now,
                    description: 'Maximum amount test'
                }
            ]
        };
    }

    /**
     * Reset random seed for reproducible tests
     */
    resetSeed(newSeed = null) {
        this.seed = newSeed || 12345;
        this.random = this.createSeededRandom(this.seed);
    }

    /**
     * Generate performance test data (large dataset)
     */
    generatePerformanceTestData(scale = 'medium') {
        const scales = {
            small: { users: 100, subscriptions: 2, credits: 5, tasks: 1 },
            medium: { users: 1000, subscriptions: 3, credits: 10, tasks: 2 },
            large: { users: 10000, subscriptions: 5, credits: 20, tasks: 3 },
            xlarge: { users: 50000, subscriptions: 8, credits: 50, tasks: 5 }
        };

        const config = scales[scale] || scales.medium;
        return this.generateCompleteDataset(config);
    }
}

// Export singleton instance
const testDataGenerator = new TestDataGenerator();

module.exports = testDataGenerator;