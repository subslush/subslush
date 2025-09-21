# Database Migration System

A robust database migration system for Node.js/PostgreSQL subscription platform that tracks schema changes, supports rollbacks, and works seamlessly across development and production environments.

## Table of Contents
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Migration File Format](#migration-file-format)
- [Command Reference](#command-reference)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Production Deployment](#production-deployment)

## Features

✅ **Transaction-wrapped migrations** for data integrity
✅ **UP and DOWN migrations** in single files
✅ **Migration tracking** with applied history
✅ **Rollback capabilities** to any version
✅ **Dry-run mode** for safe testing
✅ **Migration validation** and integrity checks
✅ **Advisory locks** to prevent concurrent migrations
✅ **Environment-specific configuration**
✅ **Verbose logging** and detailed status reporting
✅ **PgBouncer support** for connection pooling

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database credentials

# 3. Test connection
npm run migrate:status

# 4. Apply migrations
npm run migrate:up

# 5. Create new migration
npm run migrate:create add_user_preferences
```

## Installation

### Prerequisites
- Node.js >= 14.0.0
- PostgreSQL >= 12
- Database with `pgcrypto` extension support

### Setup
```bash
# Clone or copy the database migration system
cd database/

# Install dependencies
npm install

# Make migration runner executable
chmod +x migrate.js

# Copy environment configuration
cp .env .env.local
```

## Configuration

### Environment Variables (.env)

```bash
# Database Connection
DB_HOST=localhost
DB_PORT=5432                    # Use 6432 for PgBouncer
DB_DATABASE=subscription_platform
DB_USER=subscription_user
DB_PASSWORD=subscription_pass_2024

# Migration Settings
MIGRATION_VERBOSE=false         # Enable detailed logging
NODE_ENV=development            # Environment: development/staging/production

# Optional Settings
DB_SSL=false                    # Enable SSL connections
DB_APPLICATION_NAME=migration_runner
```

### Connection Pool Settings
```bash
# Advanced connection settings
DB_POOL_MAX=2                   # Max connections for migrations
DB_IDLE_TIMEOUT=30000          # Connection idle timeout
DB_CONNECTION_TIMEOUT=10000     # Connection timeout
```

## Usage

### Command Line Interface

```bash
# Apply all pending migrations
node migrate.js up

# Rollback last migration
node migrate.js down

# Show migration status
node migrate.js status

# Create new migration
node migrate.js create add_new_feature

# Test database connection
node migrate.js test

# Validate migration files
node migrate.js validate

# Rollback to specific version
node migrate.js rollback 20241219_120000
```

### NPM Scripts

```bash
# Apply migrations
npm run migrate:up

# Rollback migrations
npm run migrate:down

# Show status
npm run migrate:status

# Create migration
npm run migrate:create

# Dry run (test without applying)
npm run migrate:dry-run

# Verbose output
npm run migrate:verbose
```

### Command Options

```bash
# Dry run - show what would be done without applying
node migrate.js up --dry-run

# Verbose logging
node migrate.js up --verbose

# Force operation (use with caution)
node migrate.js down --force

# Combine options
node migrate.js up --dry-run --verbose
```

## Migration File Format

### File Naming Convention
```
YYYYMMDD_HHMMSS_description.sql
```

Examples:
- `20241219_120000_initial_schema.sql`
- `20241219_130000_add_user_preferences.sql`
- `20241220_090000_update_subscription_table.sql`

### Migration Template

```sql
-- Migration: Description of changes
-- Created: 2024-12-19T12:00:00.000Z

-- Up Migration
BEGIN;

-- Add your UP migration SQL here
CREATE TABLE example_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_example_name ON example_table(name);

COMMIT;

-- Down Migration
BEGIN;

-- Add your DOWN migration SQL here
DROP TABLE IF EXISTS example_table;

COMMIT;
```

## Command Reference

### `migrate.js up`
Apply all pending migrations in chronological order.

**Options:**
- `--dry-run`: Preview changes without applying
- `--verbose`: Detailed logging
- `--backup`: Create backup before applying (if configured)

**Example:**
```bash
node migrate.js up --dry-run --verbose
```

### `migrate.js down`
Rollback the most recently applied migration.

**Options:**
- `--dry-run`: Preview rollback without applying
- `--force`: Skip confirmation prompts

**Example:**
```bash
node migrate.js down --dry-run
```

### `migrate.js status`
Display current migration status and database information.

**Output includes:**
- Applied migrations with timestamps
- Pending migrations
- Database connection info
- Migration statistics

### `migrate.js create <name>`
Create a new migration file with the specified name.

**Example:**
```bash
node migrate.js create add_user_preferences
# Creates: 20241219_143022_add_user_preferences.sql
```

### `migrate.js validate`
Validate all migration files for:
- Proper UP/DOWN structure
- Transaction blocks
- SQL syntax (basic checks)

### `migrate.js rollback <version>`
Rollback to a specific migration version.

**Example:**
```bash
node migrate.js rollback 20241219_120000
```

### `migrate.js test`
Test database connectivity and display connection information.

## Best Practices

### Migration Development

1. **Always use transactions**
   ```sql
   BEGIN;
   -- Your changes here
   COMMIT;
   ```

2. **Test both UP and DOWN migrations**
   ```bash
   node migrate.js up --dry-run
   node migrate.js down --dry-run
   ```

3. **Use descriptive migration names**
   ```bash
   # Good
   node migrate.js create add_user_email_verification

   # Avoid
   node migrate.js create update_users
   ```

4. **Validate before committing**
   ```bash
   node migrate.js validate
   ```

### Schema Changes

1. **Add columns with defaults**
   ```sql
   ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT '';
   ```

2. **Create indexes concurrently in production**
   ```sql
   CREATE INDEX CONCURRENTLY idx_users_phone ON users(phone);
   ```

3. **Drop columns in multiple steps**
   ```sql
   -- Step 1: Remove from application code
   -- Step 2: Migration to drop column
   ALTER TABLE users DROP COLUMN old_column;
   ```

### Data Migrations

1. **Separate schema and data changes**
   ```bash
   # Schema first
   node migrate.js create update_user_schema
   # Data second
   node migrate.js create migrate_user_data
   ```

2. **Use batch processing for large datasets**
   ```sql
   UPDATE users SET status = 'active'
   WHERE status IS NULL
   AND id IN (
       SELECT id FROM users
       WHERE status IS NULL
       LIMIT 1000
   );
   ```

### Production Safety

1. **Always backup before major changes**
   ```bash
   pg_dump subscription_platform > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Use dry-run in production**
   ```bash
   node migrate.js up --dry-run --verbose
   ```

3. **Monitor migration progress**
   ```bash
   # In another terminal during migration
   node migrate.js status
   ```

## Troubleshooting

### Common Issues

#### Connection Failed
```bash
# Test connection
node migrate.js test

# Check environment variables
echo $DB_HOST $DB_PORT $DB_DATABASE

# Verify PostgreSQL is running
sudo systemctl status postgresql
```

#### Migration Already Applied
```bash
# Check status
node migrate.js status

# If migration is recorded but not actually applied:
# 1. Remove from schema_migrations table
# 2. Re-run migration
```

#### Lock Acquisition Failed
```bash
# Another migration is running
# Wait for completion or check for stuck processes

# Force unlock (use with caution)
psql -d subscription_platform -c "SELECT pg_advisory_unlock_all();"
```

#### Migration File Not Found
```bash
# Ensure file exists in migrations directory
ls -la migrations/

# Check filename format
# Should be: YYYYMMDD_HHMMSS_description.sql
```

### Debugging

#### Enable Verbose Logging
```bash
export MIGRATION_VERBOSE=true
node migrate.js status
```

#### Check Migration History
```sql
SELECT * FROM schema_migrations ORDER BY applied_at DESC;
```

#### Verify Database State
```sql
-- Check tables
\dt

-- Check indexes
\di

-- Check constraints
\d+ table_name
```

### Recovery Procedures

#### Rollback Failed Migration
```bash
# Check what went wrong
node migrate.js status --verbose

# Manual rollback if needed
psql -d subscription_platform -f migrations/YYYYMMDD_HHMMSS_failed_migration.sql
# (Run only the DOWN section manually)

# Remove migration record
psql -d subscription_platform -c "DELETE FROM schema_migrations WHERE version = 'YYYYMMDD_HHMMSS';"
```

#### Reset Migration State
```bash
# DANGER: This resets all migration history
# Only use in development environments

psql -d subscription_platform -c "DROP TABLE schema_migrations;"
node migrate.js up
```

## Production Deployment

### Pre-deployment Checklist

- [ ] All migrations tested in staging environment
- [ ] Database backup created
- [ ] Migration rollback plan prepared
- [ ] Application deployment coordinated
- [ ] Monitoring alerts configured

### Deployment Process

1. **Create backup**
   ```bash
   pg_dump subscription_platform > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Dry-run migrations**
   ```bash
   node migrate.js up --dry-run --verbose
   ```

3. **Apply migrations**
   ```bash
   node migrate.js up --verbose
   ```

4. **Verify results**
   ```bash
   node migrate.js status
   ```

5. **Deploy application**
   ```bash
   # Deploy your application code
   ```

### Post-deployment Verification

```bash
# Check migration status
node migrate.js status

# Verify database state
psql -d subscription_platform -c "SELECT COUNT(*) FROM users;"

# Monitor application logs
tail -f /var/log/app.log
```

### Rollback Strategy

```bash
# If issues are detected:

# 1. Rollback application
# Revert to previous application version

# 2. Rollback database
node migrate.js down --verbose

# 3. Verify rollback
node migrate.js status
```

## Security Considerations

### Environment Files
```bash
# Secure .env file
chmod 600 .env
chown app:app .env

# Never commit credentials
echo ".env" >> .gitignore
```

### Database Permissions
```sql
-- Minimal permissions for migration user
GRANT CONNECT ON DATABASE subscription_platform TO migration_user;
GRANT CREATE ON SCHEMA public TO migration_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO migration_user;
```

### Production Access
```bash
# Use read-only connection for status checks
DB_USER=readonly_user node migrate.js status

# Require approval for production migrations
# (implement in CI/CD pipeline)
```

---

## Support

For issues, questions, or contributions:

1. Check the [troubleshooting](#troubleshooting) section
2. Review migration logs in verbose mode
3. Validate your migration files
4. Test in development environment first

**Remember: Always test migrations thoroughly before applying to production!**