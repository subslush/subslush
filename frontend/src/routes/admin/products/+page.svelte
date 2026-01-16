<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import { SUPPORTED_CURRENCIES } from '$lib/utils/currency.js';
  import type { AdminProduct, AdminProductLabel } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let products: AdminProduct[] = data.products;

  let productMessage = '';
  let productError = '';
  let productSaving = false;

  let labelMessage = '';
  let labelError = '';
  let labelSaving = false;

  let newProduct = {
    name: '',
    slug: '',
    serviceType: '',
    status: 'inactive',
    description: '',
    defaultCurrency: ''
  };

  let newLabel: Partial<AdminProductLabel> = {
    name: '',
    slug: '',
    color: '#F06292',
    description: ''
  };

  const productStatusMap = {
    active: 'success',
    inactive: 'danger'
  } as const;

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const resetMessages = () => {
    productMessage = '';
    productError = '';
    labelMessage = '';
    labelError = '';
  };

  const handleCreateProduct = async () => {
    resetMessages();
    productSaving = true;
    try {
      const created = await adminService.createProduct({
        name: newProduct.name,
        slug: newProduct.slug,
        description: newProduct.description || undefined,
        service_type: newProduct.serviceType || undefined,
        default_currency: newProduct.defaultCurrency || undefined,
        status: newProduct.status as 'active' | 'inactive'
      });
      products = [created, ...products];
      newProduct = {
        name: '',
        slug: '',
        serviceType: '',
        status: 'inactive',
        description: '',
        defaultCurrency: ''
      };
      productMessage = 'Product created successfully.';
    } catch (error) {
      productError = getErrorMessage(error, 'Failed to create product.');
    } finally {
      productSaving = false;
    }
  };

  const handleCreateLabel = async () => {
    resetMessages();
    labelSaving = true;
    try {
      await adminService.createLabel({
        name: newLabel.name,
        slug: newLabel.slug,
        description: newLabel.description || undefined,
        color: newLabel.color || undefined
      });
      newLabel = { name: '', slug: '', color: '#F06292', description: '' };
      labelMessage = 'Label created successfully.';
    } catch (error) {
      labelError = getErrorMessage(error, 'Failed to create label.');
    } finally {
      labelSaving = false;
    }
  };
</script>

<svelte:head>
  <title>Products - Admin</title>
  <meta name="description" content="Create products and labels, then manage product details from the product page." />
</svelte:head>

<div class="space-y-8">
  <section class="flex flex-col gap-2">
    <h1 class="text-2xl font-bold text-gray-900">Catalog Management</h1>
    <p class="text-sm text-gray-600">Create products and labels, then edit each product for variants, media, and pricing.</p>
  </section>

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Create Product</h2>
      <p class="text-sm text-gray-500 mb-4">Add a new product entry for your service catalog.</p>
      <form class="space-y-3" on:submit|preventDefault={handleCreateProduct}>
        <div class="grid gap-3 md:grid-cols-2">
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Product name"
            bind:value={newProduct.name}
            required
          />
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Slug (URL friendly name, unique)"
            bind:value={newProduct.slug}
            required
          />
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Service type (e.g. spotify, netflix)"
            bind:value={newProduct.serviceType}
          />
          <select class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" bind:value={newProduct.status}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <select
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          bind:value={newProduct.defaultCurrency}
        >
          <option value="">Default currency</option>
          {#each SUPPORTED_CURRENCIES as currencyOption}
            <option value={currencyOption}>{currencyOption}</option>
          {/each}
        </select>
        <textarea
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          rows={3}
          placeholder="Description"
          bind:value={newProduct.description}
        ></textarea>
        {#if productMessage}
          <p class="text-sm text-green-600">{productMessage}</p>
        {/if}
        {#if productError}
          <p class="text-sm text-red-600">{productError}</p>
        {/if}
        <button
          class="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white"
          type="submit"
          disabled={productSaving}
        >
          {productSaving ? 'Saving...' : 'Create Product'}
        </button>
      </form>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Create Label</h2>
      <p class="text-sm text-gray-500 mb-4">Add labels for merchandising and segmentation.</p>
      <form class="space-y-3" on:submit|preventDefault={handleCreateLabel}>
        <div class="grid gap-3 md:grid-cols-2">
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Label name"
            bind:value={newLabel.name}
            required
          />
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Slug (URL friendly name)"
            bind:value={newLabel.slug}
            required
          />
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            type="color"
            bind:value={newLabel.color}
          />
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Description"
            bind:value={newLabel.description}
          />
        </div>
        {#if labelMessage}
          <p class="text-sm text-green-600">{labelMessage}</p>
        {/if}
        {#if labelError}
          <p class="text-sm text-red-600">{labelError}</p>
        {/if}
        <button
          class="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900"
          type="submit"
          disabled={labelSaving}
        >
          {labelSaving ? 'Saving...' : 'Create Label'}
        </button>
      </form>
    </div>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Products</h2>
        <p class="text-sm text-gray-500">Open a product to manage variants, media, and pricing.</p>
      </div>
      <p class="text-sm text-gray-500">{products.length} total</p>
    </div>
    {#if products.length === 0}
      <AdminEmptyState title="No products" message="Create your first product to populate the catalog." />
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="py-2">Name</th>
              <th class="py-2">Service</th>
              <th class="py-2">Status</th>
              <th class="py-2">Updated</th>
              <th class="py-2">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each products as product}
              <tr>
                <td class="py-3 font-semibold text-gray-900">
                  {product.name}
                  <div class="text-xs text-gray-500">{product.slug}</div>
                </td>
                <td class="py-3 text-gray-600">{pickValue(product.serviceType, product.service_type) || '--'}</td>
                <td class="py-3">
                  <StatusBadge
                    label={(product.status || 'inactive').toString()}
                    tone={statusToneFromMap(product.status || 'inactive', productStatusMap)}
                  />
                </td>
                <td class="py-3 text-gray-600">{formatOptionalDate(pickValue(product.updatedAt, product.updated_at))}</td>
                <td class="py-3">
                  <a
                    class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-900 hover:border-gray-300"
                    href={`/admin/products/${product.id}`}
                  >
                    Edit
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
