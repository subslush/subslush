import { describe, expect, it } from 'vitest';
import type { Subscription } from '$lib/types/subscription.js';
import { requiresStrictRulesAcknowledgement } from './strictRules.js';

const strictSubscription = {
  id: 'subscription-1',
  product_options: { strict_rules: true, strict_rules_version: 7 },
} as Subscription;

describe('strict-rules acknowledgement UI gate', () => {
  it('shows once, then skips after acceptance in-session', () => {
    expect(requiresStrictRulesAcknowledgement(strictSubscription)).toBe(true);
    expect(requiresStrictRulesAcknowledgement(strictSubscription, true)).toBe(false);
  });

  it('skips when the current rules version was accepted in the server payload', () => {
    expect(
      requiresStrictRulesAcknowledgement({
        ...strictSubscription,
        strict_rules_accepted: true,
      })
    ).toBe(false);
  });
});
