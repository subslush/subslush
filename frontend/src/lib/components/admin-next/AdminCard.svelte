<script lang="ts">
  export let interactive = false;
  export let accent: 'none' | 'teal' | 'red' | 'amber' | 'purple' = 'none';
</script>

<div class:interactive class="admin-card accent-{accent}">
  <slot />
</div>

<style>
  .admin-card {
    position: relative;
    border: 1px solid #ececee;
    border-radius: 13px;
    background: #ffffff;
    padding: 18px;
    overflow: hidden;
  }

  .interactive {
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      border-color 160ms ease;
  }

  .interactive:hover {
    transform: translateY(-1px);
    border-color: #dedee4;
    box-shadow: 0 14px 34px rgba(20, 20, 24, 0.07);
  }

  .accent-teal::before,
  .accent-red::before,
  .accent-amber::before,
  .accent-purple::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    content: '';
  }

  .accent-teal::before {
    background: #0d857a;
  }

  .accent-red::before {
    background: #c0392b;
  }

  .accent-amber::before {
    background: #8a5a0f;
  }

  .accent-purple::before {
    background: #7b3fd6;
  }
</style>
