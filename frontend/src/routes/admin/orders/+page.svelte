<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatCents, formatOptionalDate, getBooleanLabel, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminOrder, AdminOrderItem } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let orders: AdminOrder[] = data.orders;
  let loading = false;
  let errorMessage = '';
  let statusMessage = '';

  let orderItems: Record<string, AdminOrderItem[]> = {};
  let orderItemsLoading: Record<string, boolean> = {};
  let orderItemsError: Record<string, string> = {};

  let filters = {
    status: '',
    provider: '',
    query: ''
  };

  let statusUpdateOrderId: string | null = null;
  let statusUpdate = {
    status: '',
    reason: ''
  };

  let viewItemsOrderId: string | null = null;

  const orderStatusMap = {
    paid: 'success',
    delivered: 'success',
    pending_payment: 'warning',
    in_process: 'info',
    cancelled: 'danger',
    cart: 'neutral'
  } as const;

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const fetchOrders = async () => {
    loading = true;
    errorMessage = '';
    try {
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      if (filters.provider) params.payment_provider = filters.provider;
      if (filters.query) params.search = filters.query;
      orders = await adminService.listOrders(params);
    } catch (error) {
      errorMessage = getErrorMessage(error, 'Failed to load orders.');
    } finally {
      loading = false;
    }
  };

  const startStatusUpdate = (order: AdminOrder) => {
    statusMessage = '';
    statusUpdateOrderId = order.id;
    statusUpdate = {
      status: (order.status || '').toString(),
      reason: ''
    };
  };

  const submitStatusUpdate = async () => {
    if (!statusUpdateOrderId || !statusUpdate.status) return;
    statusMessage = '';
    try {
      const updated = await adminService.updateOrderStatus(statusUpdateOrderId, {
        status: statusUpdate.status,
        reason: statusUpdate.reason || undefined
      });
      orders = orders.map(order => (order.id === statusUpdateOrderId ? { ...order, ...updated } : order));
      statusMessage = 'Order status updated.';
      statusUpdateOrderId = null;
    } catch (error) {
      statusMessage = getErrorMessage(error, 'Failed to update order.');
    }
  };

  const toggleOrderItems = async (orderId: string) => {
    if (viewItemsOrderId === orderId) {
      viewItemsOrderId = null;
      return;
    }

    viewItemsOrderId = orderId;

    if (orderItems[orderId]) {
      return;
    }

    orderItemsLoading = { ...orderItemsLoading, [orderId]: true };
    orderItemsError = { ...orderItemsError, [orderId]: '' };

    try {
      const items = await adminService.listOrderItems(orderId);
      orderItems = { ...orderItems, [orderId]: items };
    } catch (error) {
      orderItemsError = {
        ...orderItemsError,
        [orderId]: getErrorMessage(error, 'Failed to load order items.')
      };
    } finally {
      orderItemsLoading = { ...orderItemsLoading, [orderId]: false };
    }
  };

  const getProductLabel = (item: AdminOrderItem): string => {
    const productName = pickValue(item.productName, item.product_name) as string | undefined;
    return productName || (item.description as string) || 'Item';
  };

  const getVariantLabel = (item: AdminOrderItem): string => {
    const variantName = pickValue(item.variantName, item.variant_name) as string | undefined;
    if (variantName) return variantName;
    return (pickValue(item.productVariantId, item.product_variant_id) as string) || '--';
  };
</script>

<svelte:head>
  <title>Orders - Admin</title>
  <meta name="description" content="Review and manage order lifecycle statuses." />
</svelte:head>

