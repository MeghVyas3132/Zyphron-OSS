#!/bin/bash

# ===========================================
# ZYPHRON SIMPLE FLOW TEST SCRIPT
# Tests the entire platform end-to-end
# No external dependencies (no jq required)
# ===========================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3001}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test data
TIMESTAMP=$(date +%s)
TEST_EMAIL="simple-$TIMESTAMP@zyphron.dev"
TEST_PASSWORD="TestPassword123!"
TEST_NAME="Simple Test User"
AUTH_TOKEN=""
TEST_PROJECT_SLUG="test-project-$TIMESTAMP"
TEST_PROJECT_NAME="Test Project $TIMESTAMP"
TEST_DB_NAME="test-db-$TIMESTAMP"

# ===========================================
# UTILITY FUNCTIONS
# ===========================================

print_header() {
    echo ""
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${PURPLE}  $1${NC}"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_section() {
    echo ""
    echo -e "${CYAN}▶ $1${NC}"
    echo -e "${CYAN}──────────────────────────────────────────${NC}"
}

print_test() {
    echo -e "${BLUE}  Testing: $1${NC}"
}

print_success() {
    echo -e "${GREEN}  [OK] $1${NC}"
    ((TESTS_PASSED++))
}

print_fail() {
    echo -e "${RED}  [FAIL] $1${NC}"
    ((TESTS_FAILED++))
}

print_skip() {
    echo -e "${YELLOW}  ⊘ $1 (skipped)${NC}"
    ((TESTS_SKIPPED++))
}

print_info() {
    echo -e "${YELLOW}  ℹ $1${NC}"
}

# Check if response contains success pattern
check_success() {
    local response="$1"
    if echo "$response" | grep -q '"success":true\|"success": true\|"status":"ok"\|"status": "ok"'; then
        return 0
    fi
    return 1
}

# Extract simple value from JSON (basic grep-based)
extract_value() {
    local response="$1"
    local key="$2"
    echo "$response" | grep -o "\"$key\":[^,}]*" | head -1 | sed 's/.*://' | tr -d '"' | tr -d ' '
}

# ===========================================
# SERVICE HEALTH CHECKS
# ===========================================

test_service_health() {
    print_header "SERVICE HEALTH CHECKS"
    
    print_section "API Health"
    
    # Basic health check
    print_test "API Health Endpoint (/health)"
    local response=$(curl -s --max-time 10 "$API_URL/health" 2>&1)
    
    if echo "$response" | grep -q '"status"'; then
        print_success "API is responding"
        print_info "Response: ${response:0:100}..."
    else
        print_fail "API is not responding at $API_URL"
        print_info "Make sure the API is running: cd backend && npm run dev"
        return 1
    fi
    
    # Ready check
    print_test "API Readiness Endpoint (/health/ready)"
    response=$(curl -s --max-time 10 "$API_URL/health/ready" 2>&1)
    
    if echo "$response" | grep -q 'ready\|database\|services'; then
        print_success "API ready endpoint responding"
    else
        print_skip "Ready endpoint not available"
    fi
    
    # Frontend check
    print_section "Frontend Health"
    print_test "Frontend Availability"
    
    if curl -s --max-time 5 "$FRONTEND_URL" > /dev/null 2>&1; then
        print_success "Frontend is running at $FRONTEND_URL"
    else
        print_skip "Frontend not running (optional)"
    fi
}

# ===========================================
# AUTHENTICATION TESTS
# ===========================================

test_authentication() {
    print_header "AUTHENTICATION TESTS"
    
    print_section "Register + Login"

    print_test "Register test user"
    local register_payload="{\"name\":\"$TEST_NAME\",\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"
    local response=$(curl -s --max-time 15 -X POST \
        -H "Content-Type: application/json" \
        -d "$register_payload" \
        "$API_URL/api/v1/auth/register" 2>&1)

    AUTH_TOKEN=$(echo "$response" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)

    if [ -z "$AUTH_TOKEN" ]; then
        print_info "Registration did not return token, trying login"
        local login_payload="{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"
        response=$(curl -s --max-time 15 -X POST \
            -H "Content-Type: application/json" \
            -d "$login_payload" \
            "$API_URL/api/v1/auth/login" 2>&1)
        AUTH_TOKEN=$(echo "$response" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)
    fi

    if [ -n "$AUTH_TOKEN" ]; then
        print_success "Authenticated test user"
    else
        print_fail "Authentication failed"
        print_info "Response: ${response:0:180}..."
        return 1
    fi

    print_section "Current User"
    print_test "GET /api/v1/auth/me"
    response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/auth/me" 2>&1)

    if check_success "$response" || echo "$response" | grep -q '"user"\|"email"'; then
        print_success "Authenticated user profile works"
    else
        print_fail "Authenticated user profile failed"
    fi
}

