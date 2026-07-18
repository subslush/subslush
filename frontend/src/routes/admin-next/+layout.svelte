<script lang="ts">
  import AdminNextShell from '$lib/components/admin-next/AdminNextShell.svelte';
  import type { LayoutData } from './$types';

  export let data: LayoutData;
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<AdminNextShell user={data.user} fulfillmentCount={data.fulfillmentCount}>
  <slot />
</AdminNextShell>
