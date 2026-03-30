<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import { renderRichTextWithBullets } from '$lib/utils/richText.js';
  import type { AdminProduct, AdminProductSubCategory } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  const subCategory = data.subCategory as AdminProductSubCategory;
  let products: AdminProduct[] = Array.isArray(data.products) ? data.products : [];

  let productMessage = '';
  let productError = '';
  let productSaving = false;

  let newProduct = {
    name: '',
    slug: '',
    serviceType: '',
    description: '',
    fixedPriceCents: '',
    fixedPriceCurrency: '',
    comparisonPriceCents: ''
  };
  let descriptionPreviewHtml = '';
  $: descriptionPreviewHtml = renderRichTextWithBullets(
    newProduct.description || ''
  );

  const productStatusMap = {
    active: 'success',
    inactive: 'danger'
  } as const;

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const resetMessages = () => {
    productMessage = '';
    productError = '';
  };

  const handleCreateProduct = async () => {
    resetMessages();
    productSaving = true;

    try {
      const fixedPriceCentsRaw = String(newProduct.fixedPriceCents ?? '').trim();
      const fixedPriceCurrencyRaw = String(
        newProduct.fixedPriceCurrency ?? ''
      ).trim();
      const hasAnyFixedField =
        fixedPriceCentsRaw !== '' ||
        fixedPriceCurrencyRaw !== '';
      const hasCompleteFixedPricing =
        fixedPriceCentsRaw !== '' &&
        fixedPriceCurrencyRaw !== '';

      if (hasAnyFixedField && !hasCompleteFixedPricing) {
        productError =
          'To use fixed catalog pricing, provide fixed price cents and currency together.';
        return;
      }

      const parsedFixedPriceCents =
        fixedPriceCentsRaw === '' ? undefined : Number(fixedPriceCentsRaw);
      const comparisonPriceCentsRaw = String(
        newProduct.comparisonPriceCents ?? ''
      ).trim();
      const parsedComparisonPriceCents =
        comparisonPriceCentsRaw === '' ? undefined : Number(comparisonPriceCentsRaw);

      if (
        parsedFixedPriceCents !== undefined &&
        (!Number.isInteger(parsedFixedPriceCents) || parsedFixedPriceCents < 0)
      ) {
        productError = 'Fixed price cents must be a non-negative integer.';
        return;
      }
      if (
        parsedComparisonPriceCents !== undefined &&
        (!Number.isInteger(parsedComparisonPriceCents) ||
          parsedComparisonPriceCents < 0)
      ) {
        productError =
          'Comparison price cents must be a non-negative integer.';
        return;
      }

      const metadata: Record<string, unknown> = {};
      if (parsedComparisonPriceCents !== undefined) {
        metadata.comparison_price_cents = parsedComparisonPriceCents;
      }
      const categoryValues = Array.from(
        new Map(
          String(subCategory.category || '')
            .split(',')
            .map(entry => entry.trim())
            .filter(entry => entry.length > 0)
            .map(entry => [entry.toLowerCase(), entry] as const)
        ).values()
      );

      const created = await adminService.createProduct({
        name: newProduct.name,
        slug: newProduct.slug,
        description: newProduct.description || undefined,
        service_type: newProduct.serviceType || undefined,
        categories: categoryValues,
        category: categoryValues[0] || subCategory.category,
        sub_category: subCategory.name,
        duration_months: hasCompleteFixedPricing ? 1 : undefined,
        fixed_price_cents: hasCompleteFixedPricing
          ? parsedFixedPriceCents
          : undefined,
        fixed_price_currency: hasCompleteFixedPricing
          ? fixedPriceCurrencyRaw.toUpperCase()
          : undefined,
        status: 'inactive',
        ...(Object.keys(metadata).length > 0 ? { metadata } : {})
      });

      products = [created, ...products];
      newProduct = {
        name: '',
        slug: '',
        serviceType: '',
        description: '',
        fixedPriceCents: '',
        fixedPriceCurrency: '',
        comparisonPriceCents: ''
      };
      productMessage = 'Product created successfully.';
    } catch (error) {
      productError = getErrorMessage(error, 'Failed to create product.');
    } finally {
      productSaving = false;
    }
  };
