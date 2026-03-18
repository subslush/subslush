<script lang="ts">
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, pickValue } from '$lib/utils/admin.js';
  import type {
    AdminProductLabel,
    AdminProductSubCategory
  } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let subCategories: AdminProductSubCategory[] = Array.isArray(data.subCategories)
    ? data.subCategories
    : [];

  let saving = false;
  let message = '';
  let error = '';
  let labelSaving = false;
  let labelMessage = '';
  let labelError = '';

  let form = {
    category: '',
    name: '',
    slug: ''
  };
  let newLabel: Partial<AdminProductLabel> = {
    name: '',
    slug: '',
    color: '#DB2777',
    description: ''
  };

  const getErrorMessage = (value: unknown, fallback: string): string =>
    value instanceof Error ? value.message : fallback;

  const normalizeSlugInput = (value: string): string =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const sortSubCategories = (items: AdminProductSubCategory[]) =>
    [...items].sort((a, b) => {
      const categoryA = (a.category || '').toLowerCase();
      const categoryB = (b.category || '').toLowerCase();
      if (categoryA !== categoryB) return categoryA.localeCompare(categoryB);
      return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
    });

  const handleCreateSubCategory = async () => {
    message = '';
    error = '';
    saving = true;

    try {
      const category = form.category.trim();
      const name = form.name.trim();
      const slug = form.slug.trim();

      if (!category || !name) {
        error = 'Category and sub-category name are required.';
        return;
      }

      const created = await adminService.createProductSubCategory({
        category,
        name,
        ...(slug ? { slug: normalizeSlugInput(slug) } : {})
      });

      subCategories = sortSubCategories([created, ...subCategories]);
      form = {
        category: '',
        name: '',
        slug: ''
      };
      message = 'Sub-category created successfully.';
    } catch (value) {
      error = getErrorMessage(value, 'Failed to create sub-category.');
    } finally {
      saving = false;
    }
  };

  const handleCreateLabel = async () => {
    labelMessage = '';
    labelError = '';
    labelSaving = true;

    try {
      await adminService.createLabel({
        name: newLabel.name,
        slug: newLabel.slug,
        description: newLabel.description || undefined,
        color: newLabel.color || undefined
      });
      newLabel = {
        name: '',
        slug: '',
        color: '#DB2777',
        description: ''
      };
      labelMessage = 'Label created successfully.';
    } catch (value) {
      labelError = getErrorMessage(value, 'Failed to create label.');
    } finally {
      labelSaving = false;
    }
  };

  const getProductCount = (item: AdminProductSubCategory): number =>
    Number(pickValue(item.productCount, item.product_count) || 0);
</script>

<svelte:head>
  <title>Product Sub-Categories - Admin</title>
  <meta
    name="description"
    content="Create and manage product sub-categories, then open each sub-category workspace to manage products."
  />
</svelte:head>

<div class="space-y-8">
  <section class="flex flex-col gap-2">
    <h1 class="text-2xl font-bold text-gray-900">Sub-Category Management</h1>
    <p class="text-sm text-gray-600">
      Create sub-categories first, then open a sub-category workspace to create and manage products inside it.
    </p>
  </section>

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Create Sub-Category</h2>
      <p class="text-sm text-gray-500 mb-4">
        Sub-category slugs are used in admin URLs, for example <code>/admin/products/netflix</code>.
      </p>
      <form class="space-y-3" on:submit|preventDefault={handleCreateSubCategory}>
        <div class="grid gap-3 md:grid-cols-1">
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Category (e.g. streaming)"
            bind:value={form.category}
            required
          />
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Sub-category name (e.g. Netflix)"
            bind:value={form.name}
            required
          />
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Slug (optional, e.g. netflix)"
            bind:value={form.slug}
          />
        </div>
        {#if message}
          <p class="text-sm text-green-600">{message}</p>
        {/if}
        {#if error}
          <p class="text-sm text-red-600">{error}</p>
        {/if}
        <button
          class="w-full rounded-lg bg-gradient-to-r from-purple-700 to-pink-600 px-4 py-2 text-sm font-semibold text-white"
          type="submit"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Create Sub-Category'}
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
        <h2 class="text-lg font-semibold text-gray-900">Sub-Categories</h2>
        <p class="text-sm text-gray-500">Open a sub-category to manage products scoped to it.</p>
      </div>
      <p class="text-sm text-gray-500">{subCategories.length} total</p>
    </div>

    {#if subCategories.length === 0}
      <AdminEmptyState
        title="No sub-categories"
        message="Create your first sub-category to start organizing products."
      />
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="py-2">Name</th>
              <th class="py-2">Category</th>
              <th class="py-2">Slug</th>
              <th class="py-2">Products</th>
              <th class="py-2">Updated</th>
              <th class="py-2">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each subCategories as subCategory}
              <tr>
                <td class="py-3 font-semibold text-gray-900">{subCategory.name}</td>
                <td class="py-3 text-gray-600">{subCategory.category}</td>
                <td class="py-3 text-gray-600">{subCategory.slug}</td>
                <td class="py-3 text-gray-600">{getProductCount(subCategory)}</td>
                <td class="py-3 text-gray-600">
                  {formatOptionalDate(pickValue(subCategory.updatedAt, subCategory.updated_at))}
                </td>
                <td class="py-3">
                  <a
                    class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-900 hover:border-gray-300"
                    href={`/admin/products/${subCategory.slug}`}
                  >
                    Open
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
