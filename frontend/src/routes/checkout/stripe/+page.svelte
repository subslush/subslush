<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  onMount(() => {
    const query = $page.url.searchParams.toString();
    void goto(`/checkout/card${query ? `?${query}` : ''}`, {
      replaceState: true,
    });
  });
</script>
