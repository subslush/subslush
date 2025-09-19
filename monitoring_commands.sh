#!/bin/bash

# =====================================================
# PgBouncer Monitoring and Testing Commands
# =====================================================
# Description: Comprehensive monitoring, testing, and troubleshooting commands
# Usage: ./monitoring_commands.sh [command]
# Available commands: test, monitor, stats, health, benchmark

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
PGBOUNCER_HOST="localhost"
PGBOUNCER_PORT="6432"
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
DATABASE="subscription_platform"
USERNAME="subscription_user"
PGPASSWORD="subscription_pass_2024"

export PGPASSWORD

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

# =====================================================
# BASIC CONNECTIVITY TESTS
# =====================================================

test_postgresql_direct() {
    print_header "Testing Direct PostgreSQL Connection"

    if psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $USERNAME -d $DATABASE -c "SELECT 'Direct PostgreSQL connection successful' as status, version(), now();" 2>/dev/null; then
        print_success "Direct PostgreSQL connection working"
    else
        print_error "Direct PostgreSQL connection failed"
        return 1
    fi
}

test_pgbouncer_connection() {
    print_header "Testing PgBouncer Connection"

    if psql -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d $DATABASE -c "SELECT 'PgBouncer connection successful' as status, version(), now();" 2>/dev/null; then
        print_success "PgBouncer connection working"
    else
        print_error "PgBouncer connection failed"
        return 1
    fi
}

test_pgbouncer_admin() {
    print_header "Testing PgBouncer Admin Interface"

    if psql -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d pgbouncer -c "SHOW POOLS;" 2>/dev/null; then
        print_success "PgBouncer admin interface accessible"
    else
        print_error "PgBouncer admin interface failed"
        return 1
    fi
}

# =====================================================
# PGBOUNCER STATISTICS AND MONITORING
# =====================================================

show_pool_stats() {
    print_header "PgBouncer Pool Statistics"

    psql -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d pgbouncer -c "
        SELECT
            database,
            user_name,
            cl_active as active_clients,
            cl_waiting as waiting_clients,
            sv_active as active_servers,
            sv_idle as idle_servers,
            sv_used as used_servers,
            sv_tested as tested_servers,
            sv_login as login_servers,
            maxwait,
            maxwait_us,
            pool_mode
        FROM SHOW POOLS;
    " 2>/dev/null
}

show_client_stats() {
    print_header "Client Connection Statistics"

    psql -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d pgbouncer -c "
        SELECT
            database,
            total_xact_count,
            total_query_count,
            total_received,
            total_sent,
            total_xact_time,
            total_query_time,
            total_wait_time,
            avg_xact_count,
            avg_query_count,
            avg_recv,
            avg_sent,
            avg_xact_time,
            avg_query_time,
            avg_wait_time
        FROM SHOW STATS;
    " 2>/dev/null
}

show_server_stats() {
    print_header "Server Connection Statistics"

    psql -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d pgbouncer -c "
        SELECT
            host,
            port,
            database,
            state,
            addr,
            port as server_port,
            local_addr,
            local_port,
            connect_time,
            request_time,
            wait,
            wait_us,
            close_needed,
            ptr,
            link,
            remote_pid,
            tls
        FROM SHOW SERVERS;
    " 2>/dev/null
}

show_active_clients() {
    print_header "Active Client Connections"

    psql -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d pgbouncer -c "
        SELECT
            type,
            user_name,
            database,
            state,
            addr,
            port,
            local_addr,
            local_port,
            connect_time,
            request_time,
            wait,
            wait_us,
            close_needed,
            ptr,
            link,
            remote_pid,
            tls
        FROM SHOW CLIENTS
        WHERE state != 'idle';
    " 2>/dev/null
}

