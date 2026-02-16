<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { Receipt } from 'lucide-svelte';
  import { ordersService } from '$lib/api/orders.js';
  import type { PageData } from './$types';
  import type { OrderItem, OrderListItem } from '$lib/types/order.js';

  export let data: PageData;

  let orders: OrderListItem[] = data.orders;
  let pagination = data.pagination;

  $: orders = data.orders;
  $: pagination = data.pagination;

  function formatDate(value?: string | null): string {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatAmount(order: OrderListItem): string {
    const amountCents =
      order.display_total_cents ?? order.total_cents ?? order.subtotal_cents ?? 0;
    const currency = order.display_currency || order.currency || 'USD';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase()
      }).format(amountCents / 100);
    } catch {
      return `$${(amountCents / 100).toFixed(2)}`;
    }
  }

  function formatServiceLabel(value: string): string {
    return value
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function formatDurationLabel(termMonths?: number | null): string {
    const normalized =
      termMonths !== null && termMonths !== undefined ? Number(termMonths) : null;
    if (!normalized || !Number.isFinite(normalized) || normalized <= 0) return '';
    const months = Math.floor(normalized);
    return `(${months} month${months === 1 ? '' : 's'})`;
  }

  function stripOrderPrefix(label: string): string {
    return label
      .replace(/^subscription\s+purchase\s*[:\-–—]\s*/i, '')
      .replace(/^subscription\s*[:\-–—]\s*/i, '')
      .trim();
  }

  function formatOrderItemLabel(item: OrderItem | undefined, serviceType?: string): string {
    const productName = item?.product_name?.trim() || '';
    const variantName = item?.variant_name?.trim() || '';
    if (productName || variantName) {
      const baseLabel =
        productName && variantName
          ? variantName.toLowerCase().startsWith(productName.toLowerCase())
            ? variantName
            : `${productName} ${variantName}`
          : productName || variantName;
      const durationLabel = formatDurationLabel(item?.term_months ?? null);
      return durationLabel ? `${baseLabel} ${durationLabel}` : baseLabel;
    }

    const description = item?.description ? stripOrderPrefix(item.description) : '';
    if (description) {
      return description;
    }

    return serviceType ? formatServiceLabel(serviceType) : '';
  }

  function getOrderItemsSummary(order: OrderListItem): string[] {
    const metadata = order.metadata && typeof order.metadata === 'object'
      ? (order.metadata as Record<string, unknown>)
      : null;
    const serviceType = metadata && typeof metadata.service_type === 'string'
      ? metadata.service_type
      : undefined;
    if (order.items && order.items.length > 0) {
      const labels = order.items
        .map(item => formatOrderItemLabel(item, serviceType))
        .filter(label => label.length > 0);
      if (labels.length > 0) return labels;
    }

    if (serviceType) {
      return [formatServiceLabel(serviceType)];
    }
    return [`Order ${order.id.slice(0, 8)}`];
  }

  function statusLabel(status: string): string {
    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function updatePage(nextPage: number) {
    const params = new URLSearchParams();
    params.set('page', `${nextPage}`);
    params.set('limit', `${pagination.limit}`);
    if (data.filters.status) params.set('status', data.filters.status);
    if (data.filters.paymentProvider) params.set('payment_provider', data.filters.paymentProvider);
    goto(`/dashboard/orders?${params.toString()}`);
  }

  onMount(() => {
    let isActive = true;

    const refreshOrders = async () => {
      try {
        const currentPage = data.page || 1;
        const limit = pagination.limit || 10;
        const offset = (currentPage - 1) * limit;
        const params = {
          limit,
          offset,
          include_items: true,
          status: data.filters.status || undefined,
          payment_provider: data.filters.paymentProvider || undefined
        };
        const result = await ordersService.listOrders(params);
        if (!isActive) return;
        orders = result.orders || [];
        pagination = result.pagination || pagination;
      } catch (error) {
        console.warn('Failed to refresh orders:', error);
      }
    };

    void refreshOrders();

    return () => {
      isActive = false;
    };
  });
</script>

<svelte:head>
  <title>Orders - SubSlush</title>
  <meta name="description" content="Review your recent subscription orders." />
</svelte:head>

<section class="space-y-4">
  <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-gray-900">Orders</h1>
        <p class="text-sm text-gray-600 mt-1">View purchases and payment method details.</p>
      </div>
      {#if orders.length > 0}
        <a
          href="/browse"
          class="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
        >
          Go shopping
        </a>
      {/if}
    </div>
  </div>

  {#if data.error}
    <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {data.error}
    </div>
  {/if}

  {#if orders.length === 0}
    <div class="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
      <div class="mx-auto mb-3 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
        <Receipt size={18} class="text-gray-500" />
      </div>
      <p class="text-sm font-medium text-gray-900">No orders yet.</p>
      <p class="text-sm text-gray-600 mt-1">Your completed orders will appear here.</p>
      <a
        href="/browse"
        class="mt-4 inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
      >
        Go shopping
      </a>
    </div>
  {:else}
    <div class="space-y-3">
      {#each orders as order}
        <div class="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div class="flex items-start justify-between gap-6">
            <div class="min-w-0">
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Items</p>
              <div class="mt-1 space-y-1">
                {#each getOrderItemsSummary(order) as itemLabel}
                  <p class="text-sm font-medium text-gray-900">{itemLabel}</p>
                {/each}
              </div>
              <p class="mt-1 text-xs text-gray-500">Order {order.id.slice(0, 8)}</p>
              <div class="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-600 sm:grid-cols-3">
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-gray-400">Status</p>
                  <p class="text-sm font-medium text-gray-700">{statusLabel(order.status)}</p>
                </div>
                {#if order.payment_method_badge}
                  <div>
                    <p class="text-[11px] uppercase tracking-wide text-gray-400">Payment</p>
                    <p class="text-sm font-medium text-gray-700">{order.payment_method_badge.label}</p>
                  </div>
                {/if}
              </div>
            </div>
            <div class="text-right">
              <p class="text-lg font-semibold text-gray-900">{formatAmount(order)}</p>
              <p class="text-xs text-gray-500 mt-1">Total</p>
              <p class="text-xs text-gray-500 mt-3">{formatDate(order.created_at)}</p>
            </div>
          </div>
        </div>
      {/each}
    </div>

    {#if pagination.total > pagination.limit}
      <div class="flex items-center justify-between mt-4">
        <button
          on:click={() => updatePage(data.page - 1)}
          class="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          disabled={data.page <= 1}
        >
          Previous
        </button>
        <p class="text-xs text-gray-500">Page {data.page}</p>
        <button
          on:click={() => updatePage(data.page + 1)}
          class="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          disabled={!pagination.hasMore}
        >
          Next
        </button>
      </div>
    {/if}
  {/if}
</section>
