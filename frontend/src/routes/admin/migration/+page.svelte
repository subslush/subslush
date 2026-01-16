<script lang="ts">
  import { adminService } from '$lib/api/admin.js';
  import type { AdminMigrationPreview, AdminMigrationResult } from '$lib/types/admin.js';

  let previewResult: AdminMigrationPreview | null = null;
  let applyResult: AdminMigrationResult | null = null;
  let loading = false;
  let errorMessage = '';

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const runPreview = async () => {
    loading = true;
    errorMessage = '';
    try {
      previewResult = await adminService.previewMigration();
    } catch (error) {
      errorMessage = getErrorMessage(error, 'Failed to run preview.');
    } finally {
      loading = false;
    }
  };

  const runApply = async () => {
    loading = true;
    errorMessage = '';
    try {
      applyResult = await adminService.applyMigration();
    } catch (error) {
      errorMessage = getErrorMessage(error, 'Failed to apply migration.');
    } finally {
      loading = false;
    }
  };
</script>

<svelte:head>
  <title>Pre-launch Migration - Admin</title>
  <meta name="description" content="Preview and apply pre-launch user and reward migrations." />
</svelte:head>

<div class="space-y-6">
  <section>
    <h1 class="text-2xl font-bold text-gray-900">Pre-launch Migration</h1>
    <p class="text-sm text-gray-600">Preview and apply the mapping between pre-registrations and live users.</p>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div class="flex flex-wrap gap-3">
      <button
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        on:click={runPreview}
        disabled={loading}
      >
        {loading ? 'Running...' : 'Run Dry-Run Preview'}
      </button>
      <button
        class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900"
        on:click={runApply}
        disabled={loading}
      >
        {loading ? 'Applying...' : 'Apply Migration'}
      </button>
    </div>
    {#if errorMessage}
      <p class="text-sm text-red-600">{errorMessage}</p>
    {/if}
  </section>

  {#if previewResult}
    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Preview Results</h2>
      <div class="grid gap-4 md:grid-cols-2 mt-4 text-sm">
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p class="text-gray-500">Mapped users</p>
          <p class="text-xl font-bold text-gray-900">{previewResult.mappedUsers ?? 0}</p>
        </div>
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p class="text-gray-500">Unmatched pre-registrations</p>
          <p class="text-xl font-bold text-gray-900">{previewResult.unmatchedPreRegistrations ?? 0}</p>
        </div>
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p class="text-gray-500">Rewards migrated</p>
          <p class="text-xl font-bold text-gray-900">{previewResult.rewardsMigrated ?? 0}</p>
        </div>
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p class="text-gray-500">Vouchers migrated</p>
          <p class="text-xl font-bold text-gray-900">{previewResult.vouchersMigrated ?? 0}</p>
        </div>
      </div>
    </section>
  {/if}

  {#if applyResult}
    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Apply Results</h2>
      <div class="grid gap-4 md:grid-cols-2 mt-4 text-sm">
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p class="text-gray-500">Mapped users</p>
          <p class="text-xl font-bold text-gray-900">{applyResult.mappedUsers ?? 0}</p>
        </div>
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <p class="text-gray-500">Rewards migrated</p>
          <p class="text-xl font-bold text-gray-900">{applyResult.rewardsMigrated ?? 0}</p>
        </div>
      </div>
      {#if applyResult.warnings?.length}
        <div class="mt-4 text-sm text-amber-600">
          {#each applyResult.warnings as warning}
            <p>{warning}</p>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <h2 class="text-lg font-semibold text-gray-900">Checklist</h2>
    <ul class="mt-3 space-y-2 text-sm text-gray-600">
      <li>Run a dry-run preview before applying changes.</li>
      <li>Review conflicts or duplicate emails in the preview output.</li>
      <li>Coordinate with ops before applying production migrations.</li>
    </ul>
  </section>
</div>
