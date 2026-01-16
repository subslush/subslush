<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminCoupon } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let coupons: AdminCoupon[] = data.coupons || [];
  let actionMessage = '';
  let actionError = '';
  let deleteError = '';
  let deletingCouponId: string | null = null;
  let pendingDeleteCoupon: AdminCoupon | null = null;
  let showDeleteConfirm = false;
  let couponsTab: 'active' | 'newsletter' = 'active';

  const statusMap = {
    active: 'success',
    inactive: 'neutral'
  } as const;

  const NEWSLETTER_PREFIXES = ['NEWSLETTER12', 'WELCOME12'];

  const isNewsletterCoupon = (coupon: AdminCoupon): boolean => {
    const code = (coupon.code || '').toUpperCase();
    return NEWSLETTER_PREFIXES.some(prefix => code.startsWith(prefix));
  };

  type CouponForm = {
    code: string;
    percentOff: string;
    scope: 'global' | 'category' | 'product';
    status: 'active' | 'inactive';
    startsAt: string;
    endsAt: string;
    maxRedemptions: string;
    boundUserId: string;
    firstOrderOnly: boolean;
    category: string;
    productId: string;
  };

  const emptyForm = (): CouponForm => ({
    code: '',
    percentOff: '',
    scope: 'global',
    status: 'active',
    startsAt: '',
    endsAt: '',
    maxRedemptions: '',
    boundUserId: '',
    firstOrderOnly: false,
    category: '',
    productId: ''
  });

  let newCoupon = emptyForm();
  let editCouponId: string | null = null;
  let editCoupon = emptyForm();

  $: activeCoupons = coupons.filter(coupon => !isNewsletterCoupon(coupon));
  $: newsletterCoupons = coupons.filter(coupon => isNewsletterCoupon(coupon));
  $: visibleCoupons = couponsTab === 'newsletter' ? newsletterCoupons : activeCoupons;

  const resetFeedback = () => {
    actionMessage = '';
    actionError = '';
    deleteError = '';
  };

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const toDateInput = (value?: string | null): string => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const offset = parsed.getTimezoneOffset();
    const local = new Date(parsed.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const parseDateInput = (value: string): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  };

  const normalizeNumericInput = (value: string | number): string => {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (Number.isFinite(value)) {
      return String(value);
    }
    return '';
  };

  const resolveUsedRedemptions = (coupon: AdminCoupon): number => {
    const value = pickValue(coupon.redemptionsUsed, coupon.redemptions_used);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const resolveMaxRedemptions = (coupon: AdminCoupon): number | null => {
    const value = pickValue(coupon.maxRedemptions, coupon.max_redemptions);
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const resolveRemainingRedemptions = (coupon: AdminCoupon): number | null => {
    const maxRedemptions = resolveMaxRedemptions(coupon);
    if (maxRedemptions === null) return null;
    return Math.max(0, maxRedemptions - resolveUsedRedemptions(coupon));
  };

  const buildPayload = (form: CouponForm) => {
    const percentOff = Number(form.percentOff);
    const maxRedemptionsInput = normalizeNumericInput(form.maxRedemptions);
    const maxRedemptions =
      maxRedemptionsInput === '' ? null : Number(maxRedemptionsInput);
    const payload: Record<string, unknown> = {
      code: form.code.trim(),
      percent_off: percentOff,
      scope: form.scope,
      status: form.status,
      first_order_only: form.firstOrderOnly,
      starts_at: parseDateInput(form.startsAt),
      ends_at: parseDateInput(form.endsAt),
      max_redemptions: maxRedemptions,
      bound_user_id: form.boundUserId.trim() || null,
      category: form.scope === 'category' ? form.category.trim() || null : null,
      product_id: form.scope === 'product' ? form.productId.trim() || null : null
    };

    return payload;
  };

  const validateForm = (form: CouponForm): string | null => {
    if (!form.code.trim()) return 'Coupon code is required.';
    const percent = Number(form.percentOff);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return 'Percent off must be between 0 and 100.';
    }
    if (form.scope === 'category' && !form.category.trim()) {
      return 'Category is required for category-scoped coupons.';
    }
    if (form.scope === 'product' && !form.productId.trim()) {
      return 'Product ID is required for product-scoped coupons.';
    }
    return null;
  };

  const startEdit = (coupon: AdminCoupon) => {
    resetFeedback();
    editCouponId = coupon.id;
    editCoupon = {
      code: coupon.code,
      percentOff: String(pickValue(coupon.percentOff, coupon.percent_off) ?? ''),
      scope: (coupon.scope || 'global') as CouponForm['scope'],
      status: (coupon.status || 'active') as CouponForm['status'],
      startsAt: toDateInput(pickValue(coupon.startsAt, coupon.starts_at)),
      endsAt: toDateInput(pickValue(coupon.endsAt, coupon.ends_at)),
      maxRedemptions: String(pickValue(coupon.maxRedemptions, coupon.max_redemptions) ?? ''),
      boundUserId: (pickValue(coupon.boundUserId, coupon.bound_user_id) as string) || '',
      firstOrderOnly: Boolean(pickValue(coupon.firstOrderOnly, coupon.first_order_only)),
      category: (coupon.category || '').toString(),
      productId: (pickValue(coupon.productId, coupon.product_id) as string) || ''
    };
  };

  const cancelEdit = () => {
    editCouponId = null;
    editCoupon = emptyForm();
  };

  const requestDelete = (coupon: AdminCoupon) => {
    resetFeedback();
    pendingDeleteCoupon = coupon;
    showDeleteConfirm = true;
  };

  const cancelDelete = () => {
    showDeleteConfirm = false;
    pendingDeleteCoupon = null;
    deleteError = '';
  };

  const confirmDelete = async () => {
    const targetCoupon = pendingDeleteCoupon;
    if (!targetCoupon) return;
    deleteError = '';
    deletingCouponId = targetCoupon.id;
    try {
      const result = await adminService.deleteCoupon(targetCoupon.id);
      if (!result?.deleted) {
        deleteError = 'Failed to delete coupon.';
        return;
      }
      coupons = coupons.filter(coupon => coupon.id !== targetCoupon.id);
      if (editCouponId === targetCoupon.id) {
        cancelEdit();
      }
      actionMessage = 'Coupon deleted.';
      showDeleteConfirm = false;
      pendingDeleteCoupon = null;
    } catch (err) {
      deleteError = getErrorMessage(err, 'Failed to delete coupon.');
    } finally {
      deletingCouponId = null;
    }
  };

  const submitCreate = async () => {
    resetFeedback();
    const error = validateForm(newCoupon);
    if (error) {
      actionError = error;
      return;
    }

    try {
      const payload = buildPayload(newCoupon);
      const created = await adminService.createCoupon(payload);
      coupons = [created, ...coupons];
      newCoupon = emptyForm();
      actionMessage = 'Coupon created.';
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Failed to create coupon.';
    }
  };

  const submitUpdate = async () => {
    if (!editCouponId) return;
    resetFeedback();
    const error = validateForm(editCoupon);
    if (error) {
      actionError = error;
      return;
    }

    try {
      const payload = buildPayload(editCoupon);
      const updated = await adminService.updateCoupon(editCouponId, payload);
      coupons = coupons.map(coupon => (coupon.id === updated.id ? updated : coupon));
      actionMessage = 'Coupon updated.';
      cancelEdit();
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Failed to update coupon.';
    }
  };
</script>

<svelte:head>
  <title>Coupons - Admin</title>
  <meta name="description" content="Create and manage coupon codes." />
</svelte:head>

<div class="space-y-6">
  {#if showDeleteConfirm}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-gray-900">Delete coupon?</h3>
        <p class="mt-2 text-sm text-gray-600">
          This will permanently remove "{pendingDeleteCoupon?.code}". Existing order history will be preserved.
        </p>
        {#if deleteError}
          <p class="mt-3 text-sm text-red-600">{deleteError}</p>
        {/if}
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
            on:click={cancelDelete}
            disabled={deletingCouponId !== null}
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
            on:click={confirmDelete}
            disabled={deletingCouponId !== null}
          >
            {deletingCouponId ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <section>
    <h1 class="text-2xl font-bold text-gray-900">Coupons</h1>
    <p class="text-sm text-gray-600">Create percent-off coupons and control redemption rules.</p>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-900">Create coupon</h2>
      <p class="text-sm text-gray-500">Percent-only discounts</p>
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label class="text-sm font-medium text-gray-700" for="new-coupon-code">Code</label>
        <input
          id="new-coupon-code"
          class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="WELCOME10"
          bind:value={newCoupon.code}
        />
      </div>
      <div>
        <label class="text-sm font-medium text-gray-700" for="new-coupon-percent-off">Percent off</label>
        <input
          id="new-coupon-percent-off"
          class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          type="number"
          min="0"
          max="100"
          placeholder="10"
          bind:value={newCoupon.percentOff}
        />
      </div>
      <div>
        <label class="text-sm font-medium text-gray-700" for="new-coupon-scope">Scope</label>
        <select
          id="new-coupon-scope"
          class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          bind:value={newCoupon.scope}
        >
          <option value="global">Global</option>
          <option value="category">Category</option>
          <option value="product">Product</option>
        </select>
      </div>
      <div>
        <label class="text-sm font-medium text-gray-700" for="new-coupon-status">Status</label>
        <select
          id="new-coupon-status"
          class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          bind:value={newCoupon.status}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      {#if newCoupon.scope === 'category'}
        <div>
          <label class="text-sm font-medium text-gray-700" for="new-coupon-category">Category</label>
          <input
            id="new-coupon-category"
            class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="streaming"
            bind:value={newCoupon.category}
          />
        </div>
      {/if}
      {#if newCoupon.scope === 'product'}
        <div>
          <label class="text-sm font-medium text-gray-700" for="new-coupon-product-id">Product ID</label>
          <input
            id="new-coupon-product-id"
            class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="UUID"
            bind:value={newCoupon.productId}
          />
        </div>
      {/if}
      <div>
        <label class="text-sm font-medium text-gray-700" for="new-coupon-max-redemptions">Max redemptions</label>
        <input
          id="new-coupon-max-redemptions"
          class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          type="number"
          min="0"
          placeholder="Leave blank for unlimited"
          bind:value={newCoupon.maxRedemptions}
        />
      </div>
      <div>
        <label class="text-sm font-medium text-gray-700" for="new-coupon-bound-user">Bound user ID</label>
        <input
          id="new-coupon-bound-user"
          class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Optional UUID"
          bind:value={newCoupon.boundUserId}
        />
      </div>
      <div>
        <label class="text-sm font-medium text-gray-700" for="new-coupon-starts-at">Starts at</label>
        <input
          id="new-coupon-starts-at"
          class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          type="datetime-local"
          bind:value={newCoupon.startsAt}
        />
      </div>
      <div>
        <label class="text-sm font-medium text-gray-700" for="new-coupon-ends-at">Ends at</label>
        <input
          id="new-coupon-ends-at"
          class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          type="datetime-local"
          bind:value={newCoupon.endsAt}
        />
      </div>
      <div class="flex items-center gap-2">
        <input
          id="first-order-only"
          class="h-4 w-4 rounded border-gray-300 text-cyan-600"
          type="checkbox"
          bind:checked={newCoupon.firstOrderOnly}
        />
        <label class="text-sm text-gray-700" for="first-order-only">First order only</label>
      </div>
    </div>
    <button
      class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      on:click={submitCreate}
    >
      Create coupon
    </button>
  </section>

  {#if actionMessage}
    <p class="text-sm text-green-600">{actionMessage}</p>
  {/if}
  {#if actionError}
    <p class="text-sm text-red-600">{actionError}</p>
  {/if}

  {#if editCouponId}
    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">Edit coupon</h2>
        <button class="text-sm font-semibold text-gray-500" on:click={cancelEdit}>Cancel</button>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="text-sm font-medium text-gray-700" for="edit-coupon-code">Code</label>
          <input
            id="edit-coupon-code"
            class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            bind:value={editCoupon.code}
          />
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700" for="edit-coupon-percent-off">Percent off</label>
          <input
            id="edit-coupon-percent-off"
            class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            type="number"
            min="0"
            max="100"
            bind:value={editCoupon.percentOff}
          />
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700" for="edit-coupon-scope">Scope</label>
          <select
            id="edit-coupon-scope"
            class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            bind:value={editCoupon.scope}
          >
            <option value="global">Global</option>
            <option value="category">Category</option>
            <option value="product">Product</option>
          </select>
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700" for="edit-coupon-status">Status</label>
          <select
            id="edit-coupon-status"
            class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            bind:value={editCoupon.status}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {#if editCoupon.scope === 'category'}
          <div>
            <label class="text-sm font-medium text-gray-700" for="edit-coupon-category">Category</label>
            <input
              id="edit-coupon-category"
              class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              bind:value={editCoupon.category}
            />
          </div>
        {/if}
        {#if editCoupon.scope === 'product'}
          <div>
            <label class="text-sm font-medium text-gray-700" for="edit-coupon-product-id">Product ID</label>
            <input
              id="edit-coupon-product-id"
              class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              bind:value={editCoupon.productId}
            />
          </div>
        {/if}
        <div>
          <label class="text-sm font-medium text-gray-700" for="edit-coupon-max-redemptions">Max redemptions</label>
          <input
            id="edit-coupon-max-redemptions"
            class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            type="number"
            min="0"
            bind:value={editCoupon.maxRedemptions}
          />
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700" for="edit-coupon-bound-user">Bound user ID</label>
          <input
            id="edit-coupon-bound-user"
            class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            bind:value={editCoupon.boundUserId}
          />
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700" for="edit-coupon-starts-at">Starts at</label>
          <input
            id="edit-coupon-starts-at"
            class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            type="datetime-local"
            bind:value={editCoupon.startsAt}
          />
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700" for="edit-coupon-ends-at">Ends at</label>
          <input
            id="edit-coupon-ends-at"
            class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            type="datetime-local"
            bind:value={editCoupon.endsAt}
          />
        </div>
        <div class="flex items-center gap-2">
          <input
            id="edit-first-order-only"
            class="h-4 w-4 rounded border-gray-300 text-cyan-600"
            type="checkbox"
            bind:checked={editCoupon.firstOrderOnly}
          />
          <label class="text-sm text-gray-700" for="edit-first-order-only">First order only</label>
        </div>
      </div>
      <button
        class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        on:click={submitUpdate}
      >
        Save changes
      </button>
    </section>
  {/if}

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div class="flex flex-wrap items-center gap-2">
        <button
          class={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
            couponsTab === 'active'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          type="button"
          on:click={() => (couponsTab = 'active')}
        >
          Active coupons ({activeCoupons.length})
        </button>
        <button
          class={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
            couponsTab === 'newsletter'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          type="button"
          on:click={() => (couponsTab = 'newsletter')}
        >
          Newsletter coupons ({newsletterCoupons.length})
        </button>
      </div>
      <p class="text-sm text-gray-500">{visibleCoupons.length} total</p>
    </div>
    {#if visibleCoupons.length === 0}
      <AdminEmptyState
        title={couponsTab === 'newsletter' ? 'No newsletter coupons' : 'No coupons'}
        message={
          couponsTab === 'newsletter'
            ? 'Newsletter coupons will appear here once generated.'
            : 'Create your first coupon to get started.'
        }
      />
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="py-2">Code</th>
              <th class="py-2">Percent</th>
              <th class="py-2">Scope</th>
              <th class="py-2">Status</th>
              <th class="py-2">Window</th>
              <th class="py-2">Limits</th>
              <th class="py-2">Used</th>
              <th class="py-2">Bound user</th>
              <th class="py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each visibleCoupons as coupon}
              {@const usedRedemptions = resolveUsedRedemptions(coupon)}
              {@const maxRedemptions = resolveMaxRedemptions(coupon)}
              {@const remainingRedemptions = resolveRemainingRedemptions(coupon)}
              <tr>
                <td class="py-3 font-semibold text-gray-900">{coupon.code}</td>
                <td class="py-3 text-gray-600">
                  {pickValue(coupon.percentOff, coupon.percent_off) ?? '--'}%
                </td>
                <td class="py-3 text-gray-600">
                  {coupon.scope}
                  {#if coupon.scope === 'category'}
                    <div class="text-xs text-gray-400">{coupon.category || '--'}</div>
                  {:else if coupon.scope === 'product'}
                    <div class="text-xs text-gray-400">{coupon.product_id || '--'}</div>
                  {/if}
                </td>
                <td class="py-3">
                  <StatusBadge
                    label={(coupon.status || 'inactive').toString()}
                    tone={statusToneFromMap(coupon.status, statusMap)}
                  />
                </td>
                <td class="py-3 text-gray-600">
                  <div>Starts {formatOptionalDate(pickValue(coupon.startsAt, coupon.starts_at))}</div>
                  <div>Ends {formatOptionalDate(pickValue(coupon.endsAt, coupon.ends_at))}</div>
                </td>
                <td class="py-3 text-gray-600">
                  <div>Max {pickValue(coupon.maxRedemptions, coupon.max_redemptions) ?? '—'}</div>
                  <div>First order {pickValue(coupon.firstOrderOnly, coupon.first_order_only) ? 'Yes' : 'No'}</div>
                </td>
                <td class="py-3 text-gray-600">
                  {#if maxRedemptions !== null}
                    {usedRedemptions}
                    (
                    {#if remainingRedemptions === 0}
                      <span class="text-red-600">No redemptions left</span>
                    {:else}
                      {remainingRedemptions} left redemptions
                    {/if}
                    )
                  {:else}
                    {usedRedemptions}
                  {/if}
                </td>
                <td class="py-3 text-gray-600">
                  {pickValue(coupon.boundUserId, coupon.bound_user_id) || '--'}
                </td>
                <td class="py-3">
                  <div class="flex flex-col gap-2">
                    <button
                      class="text-xs font-semibold text-cyan-600"
                      on:click={() => startEdit(coupon)}
                    >
                      Edit
                    </button>
                    <button
                      class="text-xs font-semibold text-red-600"
                      on:click={() => requestDelete(coupon)}
                      disabled={deletingCouponId === coupon.id}
                    >
                      {deletingCouponId === coupon.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
