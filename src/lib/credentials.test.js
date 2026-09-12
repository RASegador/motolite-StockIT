import { describe, it, expect } from 'vitest';
import {
  isValidUsername, usernameToEmail, resolveLoginEmail, generateOtp, encodeLoginQr, decodeLoginQr,
} from './credentials';

describe('isValidUsername', () => {
  it('accepts letters, numbers, dots, underscores, hyphens, 3-24 chars', () => {
    expect(isValidUsername('jdoe')).toBe(true);
    expect(isValidUsername('j.doe_2-3')).toBe(true);
  });
  it('rejects too short, too long, or invalid characters', () => {
    expect(isValidUsername('jd')).toBe(false);
    expect(isValidUsername('a'.repeat(25))).toBe(false);
    expect(isValidUsername('j doe')).toBe(false);
    expect(isValidUsername('j@doe')).toBe(false);
    expect(isValidUsername('')).toBe(false);
  });
});

describe('usernameToEmail / resolveLoginEmail', () => {
  it('builds a deterministic synthetic email, lowercased and trimmed', () => {
    expect(usernameToEmail(' JDoe ')).toBe('jdoe@users.motolite-ims.internal');
  });
  it('passes a real email through untouched', () => {
    expect(resolveLoginEmail('owner@example.com')).toBe('owner@example.com');
  });
  it('turns a plain username into its synthetic email', () => {
    expect(resolveLoginEmail('jdoe')).toBe('jdoe@users.motolite-ims.internal');
  });
});

describe('generateOtp', () => {
  it('generates an 8-character code by default, alphabet excludes ambiguous chars', () => {
    const otp = generateOtp();
    expect(otp).toHaveLength(8);
    expect(otp).not.toMatch(/[01OIL]/);
  });
});

describe('encodeLoginQr / decodeLoginQr', () => {
  it('round-trips username:password', () => {
    expect(decodeLoginQr(encodeLoginQr('jdoe', 'AB12CD34'))).toEqual({ username: 'jdoe', password: 'AB12CD34' });
  });
  it('returns null for text with no usable colon', () => {
    expect(decodeLoginQr('not-a-credential')).toBeNull();
    expect(decodeLoginQr(':nouser')).toBeNull();
    expect(decodeLoginQr('nopass:')).toBeNull();
  });
});