</script>

<svelte:head>
  <title>{subCategory.name} Products - Admin</title>
  <meta
    name="description"
    content="Create and manage products scoped to this sub-category."
  />
</svelte:head>

<div class="space-y-8">
  <section class="flex flex-col gap-2">
    <a class="text-sm font-semibold text-cyan-600" href="/admin/products">Back to sub-categories</a>
    <h1 class="text-2xl font-bold text-gray-900">{subCategory.name}</h1>
    <p class="text-sm text-gray-600">
      Category: <span class="font-semibold text-gray-900">{subCategory.category}</span>
    </p>
    <p class="text-xs text-gray-500">Workspace URL slug: {subCategory.slug}</p>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <h2 class="text-lg font-semibold text-gray-900">Create Product</h2>
    <p class="text-sm text-gray-500 mb-4">
      Products created here are automatically assigned to <span class="font-semibold">{subCategory.name}</span>.
    </p>
    <p class="text-xs text-gray-500 mb-3">
      New products are created as <span class="font-semibold">inactive</span> and can be activated after pricing setup.
    </p>
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
      <div class="grid gap-3 md:grid-cols-1">
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Service type (e.g. spotify, netflix)"
          bind:value={newProduct.serviceType}
        />
      </div>
      <textarea
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        rows={3}
        placeholder="Description"
        bind:value={newProduct.description}
      ></textarea>
      <p class="mt-1 text-[11px] text-gray-500">
        Use <code>**text**</code> for bold. Start a new line with <code>- </code>, <code>* </code>, or <code>• </code> for bullet points.
      </p>
      {#if newProduct.description.trim().length > 0}
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Description preview</p>
          <div class="mt-2 text-sm leading-relaxed text-gray-700 space-y-2">
            {@html descriptionPreviewHtml}
          </div>
        </div>
      {/if}

      <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p class="text-xs font-semibold text-gray-700">Fixed Catalog Fields (optional)</p>
        <p class="mt-1 text-xs text-gray-500">
          Set fixed price cents and currency for unique products without variants. Duration defaults to 1 month.
        </p>
        <div class="mt-2 grid gap-3 md:grid-cols-3">
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            type="number"
            min="0"
            step="1"
            placeholder="Fixed price cents"
            bind:value={newProduct.fixedPriceCents}
          />
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Currency (e.g. USD)"
            bind:value={newProduct.fixedPriceCurrency}
          />
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            type="number"
            min="0"
            step="1"
            placeholder="Comparison price cents (optional)"
            bind:value={newProduct.comparisonPriceCents}
          />
        </div>
      </div>

      {#if productMessage}
        <p class="text-sm text-green-600">{productMessage}</p>
      {/if}
      {#if productError}
        <p class="text-sm text-red-600">{productError}</p>
      {/if}

      <button
        class="w-full rounded-lg bg-gradient-to-r from-purple-700 to-pink-600 px-4 py-2 text-sm font-semibold text-white"
        type="submit"
        disabled={productSaving}
      >
        {productSaving ? 'Saving...' : 'Create Product'}
      </button>
    </form>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Products</h2>
        <p class="text-sm text-gray-500">Products currently assigned to this sub-category.</p>
      </div>
      <p class="text-sm text-gray-500">{products.length} total</p>
    </div>

    {#if products.length === 0}
      <AdminEmptyState
        title="No products"
        message="Create your first product in this sub-category."
      />
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
                <td class="py-3 text-gray-600">
                  {pickValue(product.serviceType, product.service_type) || '--'}
                </td>
                <td class="py-3">
                  <StatusBadge
                    label={(product.status || 'inactive').toString()}
                    tone={statusToneFromMap(product.status || 'inactive', productStatusMap)}
                  />
                </td>
                <td class="py-3 text-gray-600">
                  {formatOptionalDate(pickValue(product.updatedAt, product.updated_at))}
                </td>
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
