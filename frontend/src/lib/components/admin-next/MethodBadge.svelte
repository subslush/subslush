<script lang="ts">
  export let label: string;
  export let tone: 'neutral' | 'indigo' | 'red' = 'neutral';

  const styles = {
    neutral: 'background:#f4f4f5;color:#5f5f66',
    indigo: 'background:#eef2ff;color:#4338ca',
    red: 'background:#fdeaea;color:#c0392b',
  };
</script>

<span class="method-badge" style={styles[tone]}>{label}</span>

<style>
  .method-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 6px;
    padding: 3px 7px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.1;
    white-space: nowrap;
  }
</style>
