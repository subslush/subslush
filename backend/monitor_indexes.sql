-- =====================================================
-- Index Monitoring and Maintenance Queries
-- =====================================================
-- Description: Comprehensive index monitoring for subscription platform
-- Usage: Run these queries regularly to monitor index health and performance
-- Database: subscription_platform

-- =====================================================
-- INDEX USAGE STATISTICS
-- =====================================================

-- 1. Overall Index Usage Summary
\echo '1. INDEX USAGE SUMMARY'
\echo '====================='

SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    CASE
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_scan < 10 THEN 'LOW USAGE'
        WHEN idx_scan < 100 THEN 'MODERATE USAGE'
        WHEN idx_scan < 1000 THEN 'HIGH USAGE'
        ELSE 'VERY HIGH USAGE'
    END as usage_level,
    ROUND(
        CASE
            WHEN idx_scan > 0 THEN (idx_tup_read::NUMERIC / idx_scan)
            ELSE 0
        END, 2
    ) as avg_tuples_per_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- 2. Unused Indexes (Potential candidates for removal)
\echo ''
\echo '2. UNUSED INDEXES'
\echo '=================='

SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as wasted_space,
    pg_get_indexdef(indexrelid) as index_definition
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND idx_scan = 0
AND indexname NOT LIKE '%_pkey'  -- Exclude primary keys
ORDER BY pg_relation_size(indexrelid) DESC;

-- 3. Most Scanned Indexes (High-value indexes)
\echo ''
\echo '3. MOST SCANNED INDEXES'
\echo '======================='

SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    ROUND((idx_scan::NUMERIC / GREATEST(1, (SELECT SUM(idx_scan) FROM pg_stat_user_indexes WHERE schemaname = 'public'))) * 100, 2) as pct_of_total_scans
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND idx_scan > 0
ORDER BY idx_scan DESC
LIMIT 20;

-- 4. Index Efficiency (Selectivity Analysis)
\echo ''
\echo '4. INDEX EFFICIENCY'
\echo '==================='

SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    CASE
        WHEN idx_tup_read > 0 THEN
            ROUND((idx_tup_fetch::NUMERIC / idx_tup_read * 100), 2)
        ELSE 0
    END as fetch_ratio_pct,
    CASE
        WHEN idx_tup_fetch::NUMERIC / NULLIF(idx_tup_read, 0) < 0.1 THEN 'Excellent'
        WHEN idx_tup_fetch::NUMERIC / NULLIF(idx_tup_read, 0) < 0.5 THEN 'Good'
        WHEN idx_tup_fetch::NUMERIC / NULLIF(idx_tup_read, 0) < 0.9 THEN 'Fair'
        ELSE 'Poor'
    END as efficiency_rating
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND idx_scan > 0
ORDER BY idx_scan DESC;

-- =====================================================
-- TABLE ACCESS PATTERNS
-- =====================================================

-- 5. Table Scan vs Index Scan Ratio
\echo ''
\echo '5. TABLE SCAN vs INDEX SCAN RATIO'
\echo '=================================='

SELECT
    schemaname,
    tablename,
    seq_scan as sequential_scans,
    seq_tup_read as seq_tuples_read,
    idx_scan as index_scans,
    idx_tup_fetch as idx_tuples_fetched,
    CASE
        WHEN (seq_scan + idx_scan) > 0 THEN
            ROUND((idx_scan::NUMERIC / (seq_scan + idx_scan) * 100), 2)
        ELSE 0
    END as index_usage_pct,
    CASE
        WHEN seq_scan > idx_scan THEN 'Consider adding indexes'
        WHEN idx_scan > seq_scan * 10 THEN 'Excellent index usage'
        WHEN idx_scan > seq_scan THEN 'Good index usage'
        ELSE 'Poor index usage'
    END as recommendation
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY (seq_scan + idx_scan) DESC;

