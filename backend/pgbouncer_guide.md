# PgBouncer Setup and Troubleshooting Guide

## Table of Contents
1. [Installation Steps](#installation-steps)
2. [Configuration Deployment](#configuration-deployment)
3. [Service Management](#service-management)
4. [Testing and Verification](#testing-and-verification)
5. [Performance Monitoring](#performance-monitoring)
6. [Troubleshooting](#troubleshooting)
7. [Common Issues](#common-issues)
8. [Optimization Tips](#optimization-tips)

## Installation Steps

### 1. Run the Installation Script
```bash
# Make the script executable
chmod +x setup_pgbouncer.sh

# Run the installation
./setup_pgbouncer.sh
```

### 2. Generate the Correct MD5 Hash
```bash
# Generate MD5 hash for subscription_user
echo -n "subscription_pass_2024subscription_user" | md5sum
# Copy the result and update userlist.txt with: "subscription_user" "md5<hash_result>"
```

## Configuration Deployment

### 1. Deploy Configuration Files
```bash
# Copy configuration files to PgBouncer directory
sudo cp pgbouncer.ini /etc/pgbouncer/
sudo cp userlist.txt /etc/pgbouncer/

# Set proper ownership and permissions
sudo chown pgbouncer:pgbouncer /etc/pgbouncer/*
sudo chmod 644 /etc/pgbouncer/pgbouncer.ini
sudo chmod 600 /etc/pgbouncer/userlist.txt
```

### 2. Deploy Systemd Service
```bash
# Copy service file
sudo cp pgbouncer.service /etc/systemd/system/

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable pgbouncer
```

## Service Management

### Start/Stop/Restart PgBouncer
```bash
# Start PgBouncer
sudo systemctl start pgbouncer

# Check status
sudo systemctl status pgbouncer

# Restart PgBouncer
sudo systemctl restart pgbouncer

# Stop PgBouncer
sudo systemctl stop pgbouncer

# Reload configuration without restart
sudo systemctl reload pgbouncer
```

### Check Logs
```bash
# View service logs
sudo journalctl -u pgbouncer -f

# View PgBouncer log file
sudo tail -f /var/log/pgbouncer/pgbouncer.log

# Check recent errors
sudo grep -i error /var/log/pgbouncer/pgbouncer.log | tail -10
```

## Testing and Verification

### 1. Basic Connectivity Tests
```bash
# Make monitoring script executable
chmod +x monitoring_commands.sh

# Run basic tests
./monitoring_commands.sh test

# Run health check
./monitoring_commands.sh health

# View all statistics
./monitoring_commands.sh stats
```

### 2. Manual Connection Tests
```bash
# Test direct PostgreSQL connection
psql -h localhost -p 5432 -U subscription_user -d subscription_platform

# Test PgBouncer connection
psql -h localhost -p 6432 -U subscription_user -d subscription_platform

# Test PgBouncer admin interface
psql -h localhost -p 6432 -U subscription_user -d pgbouncer
```

### 3. Node.js Testing
```bash
# Install dependencies
npm install pg dotenv

# Run Node.js connection tests
node nodejs_connection_examples.js
```

## Performance Monitoring

### Real-time Monitoring
```bash
# Start real-time monitoring (Ctrl+C to stop)
./monitoring_commands.sh monitor
```

### Key Metrics to Watch

#### Pool Statistics
```sql
-- Connect to PgBouncer admin
psql -h localhost -p 6432 -U subscription_user -d pgbouncer

-- View pool status
SHOW POOLS;

-- View client statistics
SHOW STATS;

-- View active connections
SHOW CLIENTS;

-- View server connections
SHOW SERVERS;

-- View configuration
SHOW CONFIG;
```

#### Important Metrics:
- **cl_waiting**: Number of clients waiting for connections (should be 0 or low)
- **sv_idle**: Number of idle server connections
- **sv_active**: Number of active server connections
- **maxwait**: Maximum wait time for a connection (in microseconds)
- **avg_wait_time**: Average wait time for connections

### Performance Benchmarking
```bash
# Run performance benchmark
./monitoring_commands.sh benchmark 50 30

# Compare with direct PostgreSQL
pgbench -h localhost -p 5432 -U subscription_user -d subscription_platform -c 50 -j 4 -T 30 -S
pgbench -h localhost -p 6432 -U subscription_user -d subscription_platform -c 50 -j 4 -T 30 -S
```

## Troubleshooting

### Common Connection Issues

#### 1. Authentication Failed
```bash
# Check if user exists in userlist.txt
cat /etc/pgbouncer/userlist.txt

# Verify MD5 hash generation
echo -n "subscription_pass_2024subscription_user" | md5sum

# Check PostgreSQL user permissions
psql -h localhost -p 5432 -U subscription_user -d subscription_platform -c "SELECT current_user;"
```

#### 2. Service Won't Start
```bash
# Check service status
sudo systemctl status pgbouncer

# Check configuration syntax
sudo -u pgbouncer pgbouncer -d /etc/pgbouncer/pgbouncer.ini

# Check file permissions
ls -la /etc/pgbouncer/

# Check log files
sudo journalctl -u pgbouncer --no-pager -n 50
```

#### 3. Connection Refused
```bash
# Check if PgBouncer is listening
sudo ss -tlnp | grep 6432

# Check firewall rules
sudo ufw status

# Test local connectivity
telnet localhost 6432
```

### Database-Specific Issues

#### 1. Too Many Connections
```sql
-- Check current connections in PostgreSQL
SELECT count(*) FROM pg_stat_activity;

-- Check connection limits
SELECT setting FROM pg_settings WHERE name = 'max_connections';

-- View connections by application
SELECT application_name, count(*)
FROM pg_stat_activity
GROUP BY application_name;
```

#### 2. Slow Queries
```sql
-- In PgBouncer admin interface
SHOW STATS;

-- Check average query times
SELECT database, avg_query_time, avg_xact_time
FROM SHOW STATS;

-- In PostgreSQL, check slow queries
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

## Common Issues

### Issue 1: High Number of Waiting Clients
**Symptoms**: `cl_waiting` count is consistently high

**Solutions**:
1. Increase `default_pool_size` in pgbouncer.ini
2. Increase `max_db_connections`
3. Optimize slow queries in the application
4. Consider switching to transaction pooling mode

### Issue 2: Authentication Failures
**Symptoms**: "authentication failed" errors in logs

**Solutions**:
1. Verify MD5 hash in userlist.txt
2. Check PostgreSQL user permissions
3. Ensure auth_type is set to "md5"
4. Verify password matches exactly

### Issue 3: Connection Timeouts
**Symptoms**: Connection timeout errors

**Solutions**:
1. Increase `query_wait_timeout`
2. Increase `client_login_timeout`
3. Check network connectivity
4. Verify PostgreSQL is accepting connections

### Issue 4: Memory Usage Issues
**Symptoms**: High memory consumption

**Solutions**:
1. Reduce `max_client_conn`
2. Reduce `default_pool_size`
3. Set appropriate `server_idle_timeout`
4. Monitor with `htop` or `ps`

## Optimization Tips

### Connection Pool Sizing
```ini
# For high-traffic applications (300-600 users)
default_pool_size = 75
max_client_conn = 500
max_db_connections = 350
reserve_pool_size = 10
```

### Timeout Tuning
```ini
# Balanced timeouts for subscription platform
server_idle_timeout = 600
client_idle_timeout = 600
query_timeout = 900
query_wait_timeout = 120
```

### Monitoring Setup
```bash
# Set up monitoring cron job
echo "*/5 * * * * /path/to/monitoring_commands.sh health >> /var/log/pgbouncer/health.log 2>&1" | sudo crontab -u pgbouncer -
```

### Log Rotation
```bash
# Verify log rotation is set up
sudo logrotate -d /etc/logrotate.d/pgbouncer
```

## Environment Variables (.env file)
```bash
# Create .env file for Node.js applications
cat > .env << 'EOF'
# PgBouncer Configuration
PGBOUNCER_HOST=localhost
PGBOUNCER_PORT=6432

# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=subscription_platform
POSTGRES_USER=subscription_user
POSTGRES_PASSWORD=subscription_pass_2024

# Pool Configuration
POOL_MAX_CONNECTIONS=75
POOL_IDLE_TIMEOUT=10000
POOL_CONNECTION_TIMEOUT=5000

# Application Configuration
APP_NAME=subscription_platform_pooled
POSTGRES_SSL=false
EOF
```

## Production Checklist

### Before Going Live
- [ ] PgBouncer service is enabled for auto-start
- [ ] Configuration files have correct permissions
- [ ] Log rotation is configured
- [ ] Monitoring is set up
- [ ] Performance benchmarks completed
- [ ] Backup of original PostgreSQL connection strings
- [ ] Application connection strings updated to use PgBouncer
- [ ] Health checks are passing
- [ ] No waiting clients under normal load

### Post-Deployment Monitoring
- [ ] Monitor pool statistics regularly
- [ ] Check for authentication errors
- [ ] Watch for connection wait times
- [ ] Monitor PostgreSQL connection count
- [ ] Review log files daily
- [ ] Performance comparison with direct connections

### Emergency Rollback Plan
```bash
# If issues occur, quickly rollback by stopping PgBouncer
sudo systemctl stop pgbouncer

# Update application to use direct PostgreSQL connections
# Change connection port from 6432 back to 5432 in application config
```

This guide provides comprehensive coverage for setting up, monitoring, and troubleshooting PgBouncer in your subscription platform environment.