<script lang="ts">
  export let title: string;
  export let subtitle = '';
</script>

<section class="page-header">
  <h1>{title}</h1>
  {#if subtitle}
    <p>{subtitle}</p>
  {/if}
  <slot />
</section>

<style>
  .page-header {
    display: grid;
    gap: 6px;
  }

  h1 {
    margin: 0;
    color: #1a1a1c;
    font-size: 23px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    max-width: 960px;
    color: #71717a;
    font-size: 14px;
    line-height: 1.45;
  }
</style>
