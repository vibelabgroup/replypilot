# Production Deployment Checklist for Gmail Send-As Aliases
# File: docs/DEPLOYMENT-CHECKLIST.md

## Pre-Deployment Checklist

### 1. Environment Configuration
- [ ] **Google OAuth Setup**
  - [ ] Google Cloud project created
  - [ ] Gmail API enabled
  - [ ] OAuth 2.0 credentials created (Client ID + Secret)
  - [ ] Authorized redirect URIs configured
  - [ ] OAuth consent screen configured with required scopes

- [ ] **Microsoft OAuth Setup** (if using Outlook)
  - [ ] Azure AD app registration created
  - [ ] Microsoft Graph API enabled
  - [ ] OAuth 2.0 credentials created
  - [ ] Redirect URIs configured
  - [ ] API permissions configured (Mail.Read, Mail.Send, User.Read)

- [ ] **Environment Variables Set**
  ```bash
  # Google OAuth
  GOOGLE_CLIENT_ID=your_google_client_id
  GOOGLE_CLIENT_SECRET=your_google_client_secret
  GOOGLE_OAUTH_REDIRECT_URI=https://yourapp.com/oauth/gmail/callback
  GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.settings.basic openid email profile

  # Microsoft OAuth (optional)
  MICROSOFT_CLIENT_ID=your_microsoft_client_id
  MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
  MICROSOFT_OAUTH_REDIRECT_URI=https://yourapp.com/oauth/outlook/callback
  MICROSOFT_OAUTH_SCOPES=offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read

  # Security
  EMAIL_OAUTH_STATE_SECRET=your_32_character_random_secret

  # Email Service Configuration
  EMAIL_SYNC_INTERVAL=2
  EMAIL_BATCH_SIZE=25
  EMAIL_MAX_RETRIES=5
  EMAIL_RETRY_DELAY=5000

  # Rate Limiting
  EMAIL_RATE_LIMIT_PER_MINUTE=60
  EMAIL_RATE_LIMIT_BURST=10
  ```

### 2. Database Preparation
- [ ] **Database backup created**
  ```bash
  ./scripts/migrate-email-send-as.sh backup
  ```

- [ ] **Migration files reviewed**
  - [ ] `014_email_send_as_aliases.sql`
  - [ ] `015_email_error_logging.sql`

- [ ] **Database performance tested**
  - [ ] Index creation performance tested
  - [ ] Query performance validated
  - [ ] Connection pool sizing reviewed

### 3. Application Readiness
- [ ] **Code deployed to staging**
- [ ] **All tests passing**
  - [ ] Unit tests
  - [ ] Integration tests
  - [ ] Performance tests
  - [ ] End-to-end tests

- [ ] **Services updated**
  - [ ] Email token service
  - [ ] Email send service
  - [ ] Store routing service
  - [ ] Error handling service
  - [ ] Admin API endpoints
  - [ ] Tenant OAuth endpoints

## Deployment Process

### 1. Database Migration
```bash
# Run migration with backup
./scripts/migrate-email-send-as.sh

# Verify migration
./scripts/migrate-email-send-as.sh verify
```

### 2. Application Deployment
```bash
# Deploy with new configuration
docker-compose -f docker-compose.email-send-as.yml up -d

# Or update existing deployment
docker-compose pull
docker-compose up -d
```

### 3. Health Checks
- [ ] **Database connectivity**
- [ ] **Redis connectivity**
- [ ] **Email service endpoints**
- [ ] **OAuth endpoints**
- [ ] **Admin interface accessible**

## Post-Deployment Verification

### 1. Functional Testing
- [ ] **Gmail OAuth Flow**
  - [ ] Connect Gmail account
  - [ ] Verify send-as aliases discovered
  - [ ] Test email sending with aliases
  - [ ] Verify error handling

- [ ] **Store Email Routing**
  - [ ] Configure store with send-as alias
  - [ ] Test email routing to correct alias
  - [ ] Verify fallback to primary account
  - [ ] Test email signature inclusion

- [ ] **Admin Interface**
  - [ ] View email accounts and aliases
  - [ ] Configure store email routing
  - [ ] Test alias functionality
  - [ ] Monitor email health

### 2. Performance Monitoring
- [ ] **Email sending performance**
  - [ ] Average send time < 100ms
  - [ ] 95th percentile < 200ms
  - [ ] Throughput > 10 emails/second

- [ ] **Database performance**
  - [ ] Alias resolution < 10ms average
  - [ ] No slow queries detected
  - [ ] Connection pool utilization healthy

- [ ] **Memory usage**
  - [ ] No memory leaks detected
  - [ ] Heap usage stable under load
  - [ ] Garbage collection working properly

