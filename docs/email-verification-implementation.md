# Email Verification Implementation

## Overview

This document describes the email verification feature implementation for BOXMEOUT. The feature ensures users verify their email address before they can place trades or withdraw funds.

## Architecture

### Components

1. **Email Service** (`src/services/email.service.ts`)
   - Handles email sending (stub for production integration)
   - Generates verification email templates
   - Supports resend verification emails

2. **Auth Service** (`src/services/auth.service.ts`)
   - Manages user registration with email verification
   - Generates UUID-based verification tokens (24h expiry)
   - Stores tokens in Redis for fast lookup
   - Verifies tokens and marks users as verified
   - Provides email verification status checks

3. **Auth Routes** (`src/routes/auth.routes.ts`)
   - `POST /auth/register` - Register new user
   - `GET /auth/verify-email?token=` - Verify email with token
   - `POST /auth/resend-verification` - Resend verification email (rate-limited 1/min)

4. **Email Verification Middleware** (`src/middleware/email-verification.middleware.ts`)
   - Protects routes requiring email verification
   - Returns 403 if user not verified

5. **Main App** (`src/index.ts`)
   - Applies email verification middleware to protected routes
   - `/trading/*` - Requires email verification
   - `/wallet/withdraw` - Requires email verification

## Data Flow

### Registration Flow

```
1. User calls POST /auth/register with email + password
2. Auth service creates user with emailVerified = false
3. Generates UUID token, stores in Redis with 24h expiry
4. Sends verification email with token link
5. Returns userId and success message
```

### Email Verification Flow

```
1. User clicks link in email: GET /auth/verify-email?token=UUID
2. Auth service looks up token in Redis
3. If valid, marks user as emailVerified = true
4. Deletes token from Redis
5. Returns 200 success
```

### Protected Route Access

```
1. User attempts POST /trading/bet or POST /wallet/withdraw
2. Email verification middleware checks isEmailVerified(userId)
3. If false, returns 403 with error message
4. If true, allows request to proceed
```

### Resend Verification Flow

```
1. User calls POST /auth/resend-verification with email
2. Rate limiter allows 1 request per minute per IP
3. Auth service generates new token
4. Sends new verification email
5. Returns 200 success (doesn't leak if email exists)
```

## Token Management

### Token Storage

- **Location**: Redis
- **Key Format**: `email_verification:{UUID}`
- **Value**: userId
- **TTL**: 24 hours (86400 seconds)
- **Type**: UUID v4 (cryptographically secure)

### Token Lifecycle

1. Generated on registration
2. Stored in Redis with 24h expiry
3. Verified and deleted on successful verification
4. Automatically expires after 24h if not used
5. Can be regenerated via resend endpoint

## Security Considerations

### Token Security

- Uses UUID v4 (128-bit random, cryptographically secure)
- Stored in Redis (not in database)
- 24-hour expiry prevents indefinite validity
- Deleted immediately after verification
- Cannot be reused

### Rate Limiting

- Resend verification: 1 request per minute per IP
- Prevents email spam and brute force attempts
- Uses Redis-backed rate limiter

### Email Enumeration Prevention

- Resend endpoint returns 200 even for non-existent emails
- Prevents attackers from discovering registered emails
- Logs non-existent email attempts for monitoring

### Password Security

- TODO: Implement bcrypt hashing (currently stub)
- Passwords should never be stored in plaintext

## API Endpoints

### POST /auth/register

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (201):**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Registration successful. Please check your email to verify your account."
}
```

**Errors:**
- 400: Missing email or password
- 409: Email already registered
- 500: Failed to send verification email

### GET /auth/verify-email

**Query Parameters:**
- `token` (required): UUID verification token

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Errors:**
- 400: Invalid or expired token
- 400: Missing token

### POST /auth/resend-verification

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Verification email sent"
}
```

**Errors:**
- 400: Email already verified
- 400: Missing email
- 429: Rate limited (1 request per minute)
- 500: Failed to send email

### Protected Routes

**POST /trading/bet** (requires email verification)
**POST /wallet/withdraw** (requires email verification)

**Error (403) if not verified:**
```json
{
  "error": {
    "code": 403,
    "message": "Email verification required",
    "details": {
      "reason": "Please verify your email before accessing this resource"
    }
  }
}
```

## Testing