-- 6. Tables with High Sequential Scan Activity
\echo ''
\echo '6. HIGH SEQUENTIAL SCAN ACTIVITY'
\echo '================================='

SELECT
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    ROUND(seq_tup_read::NUMERIC / GREATEST(1, seq_scan), 0) as avg_rows_per_scan,
    pg_size_pretty(pg_relation_size(oid)) as table_size,
    'Consider adding indexes for common WHERE clauses' as recommendation
FROM pg_stat_user_tables
JOIN pg_class ON pg_class.relname = tablename
WHERE schemaname = 'public'
AND seq_scan > 100  -- Tables with significant sequential scan activity
ORDER BY seq_scan DESC;

-- =====================================================
-- INDEX SIZE AND BLOAT ANALYSIS
-- =====================================================

-- 7. Index Size Analysis
\echo ''
\echo '7. INDEX SIZE ANALYSIS'
\echo '======================'

SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    pg_size_pretty(pg_relation_size(indrelid)) as table_size,
    ROUND(
        (pg_relation_size(indexrelid)::NUMERIC /
         NULLIF(pg_relation_size(indrelid), 0) * 100), 2
    ) as index_to_table_ratio_pct
FROM pg_stat_user_indexes
JOIN pg_index ON pg_index.indexrelid = pg_stat_user_indexes.indexrelid
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 8. Index Bloat Estimation
\echo ''
\echo '8. INDEX BLOAT ESTIMATION'
\echo '========================='

WITH index_bloat AS (
    SELECT
        schemaname,
        tablename,
        indexname,
        pg_relation_size(indexrelid) as index_size,
        idx_scan,
        CASE
            WHEN pg_relation_size(indexrelid) > 10485760 THEN  -- 10MB
                'Monitor for bloat'
            WHEN pg_relation_size(indexrelid) > 104857600 THEN  -- 100MB
                'Check bloat regularly'
            ELSE 'Size OK'
        END as bloat_risk
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
)
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(index_size) as size,
    idx_scan as scans,
    bloat_risk,
    CASE
        WHEN bloat_risk != 'Size OK' AND idx_scan < 100 THEN 'Consider REINDEX'
        WHEN bloat_risk != 'Size OK' THEN 'Monitor closely'
        ELSE 'No action needed'
    END as recommendation
FROM index_bloat
ORDER BY index_size DESC;

-- =====================================================
-- PERFORMANCE IMPACT ANALYSIS
-- =====================================================

-- 9. Slow Query Index Candidates
\echo ''
\echo '9. SLOW QUERY INDEX CANDIDATES'
\echo '==============================='

-- This requires pg_stat_statements extension
-- Check if it's available and provide recommendations

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        RAISE NOTICE 'pg_stat_statements is available - run slow query analysis';
    ELSE
        RAISE NOTICE 'pg_stat_statements not available - install for detailed query analysis';
        RAISE NOTICE 'Run: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;';
    END IF;
END $$;

-- 10. Index Maintenance Schedule Recommendations
\echo ''
\echo '10. MAINTENANCE RECOMMENDATIONS'
\echo '==============================='

WITH maintenance_schedule AS (
    SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan,
        pg_relation_size(indexrelid) as size_bytes,
        CASE
            WHEN pg_relation_size(indexrelid) > 1073741824 THEN 'Weekly REINDEX'  -- 1GB
            WHEN pg_relation_size(indexrelid) > 104857600 THEN 'Monthly REINDEX'  -- 100MB
            WHEN pg_relation_size(indexrelid) > 10485760 THEN 'Quarterly REINDEX'  -- 10MB
            ELSE 'Annual review'
        END as maintenance_frequency,
        CASE
            WHEN idx_scan = 0 THEN 'Consider dropping'
            WHEN idx_scan < 10 THEN 'Low priority maintenance'
            WHEN idx_scan < 1000 THEN 'Standard maintenance'
            ELSE 'High priority maintenance'
        END as priority
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
)
SELECT
    tablename,
    indexname,
    pg_size_pretty(size_bytes) as size,
    idx_scan as scans,
    maintenance_frequency,
    priority,
    CASE
        WHEN priority = 'Consider dropping' THEN 'DROP INDEX ' || indexname || ';'
        WHEN maintenance_frequency LIKE '%REINDEX%' THEN 'REINDEX INDEX CONCURRENTLY ' || indexname || ';'
        ELSE 'ANALYZE ' || tablename || ';'
    END as recommended_command