show_config() {
    print_header "PgBouncer Configuration"

    psql -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d pgbouncer -c "
        SELECT
            key,
            value,
            changeable
        FROM SHOW CONFIG
        WHERE key IN (
            'pool_mode', 'max_client_conn', 'default_pool_size',
            'max_db_connections', 'server_idle_timeout', 'client_idle_timeout',
            'query_timeout', 'query_wait_timeout', 'listen_port'
        )
        ORDER BY key;
    " 2>/dev/null
}

# =====================================================
# PERFORMANCE MONITORING
# =====================================================

monitor_realtime() {
    print_header "Real-time PgBouncer Monitoring (Press Ctrl+C to stop)"

    while true; do
        clear
        echo -e "${PURPLE}PgBouncer Real-time Monitor - $(date)${NC}"
        echo "=================================="

        # Pool status
        echo -e "\n${CYAN}Pool Status:${NC}"
        psql -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d pgbouncer -c "
            SELECT
                database,
                cl_active as active,
                cl_waiting as waiting,
                sv_active as servers,
                sv_idle as idle,
                maxwait
            FROM SHOW POOLS;
        " -t 2>/dev/null | head -10

        # Recent stats
        echo -e "\n${CYAN}Recent Activity:${NC}"
        psql -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d pgbouncer -c "
            SELECT
                database,
                total_xact_count as transactions,
                total_query_count as queries,
                avg_xact_time as avg_xact_ms,
                avg_query_time as avg_query_ms,
                avg_wait_time as avg_wait_ms
            FROM SHOW STATS;
        " -t 2>/dev/null | head -5

        sleep 5
    done
}

# =====================================================
# HEALTH CHECKS
# =====================================================

health_check() {
    print_header "PgBouncer Health Check"

    local errors=0

    # Check if PgBouncer service is running
    if systemctl is-active --quiet pgbouncer; then
        print_success "PgBouncer service is running"
    else
        print_error "PgBouncer service is not running"
        ((errors++))
    fi

    # Check if PgBouncer port is listening
    if ss -tlnp | grep -q ":6432"; then
        print_success "PgBouncer is listening on port 6432"
    else
        print_error "PgBouncer is not listening on port 6432"
        ((errors++))
    fi

    # Check connectivity
    if test_pgbouncer_connection >/dev/null 2>&1; then
        print_success "PgBouncer connectivity test passed"
    else
        print_error "PgBouncer connectivity test failed"
        ((errors++))
    fi

    # Check pool status
    local waiting_clients=$(psql -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d pgbouncer -c "SELECT SUM(cl_waiting) FROM SHOW POOLS;" -t -A 2>/dev/null | tr -d ' ')

    if [[ "$waiting_clients" =~ ^[0-9]+$ ]] && [ "$waiting_clients" -eq 0 ]; then
        print_success "No clients waiting for connections"
    elif [[ "$waiting_clients" =~ ^[0-9]+$ ]] && [ "$waiting_clients" -gt 0 ]; then
        print_warning "$waiting_clients clients waiting for connections"
    else
        print_error "Could not determine waiting client count"
        ((errors++))
    fi

    # Check log file for recent errors
    if [ -f "/var/log/pgbouncer/pgbouncer.log" ]; then
        local recent_errors=$(tail -n 100 /var/log/pgbouncer/pgbouncer.log | grep -i error | wc -l)
        if [ "$recent_errors" -eq 0 ]; then
            print_success "No recent errors in log file"
        else
            print_warning "$recent_errors recent errors found in log file"
        fi
    else
        print_warning "Log file not found at /var/log/pgbouncer/pgbouncer.log"
    fi

    if [ $errors -eq 0 ]; then
        print_success "Overall health check: PASSED"
        return 0
    else
        print_error "Overall health check: FAILED ($errors issues found)"
        return 1
    fi
}

# =====================================================
# PERFORMANCE BENCHMARKING
# =====================================================

