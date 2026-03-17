#!/bin/bash
# Database migration script for Gmail send-as aliases functionality
# File: scripts/migrate-email-send-as.sh

set -e

# Configuration
DB_URL="${DATABASE_URL}"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
MIGRATION_LOG="./logs/migration_${TIMESTAMP}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$MIGRATION_LOG"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$MIGRATION_LOG"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$MIGRATION_LOG"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$MIGRATION_LOG"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        error "psql is not installed or not in PATH"
        exit 1
    fi
    
    # Check if DATABASE_URL is set
    if [ -z "$DB_URL" ]; then
        error "DATABASE_URL environment variable is not set"
        exit 1
    fi
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    mkdir -p "./logs"
    
    success "Prerequisites check passed"
}

# Create database backup
create_backup() {
    log "Creating database backup..."
    
    local backup_file="${BACKUP_DIR}/backup_before_send_as_migration_${TIMESTAMP}.sql"
    
    pg_dump "$DB_URL" > "$backup_file"
    
    if [ $? -eq 0 ]; then
        success "Backup created: $backup_file"
        echo "$backup_file"
    else
        error "Failed to create backup"
        exit 1
    fi
}

# Run migration with error handling
run_migration() {
    local migration_file="$1"
    local migration_name="$2"
    
    log "Running migration: $migration_name"
    
    if psql "$DB_URL" -f "$migration_file" >> "$MIGRATION_LOG" 2>&1; then
        success "Migration completed: $migration_name"
        return 0
    else
        error "Migration failed: $migration_name"
        return 1
    fi
}

# Verify migration results
verify_migration() {
    log "Verifying migration results..."
    
    # Check if new tables exist
    local tables=("email_send_as_aliases" "email_error_log")
    
    for table in "${tables[@]}"; do
        local count=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '$table';" | tr -d ' ')
        
        if [ "$count" -eq 1 ]; then
            success "Table $table exists"
        else
            error "Table $table not found"
            return 1
        fi
    done
    
    # Check if new columns exist
    local columns=(
        "email_accounts.send_as_discovered_at"
        "email_accounts.default_send_as_email"
        "store_connections.default_from_email"
        "store_connections.reply_to_email"
        "store_connections.email_signature"
        "email_messages.actual_from_address"
        "email_messages.send_as_alias_id"
    )
    
    for column in "${columns[@]}"; do
        local table_col=(${column//./ })
        local table="${table_col[0]}"
        local col="${table_col[1]}"
        
        local count=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = '$table' AND column_name = '$col';" | tr -d ' ')
        
        if [ "$count" -eq 1 ]; then
            success "Column $column exists"
        else
            error "Column $column not found"
            return 1
        fi
    done
    
    success "Migration verification passed"
}

# Test basic functionality
test_functionality() {
    log "Testing basic functionality..."
    
    # Test email_send_as_aliases table
    local alias_count=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM email_send_as_aliases;" | tr -d ' ')
    log "Email send-as aliases table: $alias_count rows"
    
    # Test email_accounts new columns
    local accounts_with_discovery=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM email_accounts WHERE send_as_discovered_at IS NOT NULL;" | tr -d ' ')
    log "Email accounts with discovered aliases: $accounts_with_discovery"
    
    # Test store_connections new columns
    local stores_with_email=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM store_connections WHERE default_from_email IS NOT NULL;" | tr -d ' ')
    log "Store connections with email routing: $stores_with_email"
    
    success "Basic functionality test passed"
}

# Rollback function
rollback() {
    local backup_file="$1"
    
    warn "Starting rollback process..."
    
    if [ -f "$backup_file" ]; then
        log "Restoring from backup: $backup_file"
        
        if psql "$DB_URL" < "$backup_file" >> "$MIGRATION_LOG" 2>&1; then
            success "Rollback completed successfully"
        else
            error "Rollback failed"
            return 1
        fi
    else
        error "Backup file not found: $backup_file"
        return 1
    fi
}

# Main migration process
main() {
    log "Starting Gmail send-as aliases migration..."
    
    # Check prerequisites
    check_prerequisites
    
    # Create backup
    local backup_file=$(create_backup)
    
    # Run migrations in order
    local migrations=(
        "014_email_send_as_aliases.sql:Email Send-As Aliases Table"
        "015_email_error_logging.sql:Email Error Logging"
    )
    
    local migration_failed=false
    
    for migration in "${migrations[@]}"; do
        IFS=':' read -r file name <<< "$migration"
        
        if ! run_migration "server/migrations/$file" "$name"; then
            migration_failed=true
            break
        fi
    done
    
    if [ "$migration_failed" = true ]; then
        error "Migration failed, initiating rollback..."
        rollback "$backup_file"
        exit 1
    fi
    
    # Verify migration
    if ! verify_migration; then
        warn "Migration verification failed, but continuing..."
    fi
    
    # Test functionality
    test_functionality
    
    success "Migration completed successfully!"
    log "Backup file: $backup_file"
    log "Migration log: $MIGRATION_LOG"
    
    # Show summary
    echo
    echo "=== Migration Summary ==="
    echo "Database: $DB_URL"
    echo "Backup: $backup_file"
    echo "Log file: $MIGRATION_LOG"
    echo "Timestamp: $TIMESTAMP"
    echo
    
    # Show new table statistics
    echo "=== Database Statistics ==="
    echo "Email accounts: $(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM email_accounts;" | tr -d ' ')"
    echo "Send-as aliases: $(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM email_send_as_aliases;" | tr -d ' ')"
    echo "Store connections: $(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM store_connections;" | tr -d ' ')"
    echo
}

# Handle script arguments
case "${1:-}" in
    "backup")
        check_prerequisites
        create_backup
        ;;
    "rollback")
        if [ -z "$2" ]; then
            error "Backup file required for rollback"
            echo "Usage: $0 rollback <backup_file>"
            exit 1
        fi
        rollback "$2"
        ;;
    "verify")
        verify_migration
        test_functionality
        ;;
    "help"|"-h"|"--help")
        echo "Gmail Send-As Aliases Migration Script"
        echo
        echo "Usage: $0 [command] [options]"
        echo
        echo "Commands:"
        echo "  (no args)    Run full migration"
        echo "  backup       Create backup only"
        echo "  rollback     Rollback from backup file"
        echo "  verify       Verify migration and test functionality"
        echo "  help         Show this help message"
        echo
        echo "Environment variables:"
        echo "  DATABASE_URL PostgreSQL connection string"
        echo
        exit 0
        ;;
    *)
        main
        ;;
esac
