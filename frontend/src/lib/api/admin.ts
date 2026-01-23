import { apiClient, createApiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type {
  AdminProduct,
  AdminProductVariant,
  AdminProductLabel,
  AdminProductMedia,
  AdminPriceHistory,
  AdminSetCurrentPriceInput,
  AdminProductDetail,
  AdminProductVariantTerm,
  AdminOrder,
  AdminOrderItem,
  AdminOrderFulfillment,
  AdminRenewalFulfillment,
  AdminPayment,
  AdminSubscription,
  AdminCreditBalance,
  AdminCreditTransaction,
  AdminUserLookup,
  AdminListPagination,
  AdminReward,
  AdminTask,
  AdminPrelaunchRewardTask,
  AdminMigrationPreview,
  AdminMigrationResult,
  AdminRefund,
  AdminRefundStats,
  AdminCoupon,
  AdminAnnouncementResult,
  AdminOverviewMetrics,
  AdminPinResetRequest,
  AdminPinResetConfirm,
  AdminBisInquiry,
  AdminBisInquiryStatus
} from '$lib/types/admin.js';

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

const unwrapItems = <T>(response: { data?: unknown }, fallbackKey: string): T[] => {
  const payload = unwrap<unknown>(response);
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (isRecord(payload)) {
    if (Array.isArray(payload.items)) {
      return payload.items as T[];
    }
    const fallbackItems = payload[fallbackKey];
    if (Array.isArray(fallbackItems)) {
      return fallbackItems as T[];
    }
  }
  return [];
};

export class AdminService {
  constructor(private client: Client = apiClient) {}

  async listProducts(params?: QueryParams): Promise<AdminProduct[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.PRODUCTS, { params });
    return unwrapItems<AdminProduct>(response, 'products');
  }

  async getProductDetail(productId: string): Promise<AdminProductDetail> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.PRODUCTS}/${productId}`);
    const payload = unwrap<AdminProductDetail>(response) || ({} as AdminProductDetail);
    const priceHistory = payload.priceHistory || payload.price_history || payload.prices || [];
    const variantTerms = payload.variantTerms || payload.variant_terms || [];
    return {
      product: payload.product,
      variants: payload.variants || [],
      labels: payload.labels || [],
      media: payload.media || [],
      priceHistory,
      variantTerms
    };
  }

  async getProduct(productId: string): Promise<AdminProduct> {
    const detail = await this.getProductDetail(productId);
    return detail.product;
  }

  async createProduct(payload: Partial<AdminProduct>): Promise<AdminProduct> {
    const response = await this.client.post(API_ENDPOINTS.ADMIN.PRODUCTS, payload);
    return unwrap<AdminProduct>(response);
  }

  async updateProduct(productId: string, payload: Partial<AdminProduct>): Promise<AdminProduct> {
    const response = await this.client.patch(`${API_ENDPOINTS.ADMIN.PRODUCTS}/${productId}`, payload);
    return unwrap<AdminProduct>(response);
  }

  async listVariants(params?: QueryParams): Promise<AdminProductVariant[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.PRODUCT_VARIANTS, { params });
    return unwrapItems<AdminProductVariant>(response, 'variants');
  }

  async createVariant(payload: Partial<AdminProductVariant>): Promise<AdminProductVariant> {
    const response = await this.client.post(API_ENDPOINTS.ADMIN.PRODUCT_VARIANTS, payload);
    return unwrap<AdminProductVariant>(response);
  }

  async updateVariant(variantId: string, payload: Partial<AdminProductVariant>): Promise<AdminProductVariant> {
    const response = await this.client.patch(`${API_ENDPOINTS.ADMIN.PRODUCT_VARIANTS}/${variantId}`, payload);
    return unwrap<AdminProductVariant>(response);
  }

  async deleteVariant(variantId: string): Promise<{ deleted: boolean }> {
    const response = await this.client.delete(`${API_ENDPOINTS.ADMIN.PRODUCT_VARIANTS}/${variantId}`);
    return unwrap<{ deleted: boolean }>(response);
  }

  async listVariantTerms(params?: QueryParams): Promise<AdminProductVariantTerm[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.PRODUCT_VARIANT_TERMS, { params });
    return unwrapItems<AdminProductVariantTerm>(response, 'terms');
  }

  async createVariantTerm(payload: Partial<AdminProductVariantTerm>): Promise<AdminProductVariantTerm> {
    const response = await this.client.post(API_ENDPOINTS.ADMIN.PRODUCT_VARIANT_TERMS, payload);
    return unwrap<AdminProductVariantTerm>(response);
  }

  async updateVariantTerm(termId: string, payload: Partial<AdminProductVariantTerm>): Promise<AdminProductVariantTerm> {
    const response = await this.client.patch(`${API_ENDPOINTS.ADMIN.PRODUCT_VARIANT_TERMS}/${termId}`, payload);
    return unwrap<AdminProductVariantTerm>(response);
  }

  async deleteVariantTerm(termId: string): Promise<{ deleted: boolean }> {
    const response = await this.client.delete(`${API_ENDPOINTS.ADMIN.PRODUCT_VARIANT_TERMS}/${termId}`);
    return unwrap<{ deleted: boolean }>(response);
  }

  async listLabels(params?: QueryParams): Promise<AdminProductLabel[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.PRODUCT_LABELS, { params });
    return unwrapItems<AdminProductLabel>(response, 'labels');
  }

  async createLabel(payload: Partial<AdminProductLabel>): Promise<AdminProductLabel> {
    const response = await this.client.post(API_ENDPOINTS.ADMIN.PRODUCT_LABELS, payload);
    return unwrap<AdminProductLabel>(response);
  }

  async listProductLabels(productId: string): Promise<AdminProductLabel[]> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.PRODUCTS}/${productId}/labels`);
    return unwrapItems<AdminProductLabel>(response, 'labels');
  }

  async attachProductLabel(productId: string, labelId: string): Promise<AdminProductLabel[]> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.PRODUCTS}/${productId}/labels`, {
      label_id: labelId
    });
    return unwrapItems<AdminProductLabel>(response, 'labels');
  }

  async detachProductLabel(productId: string, labelId: string): Promise<AdminProductLabel[]> {
    const response = await this.client.delete(`${API_ENDPOINTS.ADMIN.PRODUCTS}/${productId}/labels/${labelId}`);
    return unwrapItems<AdminProductLabel>(response, 'labels');
  }

  async listMedia(params?: QueryParams): Promise<AdminProductMedia[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.PRODUCT_MEDIA, { params });
    return unwrapItems<AdminProductMedia>(response, 'media');
  }

  async createMedia(payload: Partial<AdminProductMedia>): Promise<AdminProductMedia> {
    const response = await this.client.post(API_ENDPOINTS.ADMIN.PRODUCT_MEDIA, payload);
    return unwrap<AdminProductMedia>(response);
  }

  async listPriceHistory(params?: QueryParams): Promise<AdminPriceHistory[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.PRICE_HISTORY, { params });
    return unwrapItems<AdminPriceHistory>(response, 'prices');
  }

  async createPrice(payload: Partial<AdminPriceHistory>): Promise<AdminPriceHistory> {
    const response = await this.client.post(API_ENDPOINTS.ADMIN.PRICE_HISTORY, payload);
    return unwrap<AdminPriceHistory>(response);
  }

  async setCurrentPrice(payload: AdminSetCurrentPriceInput): Promise<AdminPriceHistory> {
    const response = await this.client.post(
      `${API_ENDPOINTS.ADMIN.PRICE_HISTORY}/current`,
      payload
    );
    return unwrap<AdminPriceHistory>(response);
  }

  async listOrders(params?: QueryParams): Promise<AdminOrder[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.ORDERS, { params });
    return unwrapItems<AdminOrder>(response, 'orders');
  }

  async listCoupons(params?: QueryParams): Promise<AdminCoupon[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.COUPONS, { params });
    return unwrapItems<AdminCoupon>(response, 'coupons');
  }

  async createCoupon(payload: Partial<AdminCoupon>): Promise<AdminCoupon> {
    const response = await this.client.post(API_ENDPOINTS.ADMIN.COUPONS, payload);
    return unwrap<AdminCoupon>(response);
  }

  async updateCoupon(couponId: string, payload: Partial<AdminCoupon>): Promise<AdminCoupon> {
    const response = await this.client.patch(`${API_ENDPOINTS.ADMIN.COUPONS}/${couponId}`, payload);
    return unwrap<AdminCoupon>(response);
  }

  async deleteCoupon(couponId: string): Promise<{ deleted: boolean }> {
    const response = await this.client.delete(`${API_ENDPOINTS.ADMIN.COUPONS}/${couponId}`);
    return unwrap<{ deleted: boolean }>(response);
  }

  async listOrderItems(orderId: string): Promise<AdminOrderItem[]> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.ORDERS}/${orderId}/items`);
    return unwrapItems<AdminOrderItem>(response, 'items');
  }

  async updateOrderStatus(orderId: string, payload: { status: string; reason?: string }): Promise<AdminOrder> {
    const response = await this.client.patch(`${API_ENDPOINTS.ADMIN.ORDERS}/${orderId}/status`, payload);
    return unwrap<AdminOrder>(response);
  }

  async listPayments(params?: QueryParams): Promise<AdminPayment[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.PAYMENTS, { params });
    return unwrapItems<AdminPayment>(response, 'payments');
  }

  async getOverviewMetrics(): Promise<AdminOverviewMetrics> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.OVERVIEW);
    const payload = unwrap<{ metrics?: AdminOverviewMetrics }>(response) || {};
    return (
      payload.metrics || {
        products: 0,
        orders: 0,
        payments: 0,
        subscriptions: 0,
        tasks: 0
      }
    );
  }

  async searchUsers(params?: QueryParams): Promise<{ users: AdminUserLookup[]; pagination?: AdminListPagination }> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.USERS, { params });
    const payload = unwrap<{ users?: AdminUserLookup[]; pagination?: AdminListPagination }>(response) || {};
    return {
      users: payload.users || [],
      pagination: payload.pagination
    };
  }

  async getPendingPayments(): Promise<Record<string, unknown>> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.PAYMENTS}/pending`);
    return unwrap<Record<string, unknown>>(response);
  }

  async getPaymentMonitoring(): Promise<Record<string, unknown>> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.PAYMENTS}/monitoring`);
    return unwrap<Record<string, unknown>>(response);
  }

  async startPaymentMonitoring(): Promise<Record<string, unknown>> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.PAYMENTS}/monitoring/start`);
    return unwrap<Record<string, unknown>>(response);
  }

  async stopPaymentMonitoring(): Promise<Record<string, unknown>> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.PAYMENTS}/monitoring/stop`);
    return unwrap<Record<string, unknown>>(response);
  }

  async retryPayment(paymentId: string): Promise<Record<string, unknown>> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.PAYMENTS}/retry/${paymentId}`);
    return unwrap<Record<string, unknown>>(response);
  }

  async manualAllocateCredits(payload: {
    userId: string;
    paymentId: string;
    creditAmount: number;
    reason: string;
  }): Promise<Record<string, unknown>> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.PAYMENTS}/manual-allocate`, payload);
    return unwrap<Record<string, unknown>>(response);
  }

  async listRefunds(params?: QueryParams): Promise<AdminRefund[]> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.PAYMENTS}/refunds`, { params });
    return unwrapItems<AdminRefund>(response, 'refunds');
  }

  async listPendingRefunds(): Promise<AdminRefund[]> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.PAYMENTS}/refunds/pending`);
    return unwrapItems<AdminRefund>(response, 'refunds');
  }

  async approveRefund(refundId: string, note?: string): Promise<Record<string, unknown>> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.PAYMENTS}/refunds/${refundId}/approve`, { note });
    return unwrap<Record<string, unknown>>(response);
  }

  async rejectRefund(refundId: string, reason: string): Promise<Record<string, unknown>> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.PAYMENTS}/refunds/${refundId}/reject`, { reason });
    return unwrap<Record<string, unknown>>(response);
  }

  async manualRefund(payload: {
    userId: string;
    amount: number;
    reason: string;
    paymentId?: string;
  }): Promise<Record<string, unknown>> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.PAYMENTS}/refunds/manual`, payload);
    return unwrap<Record<string, unknown>>(response);
  }

  async getRefundStatistics(params?: QueryParams): Promise<AdminRefundStats> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.PAYMENTS}/refunds/statistics`, { params });
    return unwrap<AdminRefundStats>(response);
  }

  async listSubscriptions(params?: QueryParams): Promise<AdminSubscription[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.SUBSCRIPTIONS, { params });
    return unwrapItems<AdminSubscription>(response, 'subscriptions');
  }

  async getRenewalFulfillment(
    subscriptionId: string
  ): Promise<AdminRenewalFulfillment> {
    const response = await this.client.get(
      `${API_ENDPOINTS.ADMIN.SUBSCRIPTIONS}/${subscriptionId}/renewal-fulfillment`
    );
    return unwrap<AdminRenewalFulfillment>(response);
  }

  async updateSubscription(subscriptionId: string, payload: Partial<AdminSubscription>): Promise<AdminSubscription> {
    const response = await this.client.patch(`${API_ENDPOINTS.ADMIN.SUBSCRIPTIONS}/${subscriptionId}`, payload);
    return unwrap<AdminSubscription>(response);
  }

  async updateSubscriptionStatus(
    subscriptionId: string,
    payload: { status: string; reason: string }
  ): Promise<AdminSubscription> {
    const response = await this.client.patch(
      `${API_ENDPOINTS.ADMIN.SUBSCRIPTIONS}/${subscriptionId}/status`,
      payload
    );
    return unwrap<AdminSubscription>(response);
  }

  async updateSubscriptionCredentials(
    subscriptionId: string,
    payload: { credentials: string | null; reason?: string }
  ): Promise<AdminSubscription | null> {
    const response = await this.client.post(
      `${API_ENDPOINTS.ADMIN.SUBSCRIPTIONS}/${subscriptionId}/credentials`,
      payload
    );
    return unwrap<AdminSubscription | null>(response);
  }

  async getSubscriptionCredentials(
    subscriptionId: string
  ): Promise<{ credentials: string | null }> {
    const response = await this.client.get(
      `${API_ENDPOINTS.ADMIN.SUBSCRIPTIONS}/${subscriptionId}/credentials`
    );
    return unwrap<{ credentials: string | null }>(response);
  }

  async getSelectionCredentials(
    subscriptionId: string
  ): Promise<{ credentials: string | null }> {
    const response = await this.client.get(
      `${API_ENDPOINTS.ADMIN.SUBSCRIPTIONS}/${subscriptionId}/upgrade-selection/credentials`
    );
    return unwrap<{ credentials: string | null }>(response);
  }

  async markRenewalTaskPaid(
    taskId: string,
    payload?: { note?: string }
  ): Promise<AdminTask> {
    const response = await this.client.post(
      `${API_ENDPOINTS.ADMIN.TASKS}/${taskId}/paid`,
      payload || {}
    );
    return unwrap<AdminTask>(response);
  }

  async confirmRenewalTask(
    taskId: string,
    payload?: { note?: string }
  ): Promise<AdminTask> {
    const response = await this.client.post(
      `${API_ENDPOINTS.ADMIN.TASKS}/${taskId}/renewal/confirm`,
      payload || {}
    );
    return unwrap<AdminTask>(response);
  }

  async listCreditBalances(params?: QueryParams): Promise<AdminCreditBalance[]> {
    try {
      const response = await this.client.get(`${API_ENDPOINTS.ADMIN.CREDITS}/balances`, { params });
      return unwrapItems<AdminCreditBalance>(response, 'balances');
    } catch (error) {
      const fallback = await this.client.get('/credits/admin/balances', { params });
      return unwrapItems<AdminCreditBalance>(fallback, 'balances');
    }
  }

  async listCreditTransactions(params?: QueryParams): Promise<AdminCreditTransaction[]> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.CREDITS}/transactions`, { params });
    return unwrapItems<AdminCreditTransaction>(response, 'transactions');
  }

  async addCredits(payload: {
    userId: string;
    amount: number;
    type?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.post(`${API_ENDPOINTS.ADMIN.CREDITS}/add`, payload);
      return unwrap<Record<string, unknown>>(response);
    } catch (error) {
      const fallback = await this.client.post('/credits/admin/add', payload);
      return unwrap<Record<string, unknown>>(fallback);
    }
  }

  async withdrawCredits(payload: {
    userId: string;
    amount: number;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.post(`${API_ENDPOINTS.ADMIN.CREDITS}/withdraw`, payload);
      return unwrap<Record<string, unknown>>(response);
    } catch (error) {
      const fallback = await this.client.post('/credits/admin/withdraw', payload);
      return unwrap<Record<string, unknown>>(fallback);
    }
  }

  async listReferralRewards(params?: QueryParams): Promise<AdminReward[]> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.REWARDS}/referral`, { params });
    return unwrapItems<AdminReward>(response, 'rewards');
  }

  async listPrelaunchRewards(params?: QueryParams): Promise<AdminReward[]> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.REWARDS}/prelaunch`, { params });
    return unwrapItems<AdminReward>(response, 'rewards');
  }

  async redeemReferralReward(
    rewardId: string,
    payload: { userId: string; appliedValueCents?: number; subscriptionId?: string }
  ): Promise<Record<string, unknown>> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.REWARDS}/referral/${rewardId}/redeem`, payload);
    return unwrap<Record<string, unknown>>(response);
  }

  async redeemPrelaunchReward(
    rewardId: string,
    payload: { userId: string; appliedValueCents?: number; subscriptionId?: string }
  ): Promise<Record<string, unknown>> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.REWARDS}/prelaunch/${rewardId}/redeem`, payload);
    return unwrap<Record<string, unknown>>(response);
  }

  async listTasks(params?: QueryParams): Promise<AdminTask[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.TASKS, { params });
    return unwrapItems<AdminTask>(response, 'tasks');
  }

  async listPrelaunchRewardTasks(params?: QueryParams): Promise<AdminPrelaunchRewardTask[]> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.PRELAUNCH_REWARD_TASKS, { params });
    return unwrapItems<AdminPrelaunchRewardTask>(response, 'tasks');
  }

  async markPrelaunchRewardTaskIssue(taskId: string): Promise<AdminPrelaunchRewardTask> {
    const response = await this.client.post(
      `${API_ENDPOINTS.ADMIN.PRELAUNCH_REWARD_TASKS}/${taskId}/issue`,
      {}
    );
    return unwrap<AdminPrelaunchRewardTask>(response);
  }

  async markPrelaunchRewardTaskDelivered(taskId: string): Promise<AdminPrelaunchRewardTask> {
    const response = await this.client.post(
      `${API_ENDPOINTS.ADMIN.PRELAUNCH_REWARD_TASKS}/${taskId}/delivered`,
      {}
    );
    return unwrap<AdminPrelaunchRewardTask>(response);
  }

  async startTask(taskId: string): Promise<AdminTask> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.TASKS}/${taskId}/start`, {});
    return unwrap<AdminTask>(response);
  }

  async completeTask(taskId: string, payload?: { note?: string }): Promise<Record<string, unknown>> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.TASKS}/${taskId}/complete`, payload);
    return unwrap<Record<string, unknown>>(response);
  }

  async moveTaskToIssues(taskId: string, payload?: { note?: string }): Promise<AdminTask> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.TASKS}/${taskId}/issue`, payload);
    return unwrap<AdminTask>(response);
  }

  async moveTaskToQueue(taskId: string, payload?: { note?: string }): Promise<AdminTask> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.TASKS}/${taskId}/queue`, payload);
    return unwrap<AdminTask>(response);
  }

  async getOrderFulfillment(orderId: string): Promise<AdminOrderFulfillment> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.ORDERS}/${orderId}/fulfillment`);
    return unwrap<AdminOrderFulfillment>(response);
  }

  async previewMigration(): Promise<AdminMigrationPreview> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.MIGRATION}/preview`, {});
    return unwrap<AdminMigrationPreview>(response);
  }

  async applyMigration(): Promise<AdminMigrationResult> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.MIGRATION}/apply`, {});
    return unwrap<AdminMigrationResult>(response);
  }

  async sendAnnouncement(payload: { message: string }): Promise<AdminAnnouncementResult> {
    const response = await this.client.post(
      `${API_ENDPOINTS.ADMIN.NOTIFICATIONS}/announcements`,
      payload
    );
    return unwrap<AdminAnnouncementResult>(response);
  }

  async requestPinReset(payload: { userId: string }): Promise<AdminPinResetRequest> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.PIN_RESET}/request`, {
      user_id: payload.userId
    });
    return unwrap<AdminPinResetRequest>(response);
  }

  async confirmPinReset(payload: { userId: string; code: string }): Promise<AdminPinResetConfirm> {
    const response = await this.client.post(`${API_ENDPOINTS.ADMIN.PIN_RESET}/confirm`, {
      user_id: payload.userId,
      code: payload.code
    });
    return unwrap<AdminPinResetConfirm>(response);
  }

  async listBisInquiries(
    params?: QueryParams
  ): Promise<{ inquiries: AdminBisInquiry[]; pagination?: AdminListPagination }> {
    const response = await this.client.get(API_ENDPOINTS.ADMIN.BIS, { params });
    const payload =
      unwrap<{ inquiries?: AdminBisInquiry[]; pagination?: AdminListPagination }>(response) || {};
    return {
      inquiries: payload.inquiries || [],
      pagination: payload.pagination,
    };
  }

  async getBisInquiry(inquiryId: string): Promise<AdminBisInquiry> {
    const response = await this.client.get(`${API_ENDPOINTS.ADMIN.BIS}/${inquiryId}`);
    const payload = unwrap<{ inquiry?: AdminBisInquiry }>(response) || {};
    return payload.inquiry as AdminBisInquiry;
  }

  async updateBisInquiryStatus(
    inquiryId: string,
    status: AdminBisInquiryStatus
  ): Promise<AdminBisInquiry> {
    const response = await this.client.patch(`${API_ENDPOINTS.ADMIN.BIS}/${inquiryId}/status`, {
      status,
    });
    const payload = unwrap<{ inquiry?: AdminBisInquiry }>(response) || {};
    return payload.inquiry as AdminBisInquiry;
  }
}

export const adminService = new AdminService();
export const createAdminService = (
  customFetch: typeof fetch,
  options?: { cookie?: string }
) => {
  const headers = options?.cookie ? { Cookie: options.cookie } : undefined;
  return new AdminService(createApiClient(customFetch, headers));
};
