import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersPage from './+page.svelte';
import type { PageData } from './$types';

const mocks = vi.hoisted(() => ({
	confirmActivationReady: vi.fn(),
	getOrderSubscriptions: vi.fn(),
	goto: vi.fn()
}));

vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/api/orders.js', () => ({
	ordersService: {
		confirmActivationReady: mocks.confirmActivationReady,
		getOrderSubscriptions: mocks.getOrderSubscriptions
	}
}));

const orderId = '11111111-1111-4111-8111-111111111111';
const subscriptionId = '22222222-2222-4222-8222-222222222222';

const subscription = (state: 'awaiting_customer' | 'customer_ready') => ({
	id: subscriptionId,
	order_id: orderId,
	service_type: 'handshake_product',
	status: 'active',
	created_at: '2026-07-24T00:00:00.000Z',
	activation_handshake_state: state,
	product_options: {
		activation_link_handshake: true,
		activation_instructions_template: 'Your link expires shortly after it is generated.'
	}
});

const pageData = (state: 'awaiting_customer' | 'customer_ready') => ({
	orders: [
		{
			id: orderId,
			status: 'in_process',
			currency: 'USD',
			total_cents: 1000,
			created_at: '2026-07-24T00:00:00.000Z',
			updated_at: '2026-07-24T00:00:00.000Z',
			items: []
		}
	],
	subscriptionsByOrder: { [orderId]: [subscription(state)] },
	pagination: { limit: 10, offset: 0, total: 1, hasMore: false },
	page: 1,
	filters: { status: null, paymentProvider: null },
	error: ''
});

describe('activation readiness confirmation', () => {
	beforeEach(() => {
		mocks.confirmActivationReady.mockResolvedValue({
			subscription_id: subscriptionId,
			activation_handshake_state: 'customer_ready'
		});
		mocks.getOrderSubscriptions.mockResolvedValue({
			subscriptions: [subscription('customer_ready')]
		});
	});

	afterEach(() => {
		cleanup();
		Object.values(mocks).forEach((mock) => mock.mockReset());
	});

	it('replaces the acknowledgement card with a link-generation confirmation', async () => {
		const view = render(OrdersPage, {
			data: pageData('awaiting_customer') as unknown as PageData
		});
		const page = within(view.container);

		await fireEvent.click(page.getByLabelText('I understand'));
		await fireEvent.click(page.getByRole('button', { name: "I'm ready to activate" }));

		await waitFor(() =>
			expect(mocks.confirmActivationReady).toHaveBeenCalledWith(orderId, subscriptionId, true)
		);
		await waitFor(() =>
			expect(page.getByText('We’re generating your activation link')).toBeTruthy()
		);
		expect(page.queryByText('Ready to activate?')).toBeNull();
		expect(page.getByText(/SubSlush is now generating your activation link/)).toBeTruthy();
	});
});
