<script lang="ts">
  export let title = 'Nothing here - all caught up';
  export let message = 'All caught up.';
</script>

<div class="empty-state">
  <div class="mark">✓</div>
  <p class="title">{title}</p>
  <p class="message">{message}</p>
</div>

<style>
  .empty-state {
    display: grid;
    place-items: center;
    min-height: 180px;
    border: 1px dashed #d9d9df;
    border-radius: 13px;
    background: #ffffff;
    padding: 24px;
    text-align: center;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 999px;
    background: #e7f6ee;
    color: #1a7f45;
    font-weight: 700;
  }

  .title {
    margin: 12px 0 0;
    color: #1a1a1c;
    font-weight: 700;
  }

  .message {
    margin: 4px 0 0;
    color: #71717a;
    font-size: 13px;
  }
</style>