### Integration Tests

Located in `tests/integration/email-verification.integration.test.ts`

**Test Coverage:**

1. **Registration Tests**
   - Register user and send verification email
   - Reject duplicate email registration
   - Reject missing email or password

2. **Email Verification Tests**
   - Verify email with valid token
   - Reject invalid token
   - Reject missing token
   - Reject expired token

3. **Resend Verification Tests**
   - Resend verification email
   - Reject resend for already verified email
   - Rate limiting (1 request per minute)
   - Email enumeration prevention

4. **Protection Tests**
   - Allow verified user to place trade
   - Block unverified user from placing trade
   - Block unverified user from withdrawing
   - Allow verified user to withdraw

5. **Complete Flow Tests**
   - Full flow: register → verify → trade allowed
   - Unverified user blocked from all protected routes

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- email-verification.integration.test.ts

# Run with coverage
npm test -- --coverage
```

## Environment Variables

```env
# Email verification URL (used in email links)
VERIFY_EMAIL_URL=http://localhost:3000/auth/verify-email

# Redis connection
REDIS_URL=redis://localhost:6379

# JWT configuration
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
REFRESH_EXPIRES_IN=7d

# Email provider (TODO: implement)
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your-api-key
```

## Production Considerations

### Email Provider Integration

Currently, the email service logs emails instead of sending them. For production:

1. **SendGrid Integration**
   ```typescript
   import sgMail from '@sendgrid/mail';
   sgMail.setApiKey(process.env.SENDGRID_API_KEY);
   await sgMail.send({ to, subject, html });
   ```

2. **AWS SES Integration**
   ```typescript
   const ses = new AWS.SES();
   await ses.sendEmail({ Source, Destination, Message }).promise();
   ```

3. **Mailgun Integration**
   ```typescript
   const mailgun = require('mailgun.js');
   const client = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });
   ```

### Database Integration

Currently uses in-memory user store. For production:

1. Create `users` table with:
   - id (UUID primary key)
   - email (unique)
   - passwordHash (bcrypt)
   - emailVerified (boolean)
   - emailVerificationToken (nullable UUID)
   - createdAt
   - updatedAt

2. Add indexes:
   - email (unique)
   - emailVerificationToken (for fast lookup)

3. Replace in-memory Map with database queries

### Password Hashing

Implement bcrypt hashing in auth.service.ts:

```typescript
import bcrypt from 'bcrypt';

// On registration
const passwordHash = await bcrypt.hash(password, 10);

// On login
const isValid = await bcrypt.compare(password, user.passwordHash);
```

### Monitoring & Logging

1. Track verification rates
2. Monitor failed verification attempts
3. Alert on high resend rates (potential abuse)
4. Log all email send failures
5. Track email delivery status

### Rate Limiting Tuning

Current limits:
- Resend verification: 1 request per minute per IP

Consider adjusting based on:
- User feedback
- Abuse patterns
- Email delivery rates

## Troubleshooting

### Token Not Found

**Cause**: Token expired or already used
**Solution**: User should request resend verification

### Email Not Received

**Cause**: Email provider issue or spam filter
**Solution**: 
1. Check email provider logs
2. Verify sender reputation
3. Add to whitelist
4. Resend verification

### Rate Limit Exceeded

**Cause**: Too many resend requests
**Solution**: Wait 1 minute before retrying

### User Already Verified

**Cause**: Attempting to verify already verified email
**Solution**: User can proceed to login

## Future Enhancements

1. **Email Confirmation Tracking**
   - Track when email was verified
   - Track verification attempts
   - Alert on suspicious patterns

2. **Verification Expiry Notifications**
   - Remind users to verify before expiry
   - Auto-resend before expiry

3. **Multi-Email Support**
   - Allow users to add multiple emails
   - Verify each email separately

4. **Email Change Flow**
   - Allow users to change email
   - Verify new email before switching

5. **Passwordless Authentication**
   - Use email verification as login method
   - Send magic links instead of passwords

## References

- [OWASP Email Verification Best Practices](https://owasp.org/www-community/attacks/Email_Enumeration)
- [UUID v4 Security](https://tools.ietf.org/html/rfc4122)
- [Redis Key Expiration](https://redis.io/commands/expire)
- [Express Middleware Patterns](https://expressjs.com/en/guide/using-middleware.html)
