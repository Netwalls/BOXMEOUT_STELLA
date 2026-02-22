// Authentication helper for load tests
// Handles the challenge-sign-verify flow for generating JWT tokens
import http from 'k6/http';
import { check } from 'k6';
import { CONFIG, HEADERS } from '../config.js';

// Request a challenge nonce for a given public key
export function requestChallenge(publicKey) {
  const res = http.post(
    `${CONFIG.BASE_URL}/api/auth/challenge`,
    JSON.stringify({ publicKey }),
    { headers: HEADERS, tags: { name: 'auth_challenge' } }
  );

  const success = check(res, {
    'challenge: status 200': (r) => r.status === 200,
    'challenge: has nonce': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.nonce || !!(body.data && body.data.nonce);
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    return null;
  }

  try {
    const body = JSON.parse(res.body);
    return body.data || body;
  } catch {
    return null;
  }
}

// Login with a pre-signed payload (for load testing, we skip real signing)
// In a real load test, you'd use a pool of pre-generated tokens
export function login(publicKey, nonce, signature) {
  const res = http.post(
    `${CONFIG.BASE_URL}/api/auth/login`,
    JSON.stringify({ publicKey, nonce, signature }),
    { headers: HEADERS, tags: { name: 'auth_login' } }
  );

  const success = check(res, {
    'login: status 200': (r) => r.status === 200,
  });

  if (!success) {
    return null;
  }

  try {
    const body = JSON.parse(res.body);
    return body.data || body;
  } catch {
    return null;
  }
}

// Build authorized headers from a token
export function authHeaders(token) {
  return {
    ...HEADERS,
    Authorization: `Bearer ${token}`,
  };
}

// Refresh an access token
export function refreshToken(refreshToken) {
  const res = http.post(
    `${CONFIG.BASE_URL}/api/auth/refresh`,
    JSON.stringify({ refreshToken }),
    { headers: HEADERS, tags: { name: 'auth_refresh' } }
  );

  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      return body.data || body;
    } catch {
      return null;
    }
  }
  return null;
}
