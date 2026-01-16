<script lang="ts">
  import AdminShell from '$lib/components/admin/AdminShell.svelte';
  import type { LayoutData } from './$types';

  export let data: LayoutData;
</script>

<AdminShell user={data.user}>
  <slot />
</AdminShell>
