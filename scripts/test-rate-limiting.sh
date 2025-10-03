#!/bin/bash

# Rate Limiting Security Verification Script
# This script tests the critical rate limiting vulnerability fix
# Tests multiple endpoints to ensure all rate limits are properly enforced

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:3001/api/v1"
TEST_EMAIL="test+ratelimit@example.com"
TEST_PASSWORD="password123"
TOKEN=""

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BLUE}🔒 Rate Limiting Security Verification Script${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED_TESTS++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED_TESTS++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

start_test() {
    ((TOTAL_TESTS++))
    echo -e "${YELLOW}🧪 Test $TOTAL_TESTS: $1${NC}"
}

# Function to test rate limiting on specific endpoint
test_rate_limit() {
    local endpoint="$1"
    local method="$2"
    local payload="$3"
    local expected_limit="$4"
    local description="$5"
    local extra_headers="$6"

    start_test "$description"

    local success_count=0
    local rate_limited_count=0
    local headers_cmd=""

    if [[ -n "$extra_headers" ]]; then
        headers_cmd="$extra_headers"
    fi

    # Send requests up to expected limit + 5 extra
    local total_requests=$((expected_limit + 5))

    for i in $(seq 1 $total_requests); do
        if [[ "$method" == "POST" ]]; then
            response=$(curl -s -w "\n%{http_code}" -X POST \
                "$API_BASE$endpoint" \
                -H "Content-Type: application/json" \
                $headers_cmd \
                -d "$payload" || echo "000")
        else
            response=$(curl -s -w "\n%{http_code}" -X GET \
                "$API_BASE$endpoint" \
                $headers_cmd || echo "000")
        fi

        http_code=$(echo "$response" | tail -n1)

        if [[ "$http_code" == "200" ]]; then
            ((success_count++))
        elif [[ "$http_code" == "429" ]]; then
            ((rate_limited_count++))
        fi

        # Small delay to avoid overwhelming the server
        sleep 0.1
    done

    echo "   📊 Results: $success_count successful, $rate_limited_count rate-limited"

    # Verify results
    if [[ $success_count -eq $expected_limit ]] && [[ $rate_limited_count -eq 5 ]]; then
        log_success "Rate limit correctly enforced: $success_count/$expected_limit allowed, $rate_limited_count blocked"
        return 0
    else
        log_error "Rate limit FAILED: Expected $expected_limit allowed + 5 blocked, got $success_count allowed + $rate_limited_count blocked"
        return 1
    fi
}

# Function to test concurrent requests (race condition test)
test_concurrent_rate_limit() {
    local endpoint="$1"
    local method="$2"
    local payload="$3"
    local expected_limit="$4"
    local description="$5"
    local extra_headers="$6"

    start_test "$description"

    local total_requests=25
    local temp_dir=$(mktemp -d)

    # Launch concurrent requests
    for i in $(seq 1 $total_requests); do
        (
            if [[ "$method" == "POST" ]]; then
                curl -s -w "%{http_code}\n" -X POST \
                    "$API_BASE$endpoint" \
                    -H "Content-Type: application/json" \
                    $extra_headers \
                    -d "$payload" > "$temp_dir/response_$i.txt" 2>/dev/null
            else
                curl -s -w "%{http_code}\n" -X GET \
                    "$API_BASE$endpoint" \
                    $extra_headers > "$temp_dir/response_$i.txt" 2>/dev/null
            fi
        ) &
    done

    # Wait for all requests to complete
    wait

    # Count results
    local success_count=0
    local rate_limited_count=0

    for i in $(seq 1 $total_requests); do
        if [[ -f "$temp_dir/response_$i.txt" ]]; then
            local http_code=$(tail -n1 "$temp_dir/response_$i.txt")
            if [[ "$http_code" == "200" ]]; then
                ((success_count++))
            elif [[ "$http_code" == "429" ]]; then
                ((rate_limited_count++))
            fi
        fi
    done

    # Cleanup
    rm -rf "$temp_dir"

    echo "   📊 Concurrent Results: $success_count successful, $rate_limited_count rate-limited"

    # Verify results (allow some tolerance for race conditions)
    local allowed_variance=2
    if [[ $success_count -ge $((expected_limit - allowed_variance)) ]] && \
       [[ $success_count -le $((expected_limit + allowed_variance)) ]] && \
       [[ $rate_limited_count -ge $((total_requests - expected_limit - allowed_variance)) ]]; then
        log_success "Concurrent rate limit correctly enforced (±$allowed_variance tolerance)"
        return 0
    else
        log_error "Concurrent rate limit FAILED: Expected ~$expected_limit allowed, got $success_count allowed + $rate_limited_count blocked"
        return 1
    fi
}

# Function to get authentication token
get_auth_token() {
    log_info "Getting authentication token..."

    # First, try to register the user (may fail if already exists)
    curl -s -X POST "$API_BASE/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"Rate Limit Test User\"}" > /dev/null || true

    # Login to get token
    local response=$(curl -s -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

    TOKEN=$(echo "$response" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

    if [[ -n "$TOKEN" ]]; then
        log_success "Authentication token obtained"
        return 0
    else
        log_error "Failed to get authentication token"
        return 1
    fi
}

# Function to clear Redis rate limit keys
clear_rate_limits() {
    log_info "Clearing rate limit counters..."
    # This requires Redis CLI access - optional
    redis-cli -n 1 FLUSHDB > /dev/null 2>&1 || log_warning "Could not clear Redis (redis-cli not available)"
}

# Main test execution
echo -e "${BLUE}🚀 Starting Rate Limiting Security Tests${NC}"
echo ""

# Clear any existing rate limits
clear_rate_limits

# Get authentication token
if ! get_auth_token; then
    log_error "Cannot proceed without authentication token"
    exit 1
fi

echo ""
echo -e "${BLUE}Testing Critical Subscription Endpoints${NC}"
echo "========================================"

# Test 1: Subscription Validation Rate Limit (20/min)
clear_rate_limits
test_rate_limit "/subscriptions/validate-purchase" "POST" \
    '{"service_type":"spotify","service_plan":"premium"}' \
    20 \
    "Subscription Validation Rate Limit (20/min)" \
    "-H \"Authorization: Bearer $TOKEN\""

sleep 2

# Test 2: Subscription Purchase Rate Limit (10/5min)
clear_rate_limits
test_rate_limit "/subscriptions/purchase" "POST" \
    '{"service_type":"netflix","service_plan":"standard"}' \
    10 \
    "Subscription Purchase Rate Limit (10/5min)" \
    "-H \"Authorization: Bearer $TOKEN\""

sleep 2

echo ""
echo -e "${BLUE}Testing Authentication Endpoints${NC}"
echo "=================================="

# Test 3: Auth Rate Limit (5/15min)
clear_rate_limits
test_rate_limit "/auth/login" "POST" \
    "{\"email\":\"$TEST_EMAIL\",\"password\":\"wrongpassword\"}" \
    5 \
    "Auth Login Rate Limit (5/15min)"

sleep 2

echo ""
echo -e "${BLUE}Testing Concurrent Request Handling${NC}"
echo "==================================="

# Test 4: Concurrent Rate Limiting (Critical Security Test)
clear_rate_limits
test_concurrent_rate_limit "/subscriptions/validate-purchase" "POST" \
    '{"service_type":"spotify","service_plan":"premium"}' \
    20 \
    "Concurrent Subscription Validation (Race Condition Test)" \
    "-H \"Authorization: Bearer $TOKEN\""

sleep 2

echo ""
echo -e "${BLUE}Testing Headers and Response Format${NC}"
echo "==================================="

# Test 5: Rate Limit Headers
start_test "Rate Limit Headers Verification"
response=$(curl -s -i -X POST "$API_BASE/subscriptions/validate-purchase" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"service_type":"spotify","service_plan":"premium"}')

if echo "$response" | grep -q "X-RateLimit-Limit" && \
   echo "$response" | grep -q "X-RateLimit-Remaining" && \
   echo "$response" | grep -q "X-RateLimit-Reset"; then
    log_success "Rate limit headers present"
else
    log_error "Rate limit headers missing"
fi

# Test 6: 429 Response Format
start_test "429 Response Format Verification"
clear_rate_limits

# Use up the limit first
for i in {1..20}; do
    curl -s -X POST "$API_BASE/subscriptions/validate-purchase" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"service_type":"spotify","service_plan":"premium"}' > /dev/null
done

# This should return 429
response=$(curl -s -X POST "$API_BASE/subscriptions/validate-purchase" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"service_type":"spotify","service_plan":"premium"}')

if echo "$response" | grep -q '"error":"Too Many Requests"' && \
   echo "$response" | grep -q '"message":"Rate limit exceeded"' && \
   echo "$response" | grep -q '"retryAfter"' && \
   echo "$response" | grep -q '"resetTime"'; then
    log_success "429 response format correct"
else
    log_error "429 response format incorrect"
fi

echo ""
echo -e "${BLUE}📋 Test Summary${NC}"
echo "==============="
echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"

if [[ $FAILED_TESTS -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}🎉 ALL TESTS PASSED! Rate limiting security vulnerability has been fixed.${NC}"
    echo -e "${GREEN}✅ Rate limits are properly enforced${NC}"
    echo -e "${GREEN}✅ Concurrent requests handled correctly${NC}"
    echo -e "${GREEN}✅ Proper error responses returned${NC}"
    echo -e "${GREEN}✅ Rate limit headers present${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}💥 SECURITY VULNERABILITY STILL EXISTS!${NC}"
    echo -e "${RED}❌ Rate limiting is not properly enforced${NC}"
    echo -e "${RED}❌ System vulnerable to abuse and DDoS attacks${NC}"
    echo -e "${RED}❌ Immediate attention required${NC}"
    exit 1
fi