benchmark_connections() {
    print_header "Connection Performance Benchmark"

    local connections=${1:-50}
    local duration=${2:-30}

    print_info "Running benchmark with $connections concurrent connections for ${duration}s"

    # Benchmark direct PostgreSQL
    print_info "Benchmarking direct PostgreSQL connections..."
    local direct_result=$(pgbench -h $POSTGRES_HOST -p $POSTGRES_PORT -U $USERNAME -d $DATABASE -c $connections -j 4 -T $duration -S 2>/dev/null | grep "tps")

    # Benchmark PgBouncer
    print_info "Benchmarking PgBouncer connections..."
    local pgbouncer_result=$(pgbench -h $PGBOUNCER_HOST -p $PGBOUNCER_PORT -U $USERNAME -d $DATABASE -c $connections -j 4 -T $duration -S 2>/dev/null | grep "tps")

    echo -e "\n${CYAN}Benchmark Results:${NC}"
    echo "Direct PostgreSQL: $direct_result"
    echo "PgBouncer: $pgbouncer_result"
}

# =====================================================
# TROUBLESHOOTING FUNCTIONS
# =====================================================

check_configuration() {
    print_header "Configuration Check"

    # Check if configuration files exist
    if [ -f "/etc/pgbouncer/pgbouncer.ini" ]; then
        print_success "Configuration file exists"
    else
        print_error "Configuration file not found"
    fi

    if [ -f "/etc/pgbouncer/userlist.txt" ]; then
        print_success "User list file exists"
    else
        print_error "User list file not found"
    fi

    # Check file permissions
    local config_perms=$(stat -c "%a" /etc/pgbouncer/pgbouncer.ini 2>/dev/null || echo "000")
    if [ "$config_perms" = "644" ] || [ "$config_perms" = "640" ]; then
        print_success "Configuration file has correct permissions ($config_perms)"
    else
        print_warning "Configuration file permissions: $config_perms (recommended: 644 or 640)"
    fi

    local userlist_perms=$(stat -c "%a" /etc/pgbouncer/userlist.txt 2>/dev/null || echo "000")
    if [ "$userlist_perms" = "600" ] || [ "$userlist_perms" = "640" ]; then
        print_success "User list file has correct permissions ($userlist_perms)"
    else
        print_warning "User list file permissions: $userlist_perms (recommended: 600 or 640)"
    fi
}

show_logs() {
    print_header "Recent PgBouncer Logs"

    if [ -f "/var/log/pgbouncer/pgbouncer.log" ]; then
        echo "Last 20 lines from PgBouncer log:"
        tail -n 20 /var/log/pgbouncer/pgbouncer.log
    else
        print_error "Log file not found"
    fi

    print_info "System journal entries:"
    journalctl -u pgbouncer --no-pager -n 10
}

# =====================================================
# MAIN COMMAND HANDLER
# =====================================================

show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Available commands:"
    echo "  test        - Run basic connectivity tests"
    echo "  monitor     - Show real-time monitoring (Ctrl+C to stop)"
    echo "  stats       - Show detailed statistics"
    echo "  health      - Run comprehensive health check"
    echo "  benchmark   - Run performance benchmark"
    echo "  config      - Check configuration"
    echo "  logs        - Show recent logs"
    echo "  all         - Run all checks (except monitor and benchmark)"
    echo ""
    echo "Examples:"
    echo "  $0 test"
    echo "  $0 health"
    echo "  $0 benchmark 100 60  # 100 connections for 60 seconds"
}

case "${1:-all}" in
    "test")
        test_postgresql_direct
        test_pgbouncer_connection
        test_pgbouncer_admin
        ;;
    "monitor")
        monitor_realtime
        ;;
    "stats")
        show_pool_stats
        show_client_stats
        show_server_stats
        show_active_clients
        show_config
        ;;
    "health")
        health_check
        ;;
    "benchmark")
        benchmark_connections $2 $3
        ;;
    "config")
        check_configuration
        ;;
    "logs")
        show_logs
        ;;
    "all")
        test_postgresql_direct
        test_pgbouncer_connection
        test_pgbouncer_admin
        show_pool_stats
        show_client_stats
        health_check
        check_configuration
        ;;
    *)
        show_usage
        exit 1
        ;;
esac