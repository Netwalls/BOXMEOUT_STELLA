/**
 * Input Sanitization Utilities
 * Provides XSS protection and input sanitization for user-generated content
 */

/**
 * Sanitize string input to prevent XSS attacks
 * Removes/escapes potentially dangerous HTML and script tags
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Escape HTML special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  // Remove any remaining control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized.trim();
}

/**
 * Sanitize market title - allows alphanumeric, spaces, and basic punctuation
 */
export function sanitizeMarketTitle(title: string): string {
  if (typeof title !== 'string') {
    throw new Error('Title must be a string');
  }

  // First apply basic sanitization
  let sanitized = sanitizeString(title);

  // Limit to safe characters: letters, numbers, spaces, and basic punctuation
  sanitized = sanitized.replace(/[^\w\s\-.,!?()&]/g, '');

  // Collapse multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Sanitize market description - allows more formatting but still prevents XSS
 */
export function sanitizeMarketDescription(description: string): string {
  if (typeof description !== 'string') {
    throw new Error('Description must be a string');
  }

  // Apply basic sanitization
  let sanitized = sanitizeString(description);

  // Allow newlines and basic punctuation
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Validate and sanitize numeric input
 * Prevents negative numbers, overflow, and non-numeric values
 */
export function validateNumericInput(
  value: any,
  options: {
    min?: number;
    max?: number;
    allowZero?: boolean;
    allowDecimals?: boolean;
  } = {}
): number {
  const {
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    allowZero = false,
    allowDecimals = true,
  } = options;

  // Convert to number
  const num = Number(value);

  // Check if valid number
  if (isNaN(num) || !isFinite(num)) {
    throw new Error('Invalid numeric value');
  }

  // Check for decimals if not allowed
  if (!allowDecimals && !Number.isInteger(num)) {
    throw new Error('Decimal values not allowed');
  }

  // Check zero
  if (!allowZero && num === 0) {
    throw new Error('Zero value not allowed');
  }

  // Check negative
  if (num < 0) {
    throw new Error('Negative values not allowed');
  }

  // Check min/max bounds
  if (num < min) {
    throw new Error(`Value must be at least ${min}`);
  }

  if (num > max) {
    throw new Error(`Value must not exceed ${max}`);
  }

  // Check for overflow
  if (num > Number.MAX_SAFE_INTEGER) {
    throw new Error('Numeric overflow detected');
  }

  return num;
}

/**
 * Validate Stellar address format
 * Ensures address follows Stellar public key format (G + 55 base32 chars)
 */
export function validateStellarAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  // Stellar public keys: G + 55 base32 characters (A-Z, 2-7)
  // Total length: 56 characters
  return /^G[A-Z2-7]{55}$/.test(address);
}

/**
 * Sanitize and validate pagination parameters
 */
export function validatePaginationParams(params: {
  page?: any;
  limit?: any;
}): { page: number; limit: number } {
  const page = validateNumericInput(params.page || 1, {
    min: 1,
    max: 10000,
    allowDecimals: false,
  });

  const limit = validateNumericInput(params.limit || 20, {
    min: 1,
    max: 100,
    allowDecimals: false,
  });

  return { page, limit };
}

/**
 * Validate outcome value (must be 0 or 1)
 */
export function validateOutcome(outcome: any): number {
  const num = Number(outcome);

  if (isNaN(num) || !Number.isInteger(num)) {
    throw new Error('Outcome must be an integer');
  }

  if (num !== 0 && num !== 1) {
    throw new Error('Outcome must be 0 or 1');
  }

  return num;
}

/**
 * Validate USDC amount (in stroops - 7 decimal places)
 * Stellar uses 7 decimal places for amounts
 */
export function validateUsdcAmount(amount: any): number {
  return validateNumericInput(amount, {
    min: 0.0000001, // Minimum 1 stroop
    max: 922337203685.4775807, // Max int64 in stroops
    allowZero: false,
    allowDecimals: true,
  });
}

/**
 * Sanitize object by removing null bytes and dangerous characters from all string values
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = { ...obj };

  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key]) as any;
    } else if (
      typeof sanitized[key] === 'object' &&
      sanitized[key] !== null &&
      !Array.isArray(sanitized[key])
    ) {
      sanitized[key] = sanitizeObject(sanitized[key]);
    }
  }

  return sanitized;
}
