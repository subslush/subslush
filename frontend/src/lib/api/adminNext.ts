import { apiClient, createApiClient } from './client.js';
import type {
  AdminNextActionResult,
  AdminNextAnnouncement,
  AdminNextMmuDetail,
  AdminNextNewsletterCoupons,
  AdminNextOrderAggregate,
  AdminNextOrderFile,
  AdminNextOrderListItem,
  AdminNextOverviewKpis,
  AdminNextPaymentDetail,
  AdminNextPaymentLedgerItem,
  AdminNextQueueResponse,
  AdminNextQueueTab,
  AdminNextSearchResult,
  AdminNextSubscriptionDetail,
  AdminNextSubscriptionListItem,
  AdminNextUserLookup,
} from '$lib/types/adminNext.js';

type Client = ReturnType<typeof createApiClient>;
type QueryParams = Record<string, string | number | boolean | undefined>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const unwrap = <T>(response: { data?: unknown }): T => {
  const payload = response?.data;
  if (isRecord(payload) && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

export class AdminNextService {
  constructor(private client: Client = apiClient) {}

  async getOverview(): Promise<AdminNextOverviewKpis> {
    const response = await this.client.get('/admin/fulfillment/overview');
    return unwrap<AdminNextOverviewKpis>(response) || {};
  }

  async getQueue(params?: {
    tab?: AdminNextQueueTab;
    limit?: number;
    offset?: number;
  } & QueryParams): Promise<AdminNextQueueResponse> {
    const response = await this.client.get('/admin/fulfillment/queue', { params });
    const payload = unwrap<AdminNextQueueResponse>(response);
    return { orders: payload?.orders || [] };
  }

  async getOrder(orderId: string): Promise<AdminNextOrderAggregate> {
    const response = await this.client.get(`/admin/fulfillment/orders/${orderId}`);
    return unwrap<AdminNextOrderAggregate>(response);
  }

  async getMmuTask(taskId: string): Promise<AdminNextMmuDetail> {
    const response = await this.client.get(`/admin/fulfillment/mmu-tasks/${taskId}`);
    return unwrap<AdminNextMmuDetail>(response);
  }

  async search(query: string): Promise<{ results: AdminNextSearchResult[] }> {
    const response = await this.client.get('/admin/next/search', { params: { q: query } });
    const payload = unwrap<{ results?: AdminNextSearchResult[] }>(response);
    return { results: payload?.results || [] };
  }

  async listNextOrders(params?: QueryParams): Promise<{ orders: AdminNextOrderListItem[] }> {
    const response = await this.client.get('/admin/next/orders', { params });
    const payload = unwrap<{ orders?: AdminNextOrderListItem[] }>(response);
    return { orders: payload?.orders || [] };
  }

  async getOrderFile(orderId: string): Promise<AdminNextOrderFile> {
    const response = await this.client.get(`/admin/next/orders/${orderId}`);
    return unwrap<AdminNextOrderFile>(response);
  }

  async markOrderPaidManually(orderId: string, note: string): Promise<Record<string, unknown>> {
    const response = await this.client.post(`/admin/orders/${orderId}/mark-paid`, { note });
    return unwrap<Record<string, unknown>>(response);
  }

  async listNextSubscriptions(
    params?: QueryParams
  ): Promise<{ subscriptions: AdminNextSubscriptionListItem[] }> {
    const response = await this.client.get('/admin/next/subscriptions', { params });
    const payload = unwrap<{ subscriptions?: AdminNextSubscriptionListItem[] }>(response);
    return { subscriptions: payload?.subscriptions || [] };
  }

  async getNextSubscription(subscriptionId: string): Promise<AdminNextSubscriptionDetail> {
    const response = await this.client.get(`/admin/next/subscriptions/${subscriptionId}`);
    return unwrap<AdminNextSubscriptionDetail>(response);
  }

  async listNextPayments(params?: QueryParams): Promise<{ payments: AdminNextPaymentLedgerItem[] }> {
    const response = await this.client.get('/admin/next/payments', { params });
    const payload = unwrap<{ payments?: AdminNextPaymentLedgerItem[] }>(response);
    return { payments: payload?.payments || [] };
  }

  async getNextPayment(paymentId: string): Promise<AdminNextPaymentDetail> {
    const response = await this.client.get(`/admin/next/payments/${paymentId}`);
    return unwrap<AdminNextPaymentDetail>(response);
  }

  async retryPayment(paymentId: string): Promise<Record<string, unknown>> {
    const response = await this.client.post(`/admin/payments/retry/${paymentId}`);
    return unwrap<Record<string, unknown>>(response);
  }

  async searchSlimUsers(params?: QueryParams): Promise<{ users: AdminNextUserLookup[] }> {
    const response = await this.client.get('/admin/next/users/slim', { params });
    const payload = unwrap<{ users?: AdminNextUserLookup[] }>(response);
    return { users: payload?.users || [] };
  }

  async getNewsletterCoupons(): Promise<AdminNextNewsletterCoupons> {
    const response = await this.client.get('/admin/next/coupons/newsletter');
    return unwrap<AdminNextNewsletterCoupons>(response);
  }

  async getAnnouncements(): Promise<{ announcements: AdminNextAnnouncement[] }> {
    const response = await this.client.get('/admin/next/announcements');
    const payload = unwrap<{ announcements?: AdminNextAnnouncement[] }>(response);
    return { announcements: payload?.announcements || [] };
  }

  async sendAnnouncement(payload: { title?: string; message: string; expires_at?: string | null }) {
    const response = await this.client.post('/admin/notifications/announcements', payload);
    return unwrap<Record<string, unknown>>(response);
  }

  async listPayments(params?: QueryParams): Promise<{ payments: unknown[] }> {
    const response = await this.client.get('/admin/payments', { params });
    const payload = unwrap<{ payments?: unknown[] } | unknown[]>(response);
    if (Array.isArray(payload)) return { payments: payload };
    return { payments: payload?.payments || [] };
  }

  async saveCredentials(
    subscriptionId: string,
    payload: { credentials: string | null; reason?: string }
  ): Promise<Record<string, unknown> | null> {
    const response = await this.client.post(
      `/admin/subscriptions/${subscriptionId}/credentials`,
      payload
    );
    return unwrap<Record<string, unknown> | null>(response);
  }

  async viewSubscriptionCredentials(
    subscriptionId: string
  ): Promise<{ credentials: string | null }> {
    const response = await this.client.get(
      `/admin/subscriptions/${subscriptionId}/credentials`
    );
    return unwrap<{ credentials: string | null }>(response);
  }

  async viewOwnAccountCredentials(
    subscriptionId: string
  ): Promise<{
    subscription_id?: string;
    account_identifier?: string | null;
    credentials: string | null;
  }> {
    const response = await this.client.get(
      `/admin/subscriptions/${subscriptionId}/upgrade-selection/credentials`
    );
    return unwrap<{
      subscription_id?: string;
      account_identifier?: string | null;
      credentials: string | null;
    }>(response);
  }

  async viewTaskCredentials(taskId: string): Promise<{ credentials: string | null }> {
    const response = await this.client.get(`/admin/tasks/${taskId}/credentials`);
    return unwrap<{ credentials: string | null }>(response);
  }

  async deliverItem(orderId: string, subscriptionId: string): Promise<AdminNextActionResult> {
    const response = await this.client.post(
      `/admin/orders/${orderId}/items/${subscriptionId}/deliver`,
      { reason: 'fulfilled_from_admin_next' }
    );
    return unwrap<AdminNextActionResult>(response);
  }

  async deliverActivationInstructions(
    orderId: string,
    subscriptionId: string,
    instructions: string
  ): Promise<AdminNextActionResult> {
    const response = await this.client.post(
      `/admin/orders/${orderId}/items/${subscriptionId}/activation-instructions`,
      { instructions }
    );
    return unwrap<AdminNextActionResult>(response);
  }

  async deliverActivationLink(
    orderId: string,
    subscriptionId: string,
    activationLink: string
  ): Promise<AdminNextActionResult> {
    const response = await this.client.post(
      `/admin/orders/${orderId}/items/${subscriptionId}/activation-link`,
      { activation_link: activationLink }
    );
    return unwrap<AdminNextActionResult>(response);
  }

  async restartActivation(
    orderId: string,
    subscriptionId: string,
    note?: string
  ): Promise<AdminNextActionResult> {
    const response = await this.client.post(
      `/admin/orders/${orderId}/items/${subscriptionId}/activation-restart`,
      { note }
    );
    return unwrap<AdminNextActionResult>(response);
  }

  async completeTask(taskId: string, note?: string): Promise<Record<string, unknown>> {
    const response = await this.client.post(`/admin/tasks/${taskId}/complete`, { note });
    return unwrap<Record<string, unknown>>(response);
  }

  async confirmRenewal(taskId: string, note?: string): Promise<Record<string, unknown>> {
    const response = await this.client.post(`/admin/tasks/${taskId}/renewal/confirm`, {
      note,
    });
    return unwrap<Record<string, unknown>>(response);
  }

  async flagTaskIssue(taskId: string, note?: string): Promise<Record<string, unknown>> {
    const response = await this.client.post(`/admin/tasks/${taskId}/issue`, { note });
    return unwrap<Record<string, unknown>>(response);
  }
}

export const createAdminNextService = (
  customFetch?: typeof fetch,
  defaultHeaders?: Record<string, string>
) => new AdminNextService(createApiClient(customFetch, defaultHeaders));

export const adminNextService = new AdminNextService();
