import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FulfillmentDetailPage from './orders/[orderId]/+page.svelte';
import type { AdminNextOrderAggregate } from '$lib/types/adminNext.js';
import type { PageData } from './orders/[orderId]/$types';

const mocks = vi.hoisted(() => ({
  deliverActivationLink: vi.fn(),
  restartActivation: vi.fn(),
  getOrder: vi.fn(),
  invalidateAll: vi.fn(),
}));

vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));
vi.mock('$lib/api/adminNext.js', () => ({
  adminNextService: {
    deliverActivationLink: mocks.deliverActivationLink,
    restartActivation: mocks.restartActivation,
    getOrder: mocks.getOrder,
  },
}));

const aggregate = (
  handshakeState: 'awaiting_customer' | 'customer_ready' | 'link_delivered'
): AdminNextOrderAggregate => ({
  customer: {
    account_email: 'customer@example.test',
    delivery_email: 'customer@example.test',
    status: 'active',
    guest: false,
  },
  order: {
    id: '11111111-1111-4111-8111-111111111111',
    total_cents: 1000,
    currency: 'USD',
    provider: 'stripe',
    payment_ref: 'pi_restart',
    paid_at: '2026-07-11T00:00:00.000Z',
    payment_status: handshakeState === 'link_delivered' ? 'delivered' : 'in_process',
  },
  items: [
    {
      subscription_id: '22222222-2222-4222-8222-222222222222',
      order_item_id: '33333333-3333-4333-8333-333333333333',
      product_name: 'Handshake product',
      variant_name: 'Standard',
      term_months: 1,
      status: 'active',
      credentials_on_file: handshakeState === 'link_delivered',
      handshake_state: handshakeState,
      delivered_at: '2026-07-11T00:00:00.000Z',
      delivery_email_sent_at: '2026-07-11T00:00:00.000Z',
      product_options: {
        activation_link_handshake: true,
        activation_instructions_template: 'Confirm readiness.',
      },
    },
  ],
});

describe('admin-next activation restart detail', () => {
  beforeEach(() => {
    mocks.deliverActivationLink.mockResolvedValue({});
    mocks.restartActivation.mockResolvedValue({});
    mocks.invalidateAll.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.values(mocks).forEach(mock => mock.mockReset());
  });

  it('shows Restart for a delivered handshake item and refreshes to awaiting customer', async () => {
    mocks.getOrder.mockResolvedValue(aggregate('awaiting_customer'));
    const view = render(FulfillmentDetailPage, {
      data: { aggregate: aggregate('link_delivered'), error: '' } as PageData,
    });
    const page = within(view.container);

    await fireEvent.click(
      page.getByRole('button', {
        name: 'Link expired unused? Restart activation step',
      })
    );

    await waitFor(() =>
      expect(mocks.restartActivation).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'Restarted from admin-next'
      )
    );
    expect(mocks.getOrder).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111'
    );
    expect(mocks.invalidateAll).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(page.getAllByText(/Awaiting customer/).length).toBeGreaterThan(0)
    );
  });

  it('refreshes the panel immediately after delivering a second link', async () => {
    mocks.getOrder.mockResolvedValue(aggregate('link_delivered'));
    const view = render(FulfillmentDetailPage, {
      data: { aggregate: aggregate('customer_ready'), error: '' } as PageData,
    });
    const page = within(view.container);

    await fireEvent.input(page.getByPlaceholderText('Activation link'), {
      target: { value: 'https://activate.test/second' },
    });
    await fireEvent.click(page.getByRole('button', { name: 'Deliver link' }));

    await waitFor(() =>
      expect(mocks.deliverActivationLink).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'https://activate.test/second'
      )
    );
    expect(mocks.getOrder).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111'
    );
    expect(mocks.invalidateAll).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(page.getByText(/Link delivered/)).toBeTruthy());
  });
});