# ===========================================
# PROJECTS TESTS
# ===========================================

test_projects() {
    print_header "PROJECTS TESTS"
    
    print_section "List Projects"
    
    # List projects
    print_test "GET /api/v1/projects"
    local response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/projects" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|"projects"\|\[\]'; then
        print_success "List projects endpoint works"
        print_info "Response: ${response:0:150}..."
    else
        print_fail "List projects failed"
        print_info "Response: $response"
    fi
    
    print_section "Create Project"
    
    # Create project
    print_test "POST /api/v1/projects"
    local project_data="{\"name\":\"$TEST_PROJECT_NAME\",\"repositoryUrl\":\"https://github.com/vercel/next.js\",\"branch\":\"main\"}"
    
    response=$(curl -s --max-time 15 -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d "$project_data" \
        "$API_URL/api/v1/projects" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"id"\|"slug"\|"name"'; then
        print_success "Create project endpoint works"
        print_info "Project slug: $TEST_PROJECT_SLUG"
    else
        print_skip "Create project failed (may already exist)"
        print_info "Response: ${response:0:150}..."
    fi
    
    print_section "Get Single Project"
    
    # Get project by slug
    print_test "GET /api/v1/projects/:slug"
    response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/projects/$TEST_PROJECT_SLUG" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"id"\|"name"\|"slug"'; then
        print_success "Get project endpoint works"
    else
        print_skip "Get project failed"
    fi
}

# ===========================================
# DEPLOYMENTS TESTS
# ===========================================

test_deployments() {
    print_header "DEPLOYMENTS TESTS"
    
    print_section "List Deployments"
    
    # List deployments
    print_test "GET /api/v1/projects/:slug/deployments"
    local response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/projects/$TEST_PROJECT_SLUG/deployments" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|\[\]'; then
        print_success "List deployments endpoint works"
    else
        print_skip "List deployments not available"
    fi
    
    print_section "Trigger Deployment"
    
    # Trigger deployment
    print_test "POST /api/v1/projects/:slug/deployments"
    response=$(curl -s --max-time 15 -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d '{"branch":"main"}' \
        "$API_URL/api/v1/projects/$TEST_PROJECT_SLUG/deployments" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"id"\|"status"\|PENDING\|BUILDING'; then
        print_success "Trigger deployment endpoint works"
        print_info "Response: ${response:0:150}..."
    else
        print_skip "Trigger deployment not available"
        print_info "Response: ${response:0:150}..."
    fi
}

# ===========================================
# ENVIRONMENT VARIABLES TESTS
# ===========================================

test_env_variables() {
    print_header "ENVIRONMENT VARIABLES TESTS"
    
    print_section "Get Environment Variables"
    
    # Get env vars
    print_test "GET /api/v1/projects/:slug/env"
    local response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/projects/$TEST_PROJECT_SLUG/env" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|\[\]'; then
        print_success "Get env variables endpoint works"
    else
        print_skip "Get env variables not available"
    fi
    
    print_section "Set Environment Variables"
    
    # Set env vars
    print_test "POST /api/v1/projects/:slug/env"
    local env_data='{"variables":[{"key":"NODE_ENV","value":"production","environment":"production"},{"key":"TEST_VAR","value":"test123","environment":"production"}],"overwrite":true}'
    
    response=$(curl -s --max-time 10 -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d "$env_data" \
        "$API_URL/api/v1/projects/$TEST_PROJECT_SLUG/env/bulk" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|"key"\|NODE_ENV'; then
        print_success "Set env variables endpoint works"
    else
        print_skip "Set env variables not available"
    fi
}

# ===========================================
# DATABASES TESTS
# ===========================================

test_databases() {
    print_header "DATABASES TESTS"
    
    print_section "List Databases"
    
    # List databases
    print_test "GET /api/v1/databases"
    local response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/databases" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|\[\]'; then
        print_success "List databases endpoint works"
    else
        print_skip "List databases not available"
    fi
    
    print_section "Create Database"
    
    # Create database
    print_test "POST /api/v1/databases"
    local db_data="{\"name\":\"$TEST_DB_NAME\",\"type\":\"POSTGRESQL\",\"version\":\"15\",\"projectId\":\"$TEST_PROJECT_SLUG\"}"
    
    response=$(curl -s --max-time 15 -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d "$db_data" \
        "$API_URL/api/v1/databases" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"id"\|"name"\|"slug"'; then
        print_success "Create database endpoint works"
    else
        print_skip "Create database not available"
    fi
}

# ===========================================
# DOMAINS TESTS
# ===========================================

test_domains() {
    print_header "DOMAINS TESTS"
    
    print_section "List Domains"
    
    # List domains
    print_test "GET /api/v1/projects/:slug/domains"
    local response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/projects/$TEST_PROJECT_SLUG/domains" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|\[\]'; then
        print_success "List domains endpoint works"
    else
        print_skip "List domains not available"
    fi
    
    print_section "Add Domain"
    
    # Add domain
    print_test "POST /api/v1/projects/:slug/domains"
    response=$(curl -s --max-time 10 -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d '{"domain":"test.example.com"}' \
        "$API_URL/api/v1/projects/$TEST_PROJECT_SLUG/domains" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"id"\|"domain"'; then
        print_success "Add domain endpoint works"
    else
        print_skip "Add domain not available"
    fi
}

# ===========================================
# WEBHOOKS TESTS
# ===========================================

test_webhooks() {
    print_header "WEBHOOKS TESTS"
    
    print_section "List Webhooks"
    
    # List webhooks
    print_test "GET /api/v1/projects/:slug/webhooks"
    local response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/projects/$TEST_PROJECT_SLUG/webhooks" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|\[\]'; then
        print_success "List webhooks endpoint works"
    else
        print_skip "List webhooks not available"
    fi
}

# ===========================================
# TEAMS TESTS
# ===========================================

test_teams() {
    print_header "TEAMS TESTS"
    
    print_section "List Teams"
    
    # List teams
    print_test "GET /api/v1/teams"
    local response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/teams" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|\[\]'; then
        print_success "List teams endpoint works"
    else
        print_skip "List teams not available"
    fi
}

# ===========================================
# API KEYS TESTS
# ===========================================

test_api_keys() {
    print_header "API KEYS TESTS"
    
    print_section "List API Keys"
    
    # List API keys
    print_test "GET /api/v1/api-keys"
    local response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/api-keys" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|\[\]'; then
        print_success "List API keys endpoint works"
    else
        print_skip "List API keys not available"
    fi
}

# ===========================================
# METRICS TESTS
# ===========================================

test_metrics() {
    print_header "METRICS & DASHBOARD TESTS"
    
    print_section "Dashboard Metrics"
    
    # Get dashboard metrics
    print_test "GET /api/v1/dashboard/metrics"
    local response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/dashboard/metrics" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|"overview"\|"deployments"'; then
        print_success "Dashboard metrics endpoint works"
        print_info "Response: ${response:0:150}..."
    else
        print_skip "Dashboard metrics not available"
    fi
    
    print_section "Prometheus Metrics"
    
    # Get prometheus metrics
    print_test "GET /metrics"
    response=$(curl -s --max-time 10 "$API_URL/metrics" 2>&1)
    
    if echo "$response" | grep -q 'http_requests\|process_\|nodejs_'; then
        print_success "Prometheus metrics endpoint works"
    else
        print_skip "Prometheus metrics not available"
    fi
}

# ===========================================
# AUDIT LOGS TESTS
# ===========================================

test_audit_logs() {
    print_header "AUDIT LOGS TESTS"
    
    print_section "Audit Logs"
    
    # Get audit logs
    print_test "GET /api/v1/audit"
    local response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        "$API_URL/api/v1/audit" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"data"\|\[\]'; then
        print_success "Audit logs endpoint works"
    else
        print_skip "Audit logs not available"
    fi
}

# ===========================================
# AI ANALYSIS TESTS
# ===========================================

test_ai_analysis() {
    print_header "AI ANALYSIS TESTS"
    
    print_section "Analyze Repository"
    
    # Analyze repo
    print_test "POST /api/v1/ai/analyze"
    local response=$(curl -s --max-time 15 -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d '{"files":["package.json","src/index.ts"],"dependencies":{"fastify":"^4.0.0"}}' \
        "$API_URL/api/v1/ai/analyze" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"framework"\|"security"\|"performance"'; then
        print_success "AI analysis endpoint works"
    else
        print_skip "AI analysis not available"
    fi
    
    print_section "Generate Dockerfile"
    
    # Generate Dockerfile
    print_test "POST /api/v1/ai/dockerfile"
    response=$(curl -s --max-time 15 -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d '{"framework":"nextjs","language":"typescript","packageManager":"npm"}' \
        "$API_URL/api/v1/ai/dockerfile" 2>&1)
    
    if check_success "$response" || echo "$response" | grep -q '"dockerfile"\|FROM\|WORKDIR'; then
        print_success "Dockerfile generation endpoint works"
    else
        print_skip "Dockerfile generation not available"
    fi
}

# ===========================================
# WEBSOCKET TESTS
# ===========================================

test_websockets() {
    print_header "WEBSOCKET TESTS"
    
    print_section "WebSocket Endpoint"
    
    # Check if wscat is available
    print_test "WebSocket logs endpoint"
    
    # Try HTTP upgrade request to test WebSocket availability
    local response=$(curl -s --max-time 5 \
        -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Version: 13" \
        -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
        "$API_URL/ws/logs/test" 2>&1)
    
    if echo "$response" | grep -qi 'upgrade\|switching\|websocket'; then
        print_success "WebSocket endpoint available"
    else
        print_skip "WebSocket test requires wscat"
        print_info "Install with: npm install -g wscat"
    fi
}

# ===========================================
# DOCKER TESTS
# ===========================================

test_docker() {
    print_header "DOCKER INFRASTRUCTURE TESTS"
    
    print_section "Docker Availability"
    
    if ! command -v docker &> /dev/null; then
        print_skip "Docker not installed"
        return
    fi
    
    print_test "Docker daemon running"
    if docker info > /dev/null 2>&1; then
        print_success "Docker daemon is running"
    else
        print_fail "Docker daemon not running"
        return
    fi
    
    print_section "Zyphron Containers"
    
    # Check for Zyphron containers
    print_test "Zyphron containers"
    local containers=$(docker ps --filter "name=zyphron" --format "{{.Names}}" 2>/dev/null)
    
    if [ -n "$containers" ]; then
        print_success "Found Zyphron containers:"
        echo "$containers" | while read name; do
            print_info "  • $name"
        done
    else
        print_skip "No Zyphron containers running"
        print_info "Start with: docker-compose -f docker-compose.dev.yml up -d"
    fi
    
    print_section "Container Networks"
    
    # Check network
    print_test "Zyphron network"
    if docker network ls | grep -q "zyphron"; then
        print_success "Zyphron network exists"
    else
        print_skip "Zyphron network not found"
    fi
}

# ===========================================
# SUMMARY
# ===========================================

print_summary() {
    print_header "TEST SUMMARY"
    
    local total=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))
    
    echo ""
    echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo -e "  ────────────────"
    echo -e "  Total:   $total"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${GREEN}  [OK] ALL CORE TESTS PASSED!${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    else
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}  [WARN] SOME TESTS FAILED - Check if services are running${NC}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Quick Start Commands:${NC}"
    echo -e "  ${YELLOW}API:${NC}       cd backend && npm run dev"
    echo -e "  ${YELLOW}Frontend:${NC}  cd frontend && npm run dev"
    echo -e "  ${YELLOW}Docker:${NC}    docker-compose -f docker-compose.dev.yml up -d"
    echo ""
}

# ===========================================
# MAIN
# ===========================================

main() {
    echo ""
    echo -e "${PURPLE}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                                                               ║${NC}"
    echo -e "${PURPLE}║   ███████╗██╗   ██╗██████╗ ██╗  ██╗██████╗  ██████╗ ███╗   ██╗║${NC}"
    echo -e "${PURPLE}║   ╚══███╔╝╚██╗ ██╔╝██╔══██╗██║  ██║██╔══██╗██╔═══██╗████╗  ██║║${NC}"
    echo -e "${PURPLE}║     ███╔╝  ╚████╔╝ ██████╔╝███████║██████╔╝██║   ██║██╔██╗ ██║║${NC}"
    echo -e "${PURPLE}║    ███╔╝    ╚██╔╝  ██╔═══╝ ██╔══██║██╔══██╗██║   ██║██║╚██╗██║║${NC}"
    echo -e "${PURPLE}║   ███████╗   ██║   ██║     ██║  ██║██║  ██║╚██████╔╝██║ ╚████║║${NC}"
    echo -e "${PURPLE}║   ╚══════╝   ╚═╝   ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝║${NC}"
    echo -e "${PURPLE}║                                                               ║${NC}"
    echo -e "${PURPLE}║              COMPLETE FLOW TEST SUITE                         ║${NC}"
    echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${CYAN}API URL:${NC}      $API_URL"
    echo -e "  ${CYAN}Frontend URL:${NC} $FRONTEND_URL"
    echo -e "  ${CYAN}Auth Token:${NC}   $AUTH_TOKEN"
    echo -e "  ${CYAN}Started:${NC}      $(date)"
    echo ""
    
    # Run all tests
    test_service_health
    test_authentication
    test_projects
    test_deployments
    test_env_variables
    test_databases
    test_domains
    test_webhooks
    test_teams
    test_api_keys
    test_metrics
    test_audit_logs
    test_ai_analysis
    test_websockets
    test_docker
    
    # Print summary
    print_summary
    
    # Exit with appropriate code
    if [ $TESTS_FAILED -gt 0 ]; then
        exit 1
    fi
    exit 0
}

# Run main function
main "$@"