### 3. Error Handling Validation
- [ ] **Authentication errors**
  - [ ] Token refresh working
  - [ ] Re-authentication prompts working
  - [ ] Account status updates working

- [ ] **Verification errors**
  - [ ] Alias fallback working
  - [ ] Error notifications sent
  - [ ] Admin alerts working

- [ **Rate limiting**
  - [ ] Exponential backoff working
  - [ ] Queue functionality working
  - [ ] Monitoring alerts working

## Monitoring and Alerting

### 1. Key Metrics to Monitor
```javascript
// Email Account Health
- Authentication failure rate
- Token refresh success rate
- Alias verification status
- Email sending success rate

// Performance Metrics
- Email sending latency (p50, p95, p99)
- Alias resolution time
- Database query performance
- API response times

// Business Metrics
- Number of active email accounts
- Number of configured aliases
- Number of stores with email routing
- Email volume per account
```

### 2. Alert Configuration
- [ ] **Critical Alerts**
  - [ ] Email authentication failures > 5%
  - [ ] Email sending failure rate > 10%
  - [ ] Database connection failures
  - [ ] OAuth service unavailable

- [ ] **Warning Alerts**
  - [ ] Token refresh failures
  - [ ] Alias verification failures
  - [ ] High email latency (> 500ms)
  - [ ] Rate limit activations

### 3. Dashboard Setup
- [ ] **Email Service Health Dashboard**
- [ ] **OAuth Status Dashboard**
- [ ] **Performance Metrics Dashboard**
- [ ] **Error Rate Dashboard**

## Rollback Plan

### 1. Immediate Rollback Triggers
- [ ] Email sending failure rate > 20%
- [ ] Authentication failure rate > 10%
- [ ] Database performance degradation
- [ ] OAuth service integration failures

### 2. Rollback Procedure
```bash
# Stop new deployment
docker-compose -f docker-compose.email-send-as.yml down

# Restore database from backup
./scripts/migrate-email-send-as.sh rollback backup_file.sql

# Restart previous version
docker-compose up -d

# Verify rollback
./scripts/migrate-email-send-as.sh verify
```

### 3. Rollback Validation
- [ ] Email sending working with previous functionality
- [ ] No data loss occurred
- [ ] Performance restored to baseline
- [ ] All services healthy

## Security Considerations

### 1. OAuth Security
- [ ] **State parameter validation** working
- [ ] **PKCE** implemented (recommended)
- [ ] **Token storage** encrypted
- [ ] **Refresh token rotation** working

### 2. Data Protection
- [ ] **Email addresses** encrypted at rest
- [ ] **Access tokens** encrypted at rest
- [ ] **Audit logging** enabled
- [ ] **Data retention** policies configured

### 3. Access Control
- [ ] **Admin access** properly restricted
- [ ] **API rate limiting** effective
- [ ] **CORS policies** correctly configured
- [ ] **CSRF protection** enabled

## Documentation Updates

### 1. Technical Documentation
- [ ] API documentation updated
- [ ] Database schema documented
- [ ] Configuration guide updated
- [ ] Troubleshooting guide created

### 2. User Documentation
- [ ] Admin user guide updated
- [ ] Client setup guide created
- [ ] OAuth setup instructions created
- [ ] FAQ updated

### 3. Operations Documentation
- [ ] Deployment guide updated
- [ ] Monitoring guide created
- [ ] Runbook updated
- [ ] Contact procedures documented

## Final Sign-off

### 1. Development Team
- [ ] Code review completed
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Security review completed

### 2. Operations Team
- [ ] Deployment plan reviewed
- [ ] Monitoring configured
- [ ] Backup procedures verified
- [ ] Rollback plan tested

### 3. Product Team
- [ ] Feature acceptance testing completed
- [ ] User documentation reviewed
- [ ] Support team trained
- [ ] Customer communication prepared

---

## Deployment Timeline

| Phase | Duration | Owner | Status |
|-------|----------|-------|--------|
| Environment Setup | 2-4 hours | DevOps | |
| Database Migration | 1-2 hours | DBA | |
| Application Deployment | 1-2 hours | DevOps | |
| Health Checks | 1 hour | QA | |
| Functional Testing | 2-4 hours | QA | |
| Performance Validation | 2-3 hours | Performance Team | |
| Monitoring Setup | 1-2 hours | DevOps | |
| Documentation | 2-3 hours | Tech Writer | |
| Final Sign-off | 1 hour | All Teams | |

**Total Estimated Time:** 12-21 hours

---

## Emergency Contacts

- **DevOps Lead**: [Name] - [Phone] - [Email]
- **Database Admin**: [Name] - [Phone] - [Email]
- **Engineering Lead**: [Name] - [Phone] - [Email]
- **Product Manager**: [Name] - [Phone] - [Email]
