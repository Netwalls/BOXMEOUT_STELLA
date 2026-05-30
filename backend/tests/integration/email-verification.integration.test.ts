import request from 'supertest';
import app from '../../src/index';
import * as authService from '../../src/services/auth.service';
import { redis } from '../../src/services/cache.service';
import { AppError } from '../../src/utils/AppError';

describe('Email Verification Integration Tests', () => {
  beforeAll(async () => {
    // Connect Redis
    await redis.connect();
  });

  afterAll(async () => {
    // Clean up
    await redis.flushdb();
    await redis.disconnect();
  });

  beforeEach(async () => {
    // Clear users and Redis before each test
    authService.users.clear();
    await redis.flushdb();
  });

  describe('POST /auth/register', () => {
    it('should register user and send verification email', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('userId');
      expect(res.body.message).toContain('verification');

      // Verify user was created but not verified
      const user = authService.users.get(res.body.userId);
      expect(user).toBeDefined();
      expect(user?.emailVerified).toBe(false);
      expect(user?.email).toBe('test@example.com');
    });

    it('should reject duplicate email registration', async () => {
      // First registration
      await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      // Second registration with same email
      const res = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password456',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('already registered');
    });

    it('should reject missing email or password', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('required');
    });
  });

  describe('GET /auth/verify-email', () => {
    it('should verify email with valid token', async () => {
      // Register user
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const userId = registerRes.body.userId;
      const user = authService.users.get(userId);
      const token = user?.emailVerificationToken;

      expect(token).toBeDefined();

      // Verify email
      const verifyRes = await request(app)
        .get('/auth/verify-email')
        .query({ token });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      // Check user is now verified
      const updatedUser = authService.users.get(userId);
      expect(updatedUser?.emailVerified).toBe(true);
      expect(updatedUser?.emailVerificationToken).toBeUndefined();
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/auth/verify-email')
        .query({ token: 'invalid-token-12345' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid or expired');
    });

    it('should reject missing token', async () => {
      const res = await request(app)
        .get('/auth/verify-email');

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('required');
    });

    it('should reject expired token', async () => {
      // Register user
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const userId = registerRes.body.userId;
      const user = authService.users.get(userId);
      const token = user?.emailVerificationToken;

      // Manually expire token in Redis
      await redis.del(`email_verification:${token}`);

      // Try to verify
      const verifyRes = await request(app)
        .get('/auth/verify-email')
        .query({ token });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.error.message).toContain('Invalid or expired');
    });
  });

  describe('POST /auth/resend-verification', () => {
    it('should resend verification email', async () => {
      // Register user
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const userId = registerRes.body.userId;
      const oldToken = authService.users.get(userId)?.emailVerificationToken;

      // Resend verification
      const resendRes = await request(app)
        .post('/auth/resend-verification')
        .send({ email: 'test@example.com' });

      expect(resendRes.status).toBe(200);
      expect(resendRes.body.success).toBe(true);

      // Token should be updated
      const newToken = authService.users.get(userId)?.emailVerificationToken;
      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(oldToken);
    });

    it('should reject resend for already verified email', async () => {
      // Register and verify
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const userId = registerRes.body.userId;
      const user = authService.users.get(userId);
      const token = user?.emailVerificationToken;

      await request(app)
        .get('/auth/verify-email')
        .query({ token });

      // Try to resend
      const resendRes = await request(app)
        .post('/auth/resend-verification')
        .send({ email: 'test@example.com' });

      expect(resendRes.status).toBe(400);
      expect(resendRes.body.error.message).toContain('already verified');
    });

    it('should be rate-limited to 1 request per minute', async () => {
      // Register user
      await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      // First resend should succeed
      const res1 = await request(app)
        .post('/auth/resend-verification')
        .send({ email: 'test@example.com' });

      expect(res1.status).toBe(200);

      // Second resend should be rate-limited
      const res2 = await request(app)
        .post('/auth/resend-verification')
        .send({ email: 'test@example.com' });

      expect(res2.status).toBe(429);
      expect(res2.body.error.message).toContain('Too Many Requests');
    });

    it('should not leak whether email exists', async () => {
      const res = await request(app)
        .post('/auth/resend-verification')
        .send({ email: 'nonexistent@example.com' });

      // Should return 200 even if email doesn't exist (security best practice)
      expect(res.status).toBe(200);
    });

    it('should reject missing email', async () => {
      const res = await request(app)
        .post('/auth/resend-verification')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('required');
    });
  });

  describe('Email Verification Protection', () => {
    it('should allow verified user to place trade', async () => {
      // Register and verify
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const userId = registerRes.body.userId;
      const user = authService.users.get(userId);
      const token = user?.emailVerificationToken;

      await request(app)
        .get('/auth/verify-email')
        .query({ token });

      // Mock authenticated request
      const tradeRes = await request(app)
        .post('/trading/bet')
        .set('Authorization', `Bearer ${userId}`);

      expect(tradeRes.status).toBe(200);
      expect(tradeRes.body.ok).toBe(true);
    });

    it('should block unverified user from placing trade', async () => {
      // Register but don't verify
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const userId = registerRes.body.userId;

      // Try to place trade
      const tradeRes = await request(app)
        .post('/trading/bet')
        .set('Authorization', `Bearer ${userId}`);

      expect(tradeRes.status).toBe(403);
      expect(tradeRes.body.error.message).toContain('Email verification required');
    });

    it('should block unverified user from withdrawing', async () => {
      // Register but don't verify
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const userId = registerRes.body.userId;

      // Try to withdraw
      const withdrawRes = await request(app)
        .post('/wallet/withdraw')
        .set('Authorization', `Bearer ${userId}`);

      expect(withdrawRes.status).toBe(403);
      expect(withdrawRes.body.error.message).toContain('Email verification required');
    });

    it('should allow verified user to withdraw', async () => {
      // Register and verify
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const userId = registerRes.body.userId;
      const user = authService.users.get(userId);
      const token = user?.emailVerificationToken;

      await request(app)
        .get('/auth/verify-email')
        .query({ token });

      // Try to withdraw
      const withdrawRes = await request(app)
        .post('/wallet/withdraw')
        .set('Authorization', `Bearer ${userId}`);

      expect(withdrawRes.status).toBe(200);
      expect(withdrawRes.body.ok).toBe(true);
    });
  });

  describe('Complete User Flow', () => {
    it('should complete full flow: register → verify → trade allowed', async () => {
      // Step 1: Register
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'user@example.com',
          password: 'securepass123',
        });

      expect(registerRes.status).toBe(201);
      const userId = registerRes.body.userId;

      // Step 2: Verify user is not verified yet
      let user = authService.users.get(userId);
      expect(user?.emailVerified).toBe(false);

      // Step 3: Try to trade (should fail)
      const tradeBeforeRes = await request(app)
        .post('/trading/bet')
        .set('Authorization', `Bearer ${userId}`);

      expect(tradeBeforeRes.status).toBe(403);

      // Step 4: Get verification token and verify email
      const token = user?.emailVerificationToken;
      const verifyRes = await request(app)
        .get('/auth/verify-email')
        .query({ token });

      expect(verifyRes.status).toBe(200);

      // Step 5: Verify user is now verified
      user = authService.users.get(userId);
      expect(user?.emailVerified).toBe(true);

      // Step 6: Try to trade (should succeed)
      const tradeAfterRes = await request(app)
        .post('/trading/bet')
        .set('Authorization', `Bearer ${userId}`);

      expect(tradeAfterRes.status).toBe(200);
      expect(tradeAfterRes.body.ok).toBe(true);
    });

    it('should complete full flow: unverified user blocked from all protected routes', async () => {
      // Register
      const registerRes = await request(app)
        .post('/auth/register')
        .send({
          email: 'user@example.com',
          password: 'securepass123',
        });

      const userId = registerRes.body.userId;

      // Try to trade
      const tradeRes = await request(app)
        .post('/trading/bet')
        .set('Authorization', `Bearer ${userId}`);

      expect(tradeRes.status).toBe(403);

      // Try to withdraw
      const withdrawRes = await request(app)
        .post('/wallet/withdraw')
        .set('Authorization', `Bearer ${userId}`);

      expect(withdrawRes.status).toBe(403);

      // Both should have same error
      expect(tradeRes.body.error.message).toBe(withdrawRes.body.error.message);
    });
  });
});
