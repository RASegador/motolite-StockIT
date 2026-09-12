import { describe, it, expect } from 'vitest';
import { generateSecureToken } from './secureToken';

describe('generateSecureToken', () => {
  it('returns a 32-character hex string by default (16 bytes)', () => {
    const token = generateSecureToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is unique across many calls', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateSecureToken()));
    expect(tokens.size).toBe(1000);
  });

  it('respects a custom byte length', () => {
    expect(generateSecureToken(8)).toMatch(/^[0-9a-f]{16}$/);
  });
});
