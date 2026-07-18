import type { Subscription } from '$lib/types/subscription.js';

export const requiresStrictRulesAcknowledgement = (
  subscription: Subscription,
  acceptedThisSession = false
): boolean =>
  subscription.product_options?.strict_rules === true &&
  subscription.strict_rules_accepted !== true &&
  !acceptedThisSession;
