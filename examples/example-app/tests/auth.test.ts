import { describe, it, expect } from 'node:test';
import assert from 'node:assert';
import { authenticate } from '../src/auth.ts';

describe('auth', () => {
  it('rejects empty token', () => {
    assert.strictEqual(authenticate(''), false);
  });
  it('accepts valid token', () => {
    assert.strictEqual(authenticate('valid-token-123'), true);
  });
});
