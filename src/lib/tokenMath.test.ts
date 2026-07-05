import { describe, expect, it } from 'vitest';
import {
  applyTokenMultiplier,
  parseTokenBalance,
  parseTokenTransaction,
} from '@/lib/tokenMath';

describe('applyTokenMultiplier', () => {
  it('returns the base amount with no multipliers', () => {
    expect(applyTokenMultiplier(10, 1, false)).toBe(10);
  });

  it('applies the DNA multiplier', () => {
    expect(applyTokenMultiplier(10, 1.5, false)).toBe(15);
  });

  it('applies the 2x boost', () => {
    expect(applyTokenMultiplier(10, 1, true)).toBe(20);
  });

  it('stacks DNA multiplier and 2x boost', () => {
    expect(applyTokenMultiplier(10, 1.5, true)).toBe(30);
  });

  it('rounds fractional results to whole tokens', () => {
    expect(applyTokenMultiplier(3, 1.1, false)).toBe(3); // 3.3 → 3
    expect(applyTokenMultiplier(5, 1.1, false)).toBe(6); // 5.5 → 6
  });

  it('never returns a negative or non-finite amount', () => {
    expect(applyTokenMultiplier(-5, 1, false)).toBe(0);
    expect(applyTokenMultiplier(Number.NaN, 1, true)).toBe(0);
    expect(applyTokenMultiplier(10, Number.NaN, false)).toBe(10);
  });

  it('ignores a zero/negative DNA multiplier (falls back to 1x)', () => {
    expect(applyTokenMultiplier(10, 0, false)).toBe(10);
    expect(applyTokenMultiplier(10, -2, false)).toBe(10);
  });
});

describe('parseTokenBalance', () => {
  it('passes through a valid row', () => {
    const row = {
      id: 'bal-1',
      user_id: 'user-1',
      balance: 120,
      lifetime_earned: 200,
      lifetime_spent: 80,
      updated_at: '2026-07-01T00:00:00.000Z',
    };
    expect(parseTokenBalance(row, 'fallback')).toEqual(row);
  });

  it('returns a zero balance for null/undefined rows', () => {
    const parsed = parseTokenBalance(null, 'user-9');
    expect(parsed.user_id).toBe('user-9');
    expect(parsed.balance).toBe(0);
    expect(parsed.lifetime_earned).toBe(0);
    expect(parsed.lifetime_spent).toBe(0);
  });

  it('coerces corrupt numeric fields to 0 instead of NaN', () => {
    const parsed = parseTokenBalance(
      { id: 'x', user_id: 'u', balance: 'not-a-number', lifetime_earned: Number.NaN },
      'u',
    );
    expect(parsed.balance).toBe(0);
    expect(parsed.lifetime_earned).toBe(0);
  });
});

describe('parseTokenTransaction', () => {
  it('parses a valid row', () => {
    const parsed = parseTokenTransaction({
      id: 'tx-1',
      user_id: 'u1',
      amount: -50,
      transaction_type: 'shop_purchase',
      description: 'Bought a boost',
      reference_id: 'item-1',
      created_at: '2026-07-01T00:00:00.000Z',
    });
    expect(parsed?.amount).toBe(-50);
    expect(parsed?.transaction_type).toBe('shop_purchase');
  });

  it('rejects rows without an id', () => {
    expect(parseTokenTransaction({ amount: 5 })).toBeNull();
    expect(parseTokenTransaction(null)).toBeNull();
    expect(parseTokenTransaction('junk')).toBeNull();
  });

  it('defaults missing optional fields', () => {
    const parsed = parseTokenTransaction({ id: 'tx-2' });
    expect(parsed).toMatchObject({
      id: 'tx-2',
      amount: 0,
      transaction_type: 'unknown',
      description: null,
      reference_id: null,
    });
  });
});