FROM maintenance_schedule
ORDER BY
    CASE priority
        WHEN 'High priority maintenance' THEN 1
        WHEN 'Standard maintenance' THEN 2
        WHEN 'Low priority maintenance' THEN 3
        WHEN 'Consider dropping' THEN 4
    END,
    size_bytes DESC;

-- =====================================================
-- REAL-TIME MONITORING QUERIES
-- =====================================================

-- 11. Current Index Activity
\echo ''
\echo '11. CURRENT INDEX ACTIVITY'
\echo '=========================='

SELECT
    now() as snapshot_time,
    schemaname,
    tablename,
    indexname,
    idx_scan as total_scans,
    idx_tup_read as total_tuples_read,
    idx_tup_fetch as total_tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND idx_scan > 0
ORDER BY idx_scan DESC
LIMIT 10;

-- 12. Index Cache Hit Ratio
\echo ''
\echo '12. INDEX CACHE HIT RATIO'
\echo '========================='

SELECT
    schemaname,
    tablename,
    indexname,
    COALESCE(
        ROUND(
            (idx_blks_hit::NUMERIC / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100,
            2
        ), 0
    ) as cache_hit_ratio_pct,
    idx_blks_hit as cache_hits,
    idx_blks_read as disk_reads,
    CASE
        WHEN (idx_blks_hit + idx_blks_read) = 0 THEN 'No activity'
        WHEN ROUND((idx_blks_hit::NUMERIC / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100, 2) > 95 THEN 'Excellent'
        WHEN ROUND((idx_blks_hit::NUMERIC / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100, 2) > 90 THEN 'Good'
        WHEN ROUND((idx_blks_hit::NUMERIC / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100, 2) > 80 THEN 'Fair'
        ELSE 'Poor - Consider memory tuning'
    END as performance_rating
FROM pg_statio_user_indexes
WHERE schemaname = 'public'
AND (idx_blks_hit + idx_blks_read) > 0
ORDER BY cache_hit_ratio_pct ASC;

-- =====================================================
-- AUTOMATED MONITORING FUNCTIONS
-- =====================================================

-- 13. Create monitoring views for regular checks
\echo ''
\echo '13. CREATING MONITORING VIEWS'
\echo '============================='

-- View for daily index monitoring
CREATE OR REPLACE VIEW daily_index_stats AS
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    CASE
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_scan < 10 THEN 'LOW'
        WHEN idx_scan < 100 THEN 'MODERATE'
        ELSE 'HIGH'
    END as usage_level,
    now() as last_updated
FROM pg_stat_user_indexes
WHERE schemaname = 'public';

-- View for index health monitoring
CREATE OR REPLACE VIEW index_health_summary AS
SELECT
    tablename,
    COUNT(*) as total_indexes,
    COUNT(CASE WHEN idx_scan = 0 THEN 1 END) as unused_indexes,
    COUNT(CASE WHEN idx_scan > 0 THEN 1 END) as used_indexes,
    SUM(pg_relation_size(indexrelid)) as total_index_size,
    pg_size_pretty(SUM(pg_relation_size(indexrelid))) as total_size_pretty,
    ROUND(
        AVG(CASE WHEN idx_scan > 0 THEN idx_scan ELSE NULL END), 2
    ) as avg_scans_used_indexes
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY total_index_size DESC;

\echo 'Views created: daily_index_stats, index_health_summary'

-- =====================================================
-- MONITORING ALERTS AND THRESHOLDS
-- =====================================================

-- 14. Index Health Alerts
\echo ''
\echo '14. INDEX HEALTH ALERTS'
\echo '======================='

WITH alerts AS (
    SELECT
        'UNUSED_INDEX' as alert_type,
        'HIGH' as severity,
        schemaname || '.' || tablename || '.' || indexname as object_name,
        'Index has never been used - consider dropping' as message,
        pg_size_pretty(pg_relation_size(indexrelid)) as wasted_space
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    AND idx_scan = 0
    AND indexname NOT LIKE '%_pkey'
    AND pg_relation_size(indexrelid) > 10485760  -- 10MB

    UNION ALL

    SELECT
        'LARGE_UNUSED_INDEX' as alert_type,
        'CRITICAL' as severity,
        schemaname || '.' || tablename || '.' || indexname as object_name,
        'Large unused index wasting significant space' as message,
        pg_size_pretty(pg_relation_size(indexrelid)) as wasted_space
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    AND idx_scan = 0
    AND pg_relation_size(indexrelid) > 104857600  -- 100MB

    UNION ALL

    SELECT
        'HIGH_SEQ_SCAN' as alert_type,
        'MEDIUM' as severity,
        schemaname || '.' || tablename as object_name,
        'High sequential scan activity - consider adding indexes' as message,
        seq_scan::TEXT || ' sequential scans' as wasted_space
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    AND seq_scan > 1000
    AND seq_scan > idx_scan

    UNION ALL

    SELECT
        'POOR_CACHE_HIT' as alert_type,
        'MEDIUM' as severity,
        schemaname || '.' || tablename || '.' || indexname as object_name,
        'Poor cache hit ratio - consider memory tuning' as message,
        ROUND((idx_blks_hit::NUMERIC / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100, 2)::TEXT || '% hit ratio' as wasted_space
    FROM pg_statio_user_indexes
    WHERE schemaname = 'public'
    AND (idx_blks_hit + idx_blks_read) > 1000
    AND ROUND((idx_blks_hit::NUMERIC / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100, 2) < 90
)
SELECT
    alert_type,
    severity,
    object_name,
    message,
    wasted_space,
    now() as alert_time
FROM alerts
ORDER BY
    CASE severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        ELSE 4
    END,
    alert_type;

-- =====================================================
-- SUMMARY AND RECOMMENDATIONS
-- =====================================================

\echo ''
\echo '15. MONITORING SUMMARY'
\echo '====================='

SELECT
    'Total Indexes' as metric,
    COUNT(*)::TEXT as value
FROM pg_stat_user_indexes
WHERE schemaname = 'public'

UNION ALL

SELECT
    'Used Indexes',
    COUNT(*)::TEXT
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND idx_scan > 0

UNION ALL

SELECT
    'Unused Indexes',
    COUNT(*)::TEXT
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND idx_scan = 0
AND indexname NOT LIKE '%_pkey'

UNION ALL

SELECT
    'Total Index Size',
    pg_size_pretty(SUM(pg_relation_size(indexrelid)))
FROM pg_stat_user_indexes
WHERE schemaname = 'public'

UNION ALL

SELECT
    'Average Cache Hit Ratio',
    ROUND(AVG(
        CASE
            WHEN (idx_blks_hit + idx_blks_read) > 0 THEN
                (idx_blks_hit::NUMERIC / (idx_blks_hit + idx_blks_read)) * 100
            ELSE NULL
        END
    ), 2)::TEXT || '%'
FROM pg_statio_user_indexes
WHERE schemaname = 'public';

\echo ''
\echo 'Index monitoring completed!'
\echo 'Regular monitoring recommendations:'
\echo '1. Run this script weekly to monitor index health'
\echo '2. Check for unused indexes monthly'
\echo '3. Monitor cache hit ratios daily'
\echo '4. Review large indexes for bloat quarterly'
\echo '5. Use the created views for automated monitoring'