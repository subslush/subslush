# Database Index Maintenance and Monitoring Guide

## Table of Contents
- [Quick Reference](#quick-reference)
- [Daily Operations](#daily-operations)
- [Weekly Maintenance](#weekly-maintenance)
- [Monthly Reviews](#monthly-reviews)
- [Quarterly Optimization](#quarterly-optimization)
- [Emergency Procedures](#emergency-procedures)
- [Automation Scripts](#automation-scripts)
- [Performance Benchmarking](#performance-benchmarking)

## Quick Reference

### Essential Commands
```bash
# Quick health check
psql -d subscription_platform -f monitor_indexes.sql

# Performance test
psql -d subscription_platform -f test_index_performance.sql

# Apply new indexes
psql -d subscription_platform -f performance_indexes.sql

# Update statistics
psql -d subscription_platform -c "ANALYZE;"
```

### Emergency Commands
```sql
-- Check database connections
SELECT count(*) FROM pg_stat_activity;

-- Kill long-running queries
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE state = 'active' AND query_start < NOW() - INTERVAL '5 minutes';

-- Quick index rebuild
REINDEX INDEX CONCURRENTLY problematic_index_name;
```

## Daily Operations

### Morning Health Check (5 minutes)

1. **Quick Index Usage Review**
   ```sql
   -- Run daily monitoring
   SELECT * FROM daily_index_stats
   WHERE usage_level = 'UNUSED' OR last_updated < NOW() - INTERVAL '1 day';
   ```

2. **Cache Performance Check**
   ```sql
   -- Check cache hit ratios
   SELECT
       'Overall Cache Hit Ratio' as metric,
       ROUND(
           SUM(idx_blks_hit)::NUMERIC /
           NULLIF(SUM(idx_blks_hit + idx_blks_read), 0) * 100, 2
       )::TEXT || '%' as value
   FROM pg_statio_user_indexes
   WHERE schemaname = 'public';
   ```

3. **Alert Check**
   ```sql
   -- Run alert query from monitor_indexes.sql
   \i monitor_indexes.sql
   ```

### Performance Monitoring Script
Create a daily monitoring script:

```bash
#!/bin/bash
# daily_index_check.sh

DBNAME="subscription_platform"
LOGFILE="/var/log/postgresql/daily_index_check.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Starting daily index check" >> $LOGFILE

# Check for unused indexes
UNUSED_COUNT=$(psql -d $DBNAME -t -c "
    SELECT COUNT(*) FROM pg_stat_user_indexes
    WHERE schemaname = 'public' AND idx_scan = 0 AND indexname NOT LIKE '%_pkey';
")

echo "[$DATE] Unused indexes: $UNUSED_COUNT" >> $LOGFILE

# Check cache hit ratio
CACHE_RATIO=$(psql -d $DBNAME -t -c "
    SELECT ROUND(
        SUM(idx_blks_hit)::NUMERIC /
        NULLIF(SUM(idx_blks_hit + idx_blks_read), 0) * 100, 2
    ) FROM pg_statio_user_indexes WHERE schemaname = 'public';
")

echo "[$DATE] Cache hit ratio: ${CACHE_RATIO}%" >> $LOGFILE

# Alert if cache ratio is below threshold
if (( $(echo "$CACHE_RATIO < 95" | bc -l) )); then
    echo "[$DATE] WARNING: Cache hit ratio below 95%" >> $LOGFILE
    # Send alert (email, Slack, etc.)
fi

echo "[$DATE] Daily index check completed" >> $LOGFILE
```

## Weekly Maintenance

### Sunday Maintenance Window (30 minutes)

#### 1. Statistics Update
```sql
-- Update table statistics for better query planning
ANALYZE users;
ANALYZE subscriptions;
ANALYZE credits;
ANALYZE admin_tasks;

-- Verify statistics update
SELECT
    schemaname,
    tablename,
    last_analyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY last_analyze DESC;
```

#### 2. Index Usage Analysis
```sql
-- Comprehensive usage review
\i monitor_indexes.sql > weekly_index_report.txt

-- Check for indexes with low usage
SELECT
    indexname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    CASE
        WHEN idx_scan = 0 THEN 'Consider dropping'
        WHEN idx_scan < 10 THEN 'Very low usage'
        WHEN idx_scan < 100 THEN 'Low usage'
        ELSE 'Good usage'
    END as recommendation
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;
```

#### 3. Performance Trend Analysis
```bash
#!/bin/bash
# weekly_performance_check.sh

DBNAME="subscription_platform"
REPORT_FILE="/tmp/weekly_index_report_$(date +%Y%m%d).txt"

echo "Weekly Index Performance Report - $(date)" > $REPORT_FILE
echo "===========================================" >> $REPORT_FILE

# Index sizes
echo -e "\nIndex Sizes:" >> $REPORT_FILE
psql -d $DBNAME -c "
    SELECT
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 20;
" >> $REPORT_FILE

# Usage statistics
echo -e "\nTop Used Indexes:" >> $REPORT_FILE
psql -d $DBNAME -c "
    SELECT
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    ORDER BY idx_scan DESC
    LIMIT 15;
" >> $REPORT_FILE

echo "Report saved to: $REPORT_FILE"
```

## Monthly Reviews

### First Saturday of Month (60 minutes)

#### 1. Index Bloat Assessment
```sql
-- Check for potential index bloat
WITH index_bloat AS (
    SELECT
        schemaname,
        tablename,
        indexname,
        pg_relation_size(indexrelid) as size_bytes,
        idx_scan,
        CASE
            WHEN pg_relation_size(indexrelid) > 104857600 THEN 'Large (>100MB)'
            WHEN pg_relation_size(indexrelid) > 10485760 THEN 'Medium (>10MB)'
            ELSE 'Small (<10MB)'
        END as size_category
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
)
SELECT
    indexname,
    size_category,
    pg_size_pretty(size_bytes) as size,
    idx_scan,
    CASE
        WHEN size_category = 'Large (>100MB)' AND idx_scan > 10000 THEN 'Consider REINDEX'
        WHEN size_category = 'Large (>100MB)' AND idx_scan < 100 THEN 'Consider dropping'
        WHEN size_category = 'Medium (>10MB)' AND idx_scan = 0 THEN 'Consider dropping'
        ELSE 'No action needed'
    END as recommendation
FROM index_bloat
ORDER BY size_bytes DESC;
```

#### 2. Query Performance Review
```sql
-- Run comprehensive performance test
\i test_index_performance.sql

-- Check for slow queries (requires pg_stat_statements)
SELECT
    query,
    calls,
    mean_time,
    stddev_time,
    rows
FROM pg_stat_statements
WHERE mean_time > 100  -- Queries slower than 100ms
ORDER BY mean_time DESC
LIMIT 20;
```

#### 3. Missing Index Detection
```sql
-- Tables with high sequential scan activity
SELECT
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    ROUND(seq_tup_read::NUMERIC / GREATEST(seq_scan, 1), 0) as avg_rows_per_seq_scan,
    CASE
        WHEN seq_scan > idx_scan AND seq_scan > 1000 THEN 'High priority for new indexes'
        WHEN seq_scan > idx_scan AND seq_scan > 100 THEN 'Consider adding indexes'
        ELSE 'OK'
    END as recommendation
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_scan DESC;
```

#### 4. Capacity Planning
```sql
-- Index growth tracking
SELECT
    tablename,
    COUNT(*) as index_count,
    pg_size_pretty(SUM(pg_relation_size(indexrelid))) as total_index_size,
    pg_size_pretty(pg_relation_size(oid)) as table_size,
    ROUND(
        SUM(pg_relation_size(indexrelid))::NUMERIC /
        NULLIF(pg_relation_size(oid), 0) * 100, 2
    ) as index_to_table_ratio
FROM pg_stat_user_indexes
JOIN pg_class ON pg_class.relname = tablename
WHERE schemaname = 'public'
GROUP BY tablename, oid
ORDER BY SUM(pg_relation_size(indexrelid)) DESC;
```

## Quarterly Optimization

### Comprehensive Review (2-3 hours)

#### 1. Index Strategy Review
```sql
-- Complete index analysis
CREATE TEMP TABLE quarterly_analysis AS
SELECT
    i.schemaname,
    i.tablename,
    i.indexname,
    i.idx_scan,
    i.idx_tup_read,
    i.idx_tup_fetch,
    pg_relation_size(i.indexrelid) as size_bytes,
    pg_get_indexdef(i.indexrelid) as definition,
    t.seq_scan,
    t.seq_tup_read,
    t.n_tup_ins + t.n_tup_upd + t.n_tup_del as table_modifications
FROM pg_stat_user_indexes i
JOIN pg_stat_user_tables t ON i.tablename = t.tablename
WHERE i.schemaname = 'public';

-- Analyze results
SELECT
    tablename,
    COUNT(*) as total_indexes,
    COUNT(CASE WHEN idx_scan = 0 THEN 1 END) as unused_indexes,
    pg_size_pretty(SUM(size_bytes)) as total_index_size,
    MAX(idx_scan) as max_scans,
    AVG(CASE WHEN idx_scan > 0 THEN idx_scan END) as avg_scans_used_indexes
FROM quarterly_analysis
GROUP BY tablename
ORDER BY SUM(size_bytes) DESC;
```

#### 2. REINDEX Operations
```sql
-- Identify indexes for reindexing
SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    idx_scan,
    'REINDEX INDEX CONCURRENTLY ' || indexname || ';' as reindex_command
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND pg_relation_size(indexrelid) > 104857600  -- > 100MB
AND idx_scan > 1000  -- Heavily used
ORDER BY pg_relation_size(indexrelid) DESC;
```

#### 3. New Index Recommendations
Create a script to analyze query patterns and suggest new indexes:

```bash
#!/bin/bash
# quarterly_index_optimization.sh

DBNAME="subscription_platform"
REPORT_FILE="/tmp/quarterly_index_optimization_$(date +%Y%m%d).txt"

echo "Quarterly Index Optimization Report - $(date)" > $REPORT_FILE
echo "=============================================" >> $REPORT_FILE

# High sequential scan tables
echo -e "\nTables with High Sequential Scan Activity:" >> $REPORT_FILE
psql -d $DBNAME -c "
    SELECT
        tablename,
        seq_scan,
        seq_tup_read,
        'Consider adding indexes for frequent WHERE clauses' as recommendation
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    AND seq_scan > 1000
    ORDER BY seq_scan DESC;
" >> $REPORT_FILE

# Unused indexes
echo -e "\nUnused Indexes (Candidates for Removal):" >> $REPORT_FILE
psql -d $DBNAME -c "
    SELECT
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as wasted_space,
        'DROP INDEX IF EXISTS ' || indexname || ';' as drop_command
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    AND idx_scan = 0
    AND indexname NOT LIKE '%_pkey'
    ORDER BY pg_relation_size(indexrelid) DESC;
" >> $REPORT_FILE

# Index efficiency analysis
echo -e "\nIndex Efficiency Analysis:" >> $REPORT_FILE
psql -d $DBNAME -c "
    SELECT
        indexname,
        idx_scan,
        CASE
            WHEN idx_tup_read > 0 THEN
                ROUND(idx_tup_fetch::NUMERIC / idx_tup_read * 100, 2)
            ELSE 0
        END as efficiency_pct,
        CASE
            WHEN idx_tup_fetch::NUMERIC / NULLIF(idx_tup_read, 0) > 0.9 THEN 'Poor efficiency'
            WHEN idx_tup_fetch::NUMERIC / NULLIF(idx_tup_read, 0) > 0.5 THEN 'Fair efficiency'
            ELSE 'Good efficiency'
        END as rating
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    AND idx_scan > 100
    ORDER BY efficiency_pct DESC;
" >> $REPORT_FILE

echo "Quarterly optimization report saved to: $REPORT_FILE"
```

## Emergency Procedures

### High Load Situation

1. **Immediate Assessment**
   ```sql
   -- Check active queries
   SELECT pid, query_start, state, query
   FROM pg_stat_activity
   WHERE state = 'active'
   ORDER BY query_start;

   -- Check waiting queries
   SELECT pid, wait_event_type, wait_event, query
   FROM pg_stat_activity
   WHERE wait_event IS NOT NULL;
   ```

2. **Quick Relief Actions**
   ```sql
   -- Terminate long-running queries
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'active'
   AND query_start < NOW() - INTERVAL '10 minutes'
   AND query NOT LIKE '%REINDEX%';

   -- Force statistics update
   ANALYZE;
   ```

### Index Corruption

1. **Detection**
   ```sql
   -- Check for invalid indexes
   SELECT indexname FROM pg_indexes
   WHERE schemaname = 'public'
   AND indexrelid IN (
       SELECT indexrelid FROM pg_index WHERE NOT indisvalid
   );
   ```

2. **Recovery**
   ```sql
   -- Rebuild corrupted index
   REINDEX INDEX CONCURRENTLY corrupted_index_name;

   -- If CONCURRENTLY fails, during maintenance window:
   REINDEX INDEX corrupted_index_name;
   ```

### Memory Issues

1. **Index Cache Optimization**
   ```sql
   -- Check shared buffer usage
   SELECT
       schemaname,
       tablename,
       indexname,
       ROUND(
           (idx_blks_hit::NUMERIC / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100, 2
       ) as cache_hit_ratio
   FROM pg_statio_user_indexes
   WHERE schemaname = 'public'
   AND (idx_blks_hit + idx_blks_read) > 1000
   ORDER BY cache_hit_ratio ASC;
   ```

## Automation Scripts

### Cron Job Setup

```bash
# Add to crontab for automated maintenance
# crontab -e

# Daily index health check (6 AM)
0 6 * * * /path/to/daily_index_check.sh

# Weekly maintenance (Sunday 2 AM)
0 2 * * 0 /path/to/weekly_maintenance.sh

# Monthly review (First Saturday 1 AM)
0 1 1-7 * 6 /path/to/monthly_review.sh

# Quarterly optimization (First Monday of quarter 1 AM)
0 1 1-7 1,4,7,10 1 /path/to/quarterly_optimization.sh
```

### Automated Alerting Script

```bash
#!/bin/bash
# index_alerting.sh

DBNAME="subscription_platform"
ALERT_EMAIL="admin@example.com"
SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"

# Check cache hit ratio
CACHE_RATIO=$(psql -d $DBNAME -t -c "
    SELECT ROUND(
        SUM(idx_blks_hit)::NUMERIC /
        NULLIF(SUM(idx_blks_hit + idx_blks_read), 0) * 100, 2
    ) FROM pg_statio_user_indexes WHERE schemaname = 'public';
")

if (( $(echo "$CACHE_RATIO < 90" | bc -l) )); then
    MESSAGE="CRITICAL: Index cache hit ratio is ${CACHE_RATIO}% (threshold: 90%)"
    echo "$MESSAGE" | mail -s "Database Index Alert" $ALERT_EMAIL

    # Slack notification
    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"$MESSAGE\"}" \
        $SLACK_WEBHOOK
fi

# Check for unused large indexes
UNUSED_SIZE=$(psql -d $DBNAME -t -c "
    SELECT COALESCE(SUM(pg_relation_size(indexrelid)), 0)
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    AND idx_scan = 0
    AND pg_relation_size(indexrelid) > 10485760;
")

if [ "$UNUSED_SIZE" -gt 104857600 ]; then  # 100MB
    UNUSED_SIZE_MB=$((UNUSED_SIZE / 1024 / 1024))
    MESSAGE="WARNING: ${UNUSED_SIZE_MB}MB of unused index space detected"
    echo "$MESSAGE" | mail -s "Database Index Alert" $ALERT_EMAIL
fi
```

## Performance Benchmarking

### Benchmark Test Suite

```bash
#!/bin/bash
# benchmark_indexes.sh

DBNAME="subscription_platform"
RESULTS_FILE="/tmp/index_benchmark_$(date +%Y%m%d_%H%M%S).txt"

echo "Index Performance Benchmark - $(date)" > $RESULTS_FILE
echo "========================================" >> $RESULTS_FILE

# Warm up the cache
psql -d $DBNAME -c "SELECT COUNT(*) FROM users;" > /dev/null
psql -d $DBNAME -c "SELECT COUNT(*) FROM subscriptions;" > /dev/null
psql -d $DBNAME -c "SELECT COUNT(*) FROM credits;" > /dev/null

# Run performance tests
echo -e "\nRunning performance tests..." >> $RESULTS_FILE
psql -d $DBNAME -f test_index_performance.sql >> $RESULTS_FILE 2>&1

echo "Benchmark completed. Results saved to: $RESULTS_FILE"
```

### Performance Comparison

```sql
-- Before/after index performance comparison
CREATE TEMP TABLE benchmark_results (
    test_name TEXT,
    execution_time_ms NUMERIC,
    query_plan TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Insert baseline measurements
-- Run queries and record times
\timing on

-- Test 1: User authentication
INSERT INTO benchmark_results (test_name, execution_time_ms, query_plan)
SELECT 'user_auth_test',
       EXTRACT(EPOCH FROM (end_time - start_time)) * 1000,
       'Index scan on users(email)'
FROM (
    SELECT clock_timestamp() as start_time
    UNION ALL
    SELECT clock_timestamp() as end_time
) t;

-- Continue with other tests...
```

## Summary

This maintenance guide provides:
- **Daily**: 5-minute health checks
- **Weekly**: 30-minute comprehensive maintenance
- **Monthly**: 60-minute performance reviews
- **Quarterly**: 2-3 hour optimization sessions

Key tools:
- `monitor_indexes.sql` - Real-time monitoring
- `test_index_performance.sql` - Performance testing
- Automated scripts for regular maintenance
- Emergency procedures for critical issues

Regular execution of these procedures will ensure optimal database performance and early detection of potential issues.