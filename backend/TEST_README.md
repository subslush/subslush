# Database Testing Suite

Comprehensive database connectivity and CRUD operation testing for the PostgreSQL subscription platform using Node.js built-in test framework.

## Table of Contents
- [Quick Start](#quick-start)
- [Test Architecture](#test-architecture)
- [Configuration](#configuration)
- [Running Tests](#running-tests)
- [Test Categories](#test-categories)
- [Performance Testing](#performance-testing)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites
- Node.js >= 18.0.0
- PostgreSQL 16+ running with subscription_platform database
- Optional: PgBouncer for connection pooling tests

### Installation
```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.test .env.test.local

# Edit configuration with your database settings
nano .env.test.local

# Verify configuration
npm run test:connection

# Run all tests
npm test
```

### Basic Usage
```bash
# Run all tests
npm test

# Run with verbose output
npm run test:verbose

# Run performance tests
npm run test:performance

# Run quick smoke tests
npm run test:quick
```

## Test Architecture

### File Structure
```
tests/
├── test-config.js       # Environment and configuration management
├── test-data.js         # Test data generation utilities
├── test-database.js     # Main test suite
├── .env.test           # Environment configuration template
package.json            # Test scripts and dependencies
TEST_README.md          # This documentation
```

### Test Framework
- **Node.js Built-in Test Runner** (`node:test`) - No external dependencies
- **Zero external testing libraries** - Uses only Node.js built-in modules
- **Parallel and sequential execution** support
- **Built-in assertions** with detailed error messages

### Key Components

#### TestConfig (`test-config.js`)
- Environment variable management
- Multi-database configuration (PostgreSQL + PgBouncer)
- Test execution settings
- Performance thresholds

#### TestData (`test-data.js`)
- Realistic test data generation
- Faker-like functionality using built-in JavaScript
- Reproducible data with seeded random generation
- Edge case data generation

#### DatabaseTestSuite (`test-database.js`)
- Connection management
- CRUD operation testing
- Performance benchmarking
- Error handling verification

## Configuration

### Environment Variables (.env.test)

#### Database Connection
```bash
# PostgreSQL Direct
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_DATABASE=subscription_platform
TEST_DB_USER=subscription_user
TEST_DB_PASSWORD=subscription_pass_2024

# PgBouncer (optional)
TEST_PGBOUNCER_HOST=localhost
TEST_PGBOUNCER_PORT=6432
```

#### Test Execution
```bash
# Test behavior
TEST_TIMEOUT=30000
TEST_VERBOSE=false
TEST_PERFORMANCE=true
TEST_PARALLEL=false

# Test data scale
TEST_USERS_COUNT=100
TEST_SUBSCRIPTIONS_PER_USER=2
TEST_CREDITS_PER_USER=5
```

#### Performance Testing
```bash
# Stress testing
TEST_STRESS_CONNECTIONS=50
TEST_STRESS_DURATION=10000

# Performance targets
TEST_TARGET_CONNECTION_MS=100
TEST_TARGET_QUERY_MS=50
TEST_TARGET_INSERT_RPS=1000
```

### Configuration Management
```bash
# Check current configuration
npm run test:env

# Test database connectivity
npm run test:connection

# View generated test data
npm run test:data
```

## Running Tests

### Basic Test Commands

#### Standard Test Execution
```bash
# Run all tests with default settings
npm test

# Run with test output details
npm run test:verbose

# Run with performance measurements
npm run test:performance

# Watch mode for development
npm run test:watch
```

#### Specific Test Types
```bash
# Quick smoke tests (reduced data)
npm run test:quick

# Stress testing with high concurrency
npm run test:stress

# Test only PostgreSQL direct connection
npm run test:postgres

# Test only PgBouncer connection
npm run test:pgbouncer
```

#### CI/CD and Production
```bash
# CI-friendly execution
npm run test:ci

# Debug mode with inspector
npm run test:debug

# Parallel execution
npm run test:parallel
```

### Advanced Test Execution

#### Custom Environment Variables
```bash
# Override specific settings
TEST_USERS_COUNT=500 TEST_VERBOSE=true npm test

# Performance testing with custom scale
TEST_STRESS_CONNECTIONS=100 TEST_PERFORMANCE=true npm test

# Quick test with minimal data
TEST_USERS_COUNT=10 TEST_PERFORMANCE=false npm test
```

#### Test Reporting
```bash
# Spec reporter (detailed output)
npm run test:reporter

# TAP format output
npm run test:reporter-json

# Coverage analysis (experimental)
npm run test:coverage
```

## Test Categories

### 1. Connection Testing
**Purpose**: Verify database connectivity and authentication

**Tests Include**:
- Basic connectivity (connect/disconnect)
- Authentication verification (valid/invalid credentials)
- Connection timeout handling
- Connection pool behavior
- Concurrent connection stress testing
- SSL connection verification (if configured)

**Example Output**:
```
✅ postgres connection: 45.23ms
✅ pgbouncer connection: 23.45ms
✅ Invalid credentials properly rejected
✅ Connection timeout handled properly: 1002ms
✅ postgres connection pool handles concurrent connections
✅ postgres stress test: 50 connections in 234ms
```

### 2. Schema Validation Testing
**Purpose**: Ensure database schema integrity

**Tests Include**:
- Table existence verification
- Column structure validation
- Foreign key constraint testing
- Check constraint verification
- Unique constraint testing
- UUID generation functionality
- JSONB column functionality

**Example Output**:
```
✅ postgres all required tables exist: users, subscriptions, credits, admin_tasks, schema_migrations
✅ postgres users structure verified
✅ postgres foreign key constraints verified
✅ postgres check constraints working
✅ postgres unique constraints working
✅ postgres UUID generation working
✅ postgres JSONB functionality working
```

### 3. CRUD Operations Testing
**Purpose**: Verify all database operations work correctly

#### CREATE Operations
- Insert users with various data combinations
- Create subscriptions with foreign key relationships
- Add credits with different transaction types
- Create admin tasks with proper references

#### READ Operations
- Query users by email and status
- Fetch subscriptions by user_id and service_type
- Calculate credit balances for users
- Retrieve admin tasks by various filters

#### UPDATE Operations
- Modify user profiles and track last_login
- Update subscription status and dates
- Process credit transactions
- Complete admin tasks

#### DELETE Operations
- Test cascade deletes (user → subscriptions → admin_tasks)
- Verify referential integrity constraints

**Example Output**:
```
✅ postgres inserted 3 users
✅ postgres inserted 6 subscriptions
✅ postgres inserted 9 credits
✅ postgres inserted 6 admin tasks
✅ postgres user queries working (12.34ms)
✅ postgres subscription queries working (8.76ms)
✅ postgres balance calculation working (15.43ms)
✅ postgres admin task queries working (9.87ms)
```

### 4. Performance Baseline Testing
**Purpose**: Establish performance benchmarks

**Tests Include**:
- Insert performance with batch operations (100, 1000, 10000 records)
- Query performance for simple and complex queries
- Index effectiveness verification
- Connection establishment time measurement
- Concurrent query performance under load

**Example Output**:
```
✅ postgres 100 records: 45ms (2222 records/sec)
✅ postgres 1000 records: 234ms (4274 records/sec)
✅ postgres query performance: simple 12.34ms, complex 89.76ms
✅ postgres connection time: avg 23.45ms, max 45ms
```

### 5. Error Handling Testing
**Purpose**: Verify proper error handling and security

**Tests Include**:
- Invalid connection parameter handling
- Database unavailable scenarios
- Constraint violation handling
- SQL injection protection
- Transaction rollback testing
- Deadlock handling

**Example Output**:
```
✅ postgres constraint violation handling working
✅ postgres SQL injection protection working
✅ postgres transaction rollback working
```

## Performance Testing

### Performance Metrics

#### Connection Performance
- **Connection Time**: < 100ms target
- **Pool Establishment**: Measured for different pool sizes
- **Concurrent Connections**: Stress test with 50+ connections

#### Query Performance
- **Simple Queries**: < 50ms target
- **Complex Queries**: < 500ms target
- **Index Usage**: Verified through query plans

#### Insert Performance
- **Single Inserts**: Individual record insertion time
- **Batch Inserts**: Bulk insertion rates (records/second)
- **Transaction Performance**: Multi-operation transaction time

### Performance Configuration

#### Stress Testing
```bash
# High-load stress test
TEST_STRESS_CONNECTIONS=100 \
TEST_STRESS_DURATION=60000 \
TEST_STRESS_QUERIES=20 \
npm run test:stress
```

#### Scale Testing
```bash
# Large dataset testing
TEST_USERS_COUNT=10000 \
TEST_SUBSCRIPTIONS_PER_USER=5 \
TEST_CREDITS_PER_USER=20 \
npm run test:performance
```

### Performance Benchmarking

#### Automated Benchmarks
The test suite automatically benchmarks:
- Connection establishment time
- Query execution time
- Batch insert performance
- Concurrent operation handling

#### Performance Reporting
Results are captured and reported:
```
⚡ Performance Results:
   postgres_connection_time: 23.45ms
   postgres_stress_test: 50 connections in 234ms
   postgres_batch_100: 2222 records/sec
   postgres_batch_1000: 4274 records/sec
   postgres_simple_query: 12.34ms
   postgres_complex_query: 89.76ms
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Database Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: subscription_platform
          POSTGRES_USER: subscription_user
          POSTGRES_PASSWORD: subscription_pass_2024
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm install

    - name: Run database migrations
      run: |
        PGPASSWORD=subscription_pass_2024 psql -h localhost -U subscription_user -d subscription_platform -f initial_schema.sql

    - name: Run tests
      run: npm run test:ci
      env:
        TEST_DB_HOST: localhost
        TEST_DB_PORT: 5432
        TEST_DB_DATABASE: subscription_platform
        TEST_DB_USER: subscription_user
        TEST_DB_PASSWORD: subscription_pass_2024
```

### Docker Testing
```bash
# Run PostgreSQL in Docker for testing
docker run --name postgres-test \
  -e POSTGRES_DB=subscription_platform \
  -e POSTGRES_USER=subscription_user \
  -e POSTGRES_PASSWORD=subscription_pass_2024 \
  -p 5432:5432 \
  -d postgres:16

# Run tests against Docker instance
TEST_DB_HOST=localhost npm test
```

### Environment-Specific Testing
```bash
# Development environment
NODE_ENV=development npm test

# Staging environment
NODE_ENV=staging TEST_DB_HOST=staging-db npm test

# Production-like testing
NODE_ENV=production TEST_DB_SSL=true npm test
```

## Troubleshooting

### Common Issues

#### Connection Problems
```bash
# Test basic connectivity
npm run test:connection

# Check environment configuration
npm run test:env

# Debug connection issues
DEBUG=true npm run test:debug
```

**Symptoms**: Connection timeout, authentication failed
**Solutions**:
1. Verify database is running: `pg_isready -h localhost -p 5432`
2. Check credentials in `.env.test`
3. Verify network connectivity
4. Check PostgreSQL logs

#### Permission Issues
**Symptoms**: Permission denied, relation does not exist
**Solutions**:
1. Ensure user has proper database permissions
2. Verify schema exists and is accessible
3. Check table ownership: `\dt` in psql

#### Test Data Issues
**Symptoms**: Foreign key violations, constraint errors
**Solutions**:
1. Run with cleanup: `TEST_CLEANUP=true npm test`
2. Check test data generation: `npm run test:data`
3. Verify schema is current

#### Performance Issues
**Symptoms**: Tests timing out, slow execution
**Solutions**:
1. Increase timeout: `TEST_TIMEOUT=60000 npm test`
2. Reduce test data: `TEST_USERS_COUNT=10 npm test`
3. Check database performance
4. Verify indexes are in place

### Debug Mode
```bash
# Run with debugging enabled
npm run test:debug

# Verbose output with timing
TEST_VERBOSE=true npm test

# Check specific configuration
node -e "console.log(require('./tests/test-config').getConfig())"
```

### Test Data Management
```bash
# Clean test data manually
psql -d subscription_platform -c "
DELETE FROM admin_tasks WHERE created_at > NOW() - INTERVAL '1 hour';
DELETE FROM credits WHERE created_at > NOW() - INTERVAL '1 hour';
DELETE FROM subscriptions WHERE created_at > NOW() - INTERVAL '1 hour';
DELETE FROM users WHERE email LIKE '%@test.com' OR email LIKE '%@example.com';
"

# Disable cleanup for inspection
TEST_CLEANUP=false npm test
```

### Performance Debugging
```bash
# Run only performance tests
npm run test:performance

# Reduce scale for debugging
TEST_USERS_COUNT=5 TEST_PERFORMANCE=true npm test

# Check database performance
psql -d subscription_platform -c "
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC LIMIT 10;
"
```

## Best Practices

### Development Workflow
1. **Start with connection tests**: Verify basic connectivity first
2. **Use verbose mode**: Enable detailed output during development
3. **Test incrementally**: Run quick tests frequently
4. **Check performance**: Monitor query execution times
5. **Clean up regularly**: Use cleanup options to avoid test pollution

### CI/CD Best Practices
1. **Use dedicated test database**: Separate from development data
2. **Set appropriate timeouts**: Account for CI environment latency
3. **Enable retries**: Handle transient failures
4. **Capture test artifacts**: Save logs and results
5. **Monitor performance trends**: Track execution time over time

### Production Testing
1. **Use production-like data volumes**: Test with realistic scale
2. **Test connection limits**: Verify under load
3. **Monitor resource usage**: Check memory and CPU impact
4. **Test failover scenarios**: Verify error handling
5. **Validate security**: Test authentication and authorization

This testing suite provides comprehensive coverage of database functionality and serves as a foundation for building reliable database-driven applications.