<div class="space-y-6">
  <section>
    <h1 class="text-2xl font-bold text-gray-900">Orders</h1>
    <p class="text-sm text-gray-600">Track order lifecycle, payment linkage, and fulfillment updates.</p>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div class="grid gap-3 md:grid-cols-4">
      <input
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Search order or user"
        bind:value={filters.query}
      />
      <select class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" bind:value={filters.status}>
        <option value="">All statuses</option>
        <option value="pending_payment">Pending payment</option>
        <option value="paid">Paid</option>
        <option value="in_process">In process</option>
        <option value="delivered">Delivered</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <input
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Payment provider"
        bind:value={filters.provider}
      />
      <button
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        on:click={fetchOrders}
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Apply Filters'}
      </button>
    </div>
    {#if errorMessage}
      <p class="text-sm text-red-600">{errorMessage}</p>
    {/if}
    {#if statusMessage}
      <p class="text-sm text-green-600">{statusMessage}</p>
    {/if}
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Order List</h2>
      <p class="text-sm text-gray-500">{orders.length} orders</p>
    </div>

    {#if orders.length === 0}
      <AdminEmptyState title="No orders found" message="Orders will appear here after checkout." />
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="py-2">Order</th>
              <th class="py-2">User</th>
              <th class="py-2">Total</th>
              <th class="py-2">Payment</th>
              <th class="py-2">Status</th>
              <th class="py-2">Created</th>
              <th class="py-2">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each orders as order}
              <tr>
                <td class="py-3 font-semibold text-gray-900">{order.id}</td>
                <td class="py-3 text-gray-600">{pickValue(order.userId, order.user_id) || '--'}</td>
                <td class="py-3 text-gray-600">
                  {formatCents(pickValue(order.totalCents, order.total_cents), pickValue(order.currency, order.currency) || 'USD')}
                </td>
                <td class="py-3 text-gray-600">
                  {pickValue(order.paymentProvider, order.payment_provider) || '--'}
                  <div class="text-xs text-gray-400">{pickValue(order.paymentReference, order.payment_reference) || ''}</div>
                </td>
                <td class="py-3">
                  <StatusBadge
                    label={(order.status || 'unknown').toString()}
                    tone={statusToneFromMap(order.status, orderStatusMap)}
                  />
                </td>
                <td class="py-3 text-gray-600">{formatOptionalDate(pickValue(order.createdAt, order.created_at))}</td>
                <td class="py-3">
                  <button
                    class="text-cyan-600 font-semibold text-xs"
                    on:click={() => startStatusUpdate(order)}
                  >
                    Update status
                  </button>
                  <a
                    class="ml-3 text-cyan-600 font-semibold text-xs"
                    href={`/admin/orders/${order.id}/fulfillment`}
                  >
                    Fulfill
                  </a>
                  <button
                    class="ml-3 text-gray-600 font-semibold text-xs"
                    on:click={() => toggleOrderItems(order.id)}
                  >
                    {viewItemsOrderId === order.id ? 'Hide items' : 'View items'}
                  </button>
                </td>
              </tr>
              {#if statusUpdateOrderId === order.id}
                <tr class="bg-gray-50">
                  <td colspan="7" class="py-3">
                    <div class="grid gap-3 md:grid-cols-3">
                      <select
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        bind:value={statusUpdate.status}
                      >
                        <option value="">Select status</option>
                        <option value="pending_payment">Pending payment</option>
                        <option value="paid">Paid</option>
                        <option value="in_process">In process</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <input
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="Reason (optional)"
                        bind:value={statusUpdate.reason}
                      />
                      <div class="flex gap-2">
                        <button
                          class="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
                          on:click={submitStatusUpdate}
                        >
                          Save
                        </button>
                        <button
                          class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
                          on:click={() => (statusUpdateOrderId = null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              {/if}
              {#if viewItemsOrderId === order.id}
                <tr class="bg-gray-50">
                  <td colspan="7" class="py-3">
                    {#if orderItemsLoading[order.id]}
                      <p class="text-sm text-gray-500">Loading items...</p>
                    {:else if orderItemsError[order.id]}
                      <p class="text-sm text-red-600">{orderItemsError[order.id]}</p>
                    {:else if (orderItems[order.id] || []).length === 0}
                      <AdminEmptyState title="No items" message="No order items were found." />
                    {:else}
                      <div class="overflow-x-auto">
                        <table class="min-w-full text-sm">
                          <thead class="text-left text-xs uppercase text-gray-500">
                            <tr>
                              <th class="py-2">Product</th>
                              <th class="py-2">Variant</th>
                              <th class="py-2">Qty</th>
                              <th class="py-2">Unit Price</th>
                              <th class="py-2">Total</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-gray-100">
                            {#each orderItems[order.id] as item}
                              <tr>
                                <td class="py-3 font-semibold text-gray-900">{getProductLabel(item)}</td>
                                <td class="py-3 text-gray-600">{getVariantLabel(item)}</td>
                                <td class="py-3 text-gray-600">{item.quantity ?? 0}</td>
                                <td class="py-3 text-gray-600">
                                  {formatCents(
                                    pickValue(item.unitPriceCents, item.unit_price_cents),
                                    pickValue(item.currency, item.currency) || 'USD'
                                  )}
                                </td>
                                <td class="py-3 text-gray-600">
                                  {formatCents(
                                    pickValue(item.totalPriceCents, item.total_price_cents),
                                    pickValue(item.currency, item.currency) || 'USD'
                                  )}
                                </td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {/if}
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <h2 class="text-lg font-semibold text-gray-900">Operational Notes</h2>
    <p class="text-sm text-gray-600 mt-2">
      Paid with credits: {getBooleanLabel(orders.some(order => pickValue(order.paidWithCredits, order.paid_with_credits)))}
    </p>
  </section>
</div>
