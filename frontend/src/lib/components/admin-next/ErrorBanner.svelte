<script lang="ts">
  export let message = 'Unable to load this view.';
</script>

{#if message}
  <div class="error-banner">{message}</div>
{/if}

<style>
  .error-banner {
    border: 1px solid #f5c7c2;
    border-radius: 13px;
    background: #fdeaea;
    color: #c0392b;
    padding: 12px 14px;
    font-size: 13px;
    font-weight: 600;
  }
</style>
