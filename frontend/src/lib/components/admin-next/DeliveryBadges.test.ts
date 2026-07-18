import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import DeliveryBadges from './DeliveryBadges.svelte';

describe('DeliveryBadges', () => {
  it('labels an own-account selection without a New account badge', () => {
    const view = render(DeliveryBadges, { itemType: 'own_account' });
    expect(screen.getByText('Own account')).toBeTruthy();
    expect(screen.queryByText('New account')).toBeNull();
    view.unmount();
  });

  it('labels a new-account selection without an Own account badge', () => {
    const view = render(DeliveryBadges, { itemType: 'new_account' });
    expect(screen.getByText('New account')).toBeTruthy();
    expect(screen.queryByText('Own account')).toBeNull();
    view.unmount();
  });

  it('labels an activation-link handshake alongside its account type', () => {
    const view = render(DeliveryBadges, {
      itemType: 'new_account',
      method: { activation_link_handshake: true },
    });
    expect(screen.getByText('New account')).toBeTruthy();
    expect(screen.getByText('Activation link')).toBeTruthy();
    view.unmount();
  });
});
