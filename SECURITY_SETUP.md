# Security Setup Guide - Campus to Career Platform

This guide covers the security features implemented and how to configure them properly.

## Table of Contents
1. [Environment Variables](#environment-variables)
2. [JWT Configuration](#jwt-configuration)
3. [Redis Setup](#redis-setup)
4. [PII Encryption](#pii-encryption)
5. [Email Verification](#email-verification)
6. [Security Features Overview](#security-features-overview)
7. [Production Deployment Checklist](#production-deployment-checklist)

---

## Environment Variables

### Critical Security Variables

These variables MUST be set and properly secured:

```bash
# Generate strong secrets (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

JWT_SECRET=<generated-secret>
JWT_REFRESH_SECRET=<different-generated-secret>
ENCRYPTION_KEY=<generated-encryption-key>
RESET_TOKEN_SECRET=<generated-secret>
```

### Redis Configuration

Required for:
- Token blacklist (logout/revocation)
- Caching (performance)
- Rate limiting (optional)

```bash
# Local development
REDIS_URL=redis://localhost:6379

# Production (e.g., Redis Cloud, Upstash, AWS ElastiCache)
REDIS_URL=redis://username:password@host:port
```

**Note**: If Redis is unavailable, the system gracefully degrades:
- Token blacklist → In-memory fallback (single-server only)
- Caching → In-memory LRU cache (max 500 entries)

---

## JWT Configuration

### Secret Requirements

✅ **Minimum 32 characters**  
✅ **Contains uppercase, lowercase, and numbers**  
❌ Avoid: short secrets, dictionary words, default values

The system validates JWT secrets on startup and will fail if they're too weak.

### Token Expiration

```bash
JWT_EXPIRES_IN=15m          # Access token (short-lived)
JWT_REFRESH_EXPIRES_IN=7d   # Refresh token (long-lived)
```

### Token Blacklist

When users logout, their access tokens are added to a Redis-based blacklist to prevent reuse.

**Features:**
- Auto-expiry based on token TTL
- In-memory fallback if Redis unavailable
- Used in `POST /api/auth/logout`

---

## Redis Setup

### Local Development (Docker)

```bash
docker run -d -p 6379:6379 redis:alpine
```

### Local Development (Direct Install)

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

**Windows:**
Use WSL2 or download from https://redis.io/download

### Cloud Redis (Production)

**Upstash** (Free tier available):
1. Create account at https://upstash.com
2. Create Redis database
3. Copy connection string to `REDIS_URL`

**Redis Cloud**:
1. Sign up at https://redis.com/try-free/
2. Create database
3. Get connection string

---

## PII Encryption

### What's Encrypted

User fields encrypted at rest with AES-256-GCM:
- `name`
- `githubUsername`
- `linkedinUrl`
- `bio`
- `profile.registerNumber`
- `profile.location`

### Encryption Key Setup

```bash
# Generate a secure 32+ character key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
ENCRYPTION_KEY=<generated-key>
```

**⚠️ CRITICAL**: Never commit this key to version control!

### Key Rotation (Future)

If you need to rotate the encryption key:
1. Generate new key
2. Create migration script to decrypt with old key, encrypt with new key
3. Update `ENCRYPTION_KEY`
4. Run migration

---

## Email Verification

### Setup

Email verification is automatically enabled. When users register:
1. Verification email sent with 24-hour token
2. User clicks link → email verified
3. Optional: Require verification for sensitive features

### Routes

- `GET /api/auth/verify-email/:token` - Verify email (public)
- `POST /api/auth/send-verification` - Resend verification (protected)
- `POST /api/auth/resend-verification` - Request new verification (protected)

### Requiring Verification

Use the middleware in routes:

```javascript
const { requireEmailVerification } = require('./middleware/emailVerification.middleware');

router.get('/sensitive-data', verifyJWT, requireEmailVerification, controller);
```

---

## Security Features Overview

### 1. **JWT Token Management**
- ✅ Strong secret validation (32 char minimum)
- ✅ Token blacklist on logout
- ✅ Refresh token rotation
- ✅ Short-lived access tokens (15 min)

### 2. **Account Lockout (Exponential Backoff)**
- 3 failed attempts → 5 min lockout
- 4 attempts → 15 min lockout
- 5 attempts → 1 hour lockout
- 6 attempts → 4 hours lockout
- 7+ attempts → 24 hours lockout
- Auto-reset after 24 hours of inactivity

### 3. **PII Encryption**
- AES-256-GCM encryption at rest
- PBKDF2 key derivation (100k iterations)
- Automatic encrypt/decrypt with Mongoose hooks

### 4. **Email Verification**
- 24-hour verification tokens
- Secure token hashing (SHA-256)
- Rate-limited resend (5 min cooldown)

### 5. **AI Prompt Injection Defense**
- Pattern detection for instruction overrides
- Role manipulation blocking
- System prompt extraction prevention
- Code execution attempt detection
- Entropy analysis for obfuscated payloads

### 6. **Code Execution Security**
- `execFile()` instead of `exec()` (prevents shell injection)
- Timeout limits (4s execution, 8s compilation)
- Safe subprocess environment
- Output size limits (512KB max)

### 7. **Caching & Performance**
- Redis caching with configurable TTL
- In-memory LRU fallback
- Cache invalidation on mutations
- User-specific cache keys

### 8. **Audit Logging**
- 30+ event types tracked
- AUTH, DATA, SECURITY, ADMIN categories
- IP tracking, user agent logging
- 90-day TTL (auto-cleanup)
- Query methods for security monitoring

### 9. **AI Cost Tracking**
- Per-request token counting
- Model-specific pricing (Gemini 1.5 Pro/Flash)
- Budget management (daily/monthly limits)
- Cost analytics and efficiency metrics

---

## Production Deployment Checklist

### Before Deploying

- [ ] Generate strong secrets (32+ chars) for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`
- [ ] Set up Redis (cloud provider recommended)
- [ ] Configure email service (Resend or Brevo)
- [ ] Set `NODE_ENV=production`
- [ ] Configure `FRONTEND_URL` for email verification links
- [ ] Review rate limits in routes (adjust if needed)
- [ ] Set up monitoring for security events
- [ ] Configure CORS for production domains

### Environment Variables (Production)

```bash
NODE_ENV=production
PORT=5000

# Strong secrets (NEVER use defaults)
JWT_SECRET=<strong-32+-char-secret>
JWT_REFRESH_SECRET=<different-strong-secret>
ENCRYPTION_KEY=<strong-32+-char-key>
RESET_TOKEN_SECRET=<strong-secret>

# MongoDB (production cluster)
MONGODB_URI=mongodb+srv://...

# Redis (cloud provider)
REDIS_URL=redis://...

# Frontend URLs
FRONTEND_URL=https://your-domain.com
CLIENT_URL=https://your-domain.com
ADMIN_CLIENT_URL=https://admin.your-domain.com

# Email (HTTP-based APIs recommended)
RESEND_API_KEY=re_...
# OR
BREVO_API_KEY=xkeysib-...

# AI APIs
GEMINI_API_KEY=...
NVIDIA_API_KEY=...

# OAuth
GOOGLE_CLIENT_ID=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

### Security Monitoring

Monitor these events in audit logs:

```javascript
// Get recent security events
const events = await AuditLog.findSecurityEvents(24, 'HIGH');

// Check for suspicious activity
const failedLogins = await AuditLog.findFailedLogins(ipAddress, 15);

// Top spenders (potential abuse)
const topSpenders = await AIUsageLog.getTopSpenders(10, 30);
```

### Rate Limiting

Current rate limits (adjust in route files):

- Login: 30 attempts / 15 min
- Registration: 30 attempts / 1 hour
- Password reset: 10 attempts / 1 hour
- Token refresh: 150 attempts / 15 min
- Interview sessions: 5 starts / 1 hour per user

### Backup Strategy

**Critical to backup:**
1. MongoDB (user data, encrypted PII)
2. Encryption key (secure vault only)
3. Redis (optional, cache can be rebuilt)

**Never backup to public repositories:**
- `.env` files
- Encryption keys
- JWT secrets

---

## Troubleshooting

### "JWT_SECRET must be at least 32 characters"

Generate a proper secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### "ENCRYPTION_KEY not set"

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### "Redis connection failed"

Check if Redis is running:
```bash
redis-cli ping
# Should return: PONG
```

The app will work without Redis but with degraded features (in-memory fallback).

### "Email verification emails not sending"

1. Check email service API keys (`RESEND_API_KEY` or `BREVO_API_KEY`)
2. Verify sender email is approved
3. Check `FRONTEND_URL` is set correctly
4. Review email service logs

### "Account locked" after failed logins

Wait for lockout period to expire, or admin can manually unlock:
```javascript
await User.findByIdAndUpdate(userId, {
  failedLoginAttempts: 0,
  lockUntil: null
});
```

---

## Support

For security concerns or questions:
- Create an issue (for non-sensitive questions)
- Email: security@campustocareer.com (for vulnerabilities)

**Responsible Disclosure**: Please report security vulnerabilities privately before public disclosure.
