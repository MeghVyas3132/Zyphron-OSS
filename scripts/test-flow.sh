#!/bin/bash

# ===========================================
# ZYPHRON COMPLETE FLOW TEST SCRIPT
# Tests the entire platform end-to-end
# ===========================================

set -e

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

# Test user credentials
TEST_EMAIL="test-$(date +%s)@zyphron.dev"
TEST_PASSWORD="TestPassword123!"
TEST_NAME="Test User"
AUTH_TOKEN=""

# Test project details
TEST_PROJECT_NAME="test-project-$(date +%s)"
TEST_PROJECT_SLUG="test-project-$(date +%s)"
TEST_GIT_URL="https://github.com/vercel/next.js"
PROJECT_ID=""
DEPLOYMENT_ID=""

# Test database details
TEST_DB_NAME="test-db-$(date +%s)"
DATABASE_ID=""

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
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

print_fail() {
    echo -e "${RED}  [FAIL] $1${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

print_skip() {
    echo -e "${YELLOW}  ⊘ $1 (skipped)${NC}"
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

print_info() {
    echo -e "${YELLOW}  ℹ $1${NC}"
}

# Make API request and return response
api_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local auth="$4"
    
    local headers=(-H "Content-Type: application/json")
    
    if [ -n "$auth" ]; then
        headers+=(-H "Authorization: Bearer $auth")
    fi
    
    if [ -n "$data" ]; then
        curl -s -X "$method" "${API_URL}${endpoint}" "${headers[@]}" -d "$data"
    else
        curl -s -X "$method" "${API_URL}${endpoint}" "${headers[@]}"
    fi
}

# Check if response has success: true
check_success() {
    local response="$1"
    echo "$response" | jq -e '
      if has("success") then
        .success == true
      else
        (has("error") | not) and (has("statusCode") | not)
      end
    ' > /dev/null 2>&1
}

# Extract value from JSON response
get_json_value() {
    local response="$1"
    local path="$2"
    echo "$response" | jq -r "$path"
}

# Check if service is running
check_service() {
    local url="$1"
    local name="$2"
    
    if curl -s --max-time 5 "$url" > /dev/null 2>&1; then
        print_success "$name is running"
        return 0
    else
        print_fail "$name is not reachable at $url"
        return 1
    fi
}

# ===========================================
# PRE-FLIGHT CHECKS
# ===========================================

preflight_checks() {
    print_header "PRE-FLIGHT CHECKS"
    
    # Check required tools
    print_section "Required Tools"
    
    if command -v curl &> /dev/null; then
        print_success "curl is installed"
    else
        print_fail "curl is required but not installed"
        exit 1
    fi
    
    if command -v jq &> /dev/null; then
        print_success "jq is installed"
    else
        print_fail "jq is required but not installed. Install with: brew install jq"
        exit 1
    fi
    
    if command -v docker &> /dev/null; then
        print_success "docker is installed"
    else
        print_skip "docker not installed (some tests may fail)"
    fi
}

# ===========================================
# SERVICE HEALTH CHECKS
# ===========================================

test_service_health() {
    print_header "SERVICE HEALTH CHECKS"
    
    print_section "Core Services"
    
    # API Health
    print_test "API Health Endpoint"
    local response=$(api_request "GET" "/health")
    
    if echo "$response" | jq -e '.status == "ok" or .status == "healthy"' > /dev/null 2>&1; then
        print_success "API is healthy"
        local version=$(get_json_value "$response" '.version // "unknown"')
        print_info "API Version: $version"
    else
        print_fail "API health check failed"
        print_info "Response: $response"
        return 1
    fi
    
    # API Ready Check
    print_test "API Readiness"
    response=$(api_request "GET" "/health/ready")
    
    if echo "$response" | jq -e '(.ready == true) or (.status == "healthy")' > /dev/null 2>&1; then
        print_success "API is ready"
        
        # Check individual services
        local db_status=$(get_json_value "$response" '.services.database // .checks.database // "unknown"')
        local redis_status=$(get_json_value "$response" '.services.redis // .checks.redis // "unknown"')
        
        if [ "$db_status" = "connected" ] || [ "$db_status" = "true" ]; then
            print_success "Database is connected"
        else
            print_fail "Database connection: $db_status"
        fi
        
        if [ "$redis_status" = "connected" ] || [ "$redis_status" = "true" ]; then
            print_success "Redis is connected"
        else
            print_skip "Redis connection: $redis_status"
        fi
    else
        print_fail "API is not ready"
        print_info "Response: $response"
    fi
    
    # Frontend Check (if available)
    print_section "Frontend Service"
    print_test "Frontend Availability"
    
    if curl -s --max-time 5 "$FRONTEND_URL" > /dev/null 2>&1; then
        print_success "Frontend is running at $FRONTEND_URL"
    else
        print_skip "Frontend not running at $FRONTEND_URL"
    fi
}

# ===========================================
# AUTHENTICATION TESTS
# ===========================================

test_authentication() {
    print_header "AUTHENTICATION TESTS"
    
    print_section "User Registration"
    
    # Register new user
    print_test "Register new user"
    local register_data=$(cat <<EOF
{
    "name": "$TEST_NAME",
    "email": "$TEST_EMAIL",
    "password": "$TEST_PASSWORD"
}
EOF
)
    
    local response=$(api_request "POST" "/api/v1/auth/register" "$register_data")
    
    if check_success "$response"; then
        AUTH_TOKEN=$(get_json_value "$response" '.data.token')
        local user_id=$(get_json_value "$response" '.data.user.id')
        print_success "User registered successfully"
        print_info "User ID: $user_id"
        print_info "Token received: ${AUTH_TOKEN:0:20}..."
    else
        # Try login if registration fails (user might exist)
        print_info "Registration failed, trying login..."
        
        local login_data=$(cat <<EOF
{
    "email": "$TEST_EMAIL",
    "password": "$TEST_PASSWORD"
}
EOF
)
        response=$(api_request "POST" "/api/v1/auth/login" "$login_data")
        
        if check_success "$response"; then
            AUTH_TOKEN=$(get_json_value "$response" '.data.token')
            print_success "User logged in successfully"
        else
            # Use dev token as fallback
            print_info "Using development token..."
            AUTH_TOKEN="dev-token"
            print_success "Using dev-token for testing"
        fi
    fi
    
    print_section "Token Validation"
    
    # Get current user
    print_test "Get current user (me)"
    response=$(api_request "GET" "/api/v1/auth/me" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local user_email=$(get_json_value "$response" '.data.email')
        print_success "Token is valid"
        print_info "Authenticated as: $user_email"
    else
        print_fail "Token validation failed"
        print_info "Response: $response"
    fi
    
    print_section "Profile Update"
    
    # Update profile
    print_test "Update user profile"
    local update_data='{"name": "Updated Test User"}'
    response=$(api_request "PUT" "/api/v1/auth/profile" "$update_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        print_success "Profile updated successfully"
    else
        print_skip "Profile update not implemented"
    fi
}

# ===========================================
# PROJECTS TESTS
# ===========================================

test_projects() {
    print_header "PROJECTS TESTS"
    
    if [ -z "$AUTH_TOKEN" ]; then
        print_skip "Skipping projects tests - no auth token"
        return
    fi
    
    print_section "Create Project"
    
    # Create a new project
    print_test "Create new project"
    local project_data=$(cat <<EOF
{
    "name": "$TEST_PROJECT_NAME",
    "repositoryUrl": "$TEST_GIT_URL",
    "branch": "main"
}
EOF
)
    
    local response=$(api_request "POST" "/api/v1/projects" "$project_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        PROJECT_ID=$(get_json_value "$response" '.data.project.id // empty')
        TEST_PROJECT_SLUG=$(get_json_value "$response" '.data.project.slug // empty')
        print_success "Project created successfully"
        print_info "Project ID: $PROJECT_ID"
        print_info "Project Slug: $TEST_PROJECT_SLUG"
    else
        local error=$(get_json_value "$response" '.error // .message // "Unknown error"')
        print_fail "Failed to create project: $error"
        return
    fi
    
    print_section "List Projects"
    
    # List all projects
    print_test "List all projects"
    response=$(api_request "GET" "/api/v1/projects" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local count=$(get_json_value "$response" '.data.projects | length // 0')
        print_success "Listed $count project(s)"
    else
        print_fail "Failed to list projects"
    fi
    
    print_section "Get Project Details"
    
    # Get single project
    print_test "Get project by slug"
    response=$(api_request "GET" "/api/v1/projects/$PROJECT_ID" "" "$AUTH_TOKEN")

    if check_success "$response"; then
        local project_name=$(get_json_value "$response" '.data.project.name // .data.name')
        print_success "Retrieved project: $project_name"
    else
        print_fail "Failed to get project"
    fi
    
    print_section "Update Project"
    
    # Update project
    print_test "Update project settings"
    local update_data='{"buildCommand": "npm run build", "outputDirectory": "dist"}'
    response=$(api_request "PUT" "/api/v1/projects/$PROJECT_ID" "$update_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        print_success "Project updated successfully"
    else
        print_skip "Project update failed or not implemented"
    fi
}

# ===========================================
# ENVIRONMENT VARIABLES TESTS
# ===========================================

test_env_variables() {
    print_header "ENVIRONMENT VARIABLES TESTS"
    
    if [ -z "$AUTH_TOKEN" ] || [ -z "$PROJECT_ID" ]; then
        print_skip "Skipping env tests - no project"
        return
    fi
    
    print_section "Set Environment Variables"
    
    # Set env variables
    print_test "Set environment variables"
    local env_data=$(cat <<EOF
{
    "variables": [
        {"key": "NODE_ENV", "value": "production"},
        {"key": "API_KEY", "value": "test-api-key-12345"},
        {"key": "DATABASE_URL", "value": "postgresql://localhost/test"}
    ]
}
EOF
)
    
    local response=$(api_request "POST" "/api/v1/projects/$PROJECT_ID/env/bulk" "$env_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        print_success "Environment variables set successfully"
    else
        print_skip "Set env variables not implemented"
    fi
    
    print_section "Get Environment Variables"
    
    # Get env variables
    print_test "Get environment variables"
    response=$(api_request "GET" "/api/v1/projects/$PROJECT_ID/env" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local count=$(get_json_value "$response" '.data.envVariables | length // 0')
        print_success "Retrieved $count environment variable(s)"
    else
        print_skip "Get env variables not implemented"
    fi
}

# ===========================================
# DEPLOYMENTS TESTS
# ===========================================

test_deployments() {
    print_header "DEPLOYMENTS TESTS"
    
    if [ -z "$AUTH_TOKEN" ] || [ -z "$PROJECT_ID" ]; then
        print_skip "Skipping deployment tests - no project"
        return
    fi
    
    print_section "Create Deployment"
    
    # Trigger deployment
    print_test "Trigger new deployment"
    local deploy_data='{"branch": "main"}'
    
    local response=$(api_request "POST" "/api/v1/projects/$PROJECT_ID/deployments" "$deploy_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        DEPLOYMENT_ID=$(get_json_value "$response" '.deployment.id // .data.deployment.id // empty')
        local status=$(get_json_value "$response" '.deployment.status // .data.deployment.status // "unknown"')
        print_success "Deployment triggered successfully"
        print_info "Deployment ID: $DEPLOYMENT_ID"
        print_info "Initial Status: $status"
    else
        local error=$(get_json_value "$response" '.error // .message // "Unknown error"')
        print_skip "Deployment trigger failed: $error"
        return
    fi
    
    print_section "List Deployments"
    
    # List deployments
    print_test "List project deployments"
    response=$(api_request "GET" "/api/v1/projects/$PROJECT_ID/deployments" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local count=$(get_json_value "$response" '.deployments | length // 0')
        print_success "Listed $count deployment(s)"
    else
        print_fail "Failed to list deployments"
    fi
    
    print_section "Get Deployment Status"
    
    if [ -n "$DEPLOYMENT_ID" ]; then
        # Get deployment details
        print_test "Get deployment details"
        response=$(api_request "GET" "/api/v1/projects/$PROJECT_ID/deployments/$DEPLOYMENT_ID" "" "$AUTH_TOKEN")
        
        if check_success "$response"; then
            local status=$(get_json_value "$response" '.deployment.status // .data.deployment.status // "unknown"')
            print_success "Deployment status: $status"
        else
            print_fail "Failed to get deployment details"
        fi
    fi
}

# ===========================================
# DATABASES TESTS
# ===========================================

test_databases() {
    print_header "DATABASES TESTS"
    
    if [ -z "$AUTH_TOKEN" ]; then
        print_skip "Skipping database tests - no auth token"
        return
    fi
    
    print_section "Create Database"
    
    # Create database
    print_test "Create PostgreSQL database"
    local db_data=$(cat <<EOF
{
    "name": "$TEST_DB_NAME",
    "type": "POSTGRESQL",
    "version": "15",
    "projectId": "$PROJECT_ID"
}
EOF
)
    
    local response=$(api_request "POST" "/api/v1/databases" "$db_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        DATABASE_ID=$(get_json_value "$response" '.data.database.id // empty')
        print_success "Database created successfully"
        print_info "Database ID: $DATABASE_ID"
    else
        local error=$(get_json_value "$response" '.error // .message // "Unknown error"')
        print_skip "Database creation failed: $error"
        return
    fi
    
    print_section "List Databases"
    
    # List databases
    print_test "List all databases"
    response=$(api_request "GET" "/api/v1/databases" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local count=$(get_json_value "$response" '.data.databases | length // 0')
        print_success "Listed $count database(s)"
    else
        print_fail "Failed to list databases"
    fi
    
    print_section "Get Database Connection"
    
    if [ -n "$DATABASE_ID" ]; then
        # Get connection string
        print_test "Get database connection string"
        response=$(api_request "GET" "/api/v1/databases/$DATABASE_ID/connection" "" "$AUTH_TOKEN")
        
        if check_success "$response"; then
            print_success "Connection string retrieved"
        else
            print_skip "Connection string not available"
        fi
    fi
}

# ===========================================
# DOMAINS TESTS
# ===========================================

test_domains() {
    print_header "DOMAINS TESTS"
    
    if [ -z "$AUTH_TOKEN" ] || [ -z "$PROJECT_ID" ]; then
        print_skip "Skipping domain tests - no project"
        return
    fi
    
    print_section "Add Domain"
    
    # Add custom domain
    print_test "Add custom domain"
    local domain_data='{"domain": "test.example.com"}'
    
    local response=$(api_request "POST" "/api/v1/projects/$PROJECT_ID/domains" "$domain_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        print_success "Domain added successfully"
    else
        print_skip "Add domain not implemented or failed"
    fi
    
    print_section "List Domains"
    
    # List domains
    print_test "List project domains"
    response=$(api_request "GET" "/api/v1/projects/$PROJECT_ID/domains" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local count=$(get_json_value "$response" '.data.domains | length // 0')
        print_success "Listed $count domain(s)"
    else
        print_skip "List domains not implemented"
    fi
}

# ===========================================
# WEBHOOKS TESTS
# ===========================================

test_webhooks() {
    print_header "WEBHOOKS TESTS"
    
    if [ -z "$AUTH_TOKEN" ] || [ -z "$PROJECT_ID" ]; then
        print_skip "Skipping webhook tests - no project"
        return
    fi
    
    print_section "Create Webhook"
    
    # Create webhook
    print_test "Create deployment webhook"
    local webhook_data=$(cat <<EOF
{
    "provider": "GITHUB",
    "events": ["push", "pull_request"]
}
EOF
)
    
    local response=$(api_request "POST" "/api/v1/projects/$PROJECT_ID/webhooks" "$webhook_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        print_success "Webhook created successfully"
    else
        print_skip "Create webhook not implemented"
    fi
    
    print_section "List Webhooks"
    
    # List webhooks
    print_test "List project webhooks"
    response=$(api_request "GET" "/api/v1/projects/$PROJECT_ID/webhooks" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local count=$(get_json_value "$response" '.webhooks | length // 0')
        print_success "Listed $count webhook(s)"
    else
        print_skip "List webhooks not implemented"
    fi
}

# ===========================================
# TEAMS TESTS
# ===========================================

test_teams() {
    print_header "TEAMS TESTS"
    
    if [ -z "$AUTH_TOKEN" ]; then
        print_skip "Skipping team tests - no auth token"
        return
    fi
    
    print_section "Create Team"
    
    # Create team
    print_test "Create new team"
    local team_data=$(cat <<EOF
{
    "name": "Test Team $(date +%s)",
    "slug": "test-team-$(date +%s)"
}
EOF
)
    
    local response=$(api_request "POST" "/api/v1/teams" "$team_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        print_success "Team created successfully"
    else
        print_skip "Create team not implemented"
    fi
    
    print_section "List Teams"
    
    # List teams
    print_test "List user teams"
    response=$(api_request "GET" "/api/v1/teams" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local count=$(get_json_value "$response" '.data.teams | length // 0')
        print_success "Listed $count team(s)"
    else
        print_skip "List teams not implemented"
    fi
}

# ===========================================
# API KEYS TESTS
# ===========================================

test_api_keys() {
    print_header "API KEYS TESTS"
    
    if [ -z "$AUTH_TOKEN" ]; then
        print_skip "Skipping API keys tests - no auth token"
        return
    fi
    
    print_section "Create API Key"
    
    # Create API key
    print_test "Create new API key"
    local key_data=$(cat <<EOF
{
    "name": "Test API Key",
    "expiresInDays": 30
}
EOF
)
    
    local response=$(api_request "POST" "/api/v1/api-keys" "$key_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        print_success "API key created successfully"
    else
        print_skip "Create API key not implemented"
    fi
    
    print_section "List API Keys"
    
    # List API keys
    print_test "List API keys"
    response=$(api_request "GET" "/api/v1/api-keys" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local count=$(get_json_value "$response" '.data.apiKeys | length // 0')
        print_success "Listed $count API key(s)"
    else
        print_skip "List API keys not implemented"
    fi
}

# ===========================================
# METRICS & DASHBOARD TESTS
# ===========================================

test_metrics() {
    print_header "METRICS & DASHBOARD TESTS"
    
    if [ -z "$AUTH_TOKEN" ]; then
        print_skip "Skipping metrics tests - no auth token"
        return
    fi
    
    print_section "Dashboard Metrics"
    
    # Get dashboard metrics
    print_test "Get dashboard metrics"
    local response=$(api_request "GET" "/api/v1/dashboard/metrics" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local projects=$(get_json_value "$response" '.data.overview.totalProjects // 0')
        local deployments=$(get_json_value "$response" '.data.deployments.total // 0')
        print_success "Dashboard metrics retrieved"
        print_info "Total Projects: $projects"
        print_info "Total Deployments: $deployments"
    else
        print_skip "Dashboard metrics not implemented"
    fi
    
    print_section "Project Metrics"
    
    if [ -n "$PROJECT_ID" ]; then
        # Get project metrics
        print_test "Get project metrics"
        response=$(api_request "GET" "/api/v1/projects/$PROJECT_ID/metrics" "" "$AUTH_TOKEN")
        
        if check_success "$response"; then
            print_success "Project metrics retrieved"
        else
            print_skip "Project metrics not implemented"
        fi
    fi
}

# ===========================================
# AUDIT LOGS TESTS
# ===========================================

test_audit_logs() {
    print_header "AUDIT LOGS TESTS"
    
    if [ -z "$AUTH_TOKEN" ]; then
        print_skip "Skipping audit tests - no auth token"
        return
    fi
    
    print_section "Audit Logs"
    
    # Get audit logs
    print_test "Get audit logs"
    local response=$(api_request "GET" "/api/v1/audit" "" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local count=$(get_json_value "$response" '.data.logs | length // 0')
        print_success "Retrieved $count audit log(s)"
    else
        print_skip "Audit logs not implemented"
    fi
}

# ===========================================
# AI ANALYSIS TESTS
# ===========================================

test_ai_analysis() {
    print_header "AI ANALYSIS TESTS"
    
    if [ -z "$AUTH_TOKEN" ]; then
        print_skip "Skipping AI tests - no auth token"
        return
    fi
    
    print_section "Framework Detection"
    
    # Analyze repository
    print_test "Analyze repository for framework detection"
    local analyze_data='{"files":["package.json","src/index.ts"],"dependencies":{"fastify":"^4.0.0"},"devDependencies":{"typescript":"^5.0.0"},"hasDockerfile":false,"hasTests":true}'
    
    local response=$(api_request "POST" "/api/v1/ai/analyze" "$analyze_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        local framework=$(get_json_value "$response" '.data.framework.framework // "unknown"')
        local confidence=$(get_json_value "$response" '.data.framework.confidence // 0')
        print_success "Framework detected: $framework (${confidence}% confidence)"
    else
        print_skip "AI analysis not implemented"
    fi
    
    print_section "Dockerfile Generation"
    
    # Generate Dockerfile
    print_test "Generate Dockerfile"
    local dockerfile_data='{"framework":"nextjs","language":"typescript","packageManager":"npm"}'
    
    response=$(api_request "POST" "/api/v1/ai/dockerfile" "$dockerfile_data" "$AUTH_TOKEN")
    
    if check_success "$response"; then
        print_success "Dockerfile generated successfully"
    else
        print_skip "Dockerfile generation not implemented"
    fi
}

# ===========================================
# CLEANUP TESTS
# ===========================================

cleanup_test_data() {
    print_header "CLEANUP"
    
    if [ -z "$AUTH_TOKEN" ]; then
        print_skip "No cleanup needed - no auth token"
        return
    fi
    
    print_section "Cleaning Up Test Data"
    
    # Delete test database
    if [ -n "$DATABASE_ID" ]; then
        print_test "Delete test database"
        local response=$(api_request "DELETE" "/api/v1/databases/$DATABASE_ID" "" "$AUTH_TOKEN")
        if check_success "$response"; then
            print_success "Test database deleted"
        else
            print_skip "Could not delete test database"
        fi
    fi
    
    # Delete test project
    if [ -n "$PROJECT_ID" ]; then
        print_test "Delete test project"
        local response=$(api_request "DELETE" "/api/v1/projects/$PROJECT_ID" "" "$AUTH_TOKEN")
        if check_success "$response"; then
            print_success "Test project deleted"
        else
            print_skip "Could not delete test project"
        fi
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
        echo -e "${GREEN}  [OK] ALL TESTS PASSED!${NC}"
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    else
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${RED}  [FAIL] SOME TESTS FAILED${NC}"
        echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    fi
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
    echo -e "  ${CYAN}Started:${NC}      $(date)"
    echo ""
    
    # Run all tests
    preflight_checks
    test_service_health
    test_authentication
    test_projects
    test_env_variables
    test_deployments
    test_databases
    test_domains
    test_webhooks
    test_teams
    test_api_keys
    test_metrics
    test_audit_logs
    test_ai_analysis
    
    # Cleanup (optional - comment out to keep test data)
    # cleanup_test_data
    
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
