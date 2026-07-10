<script lang="ts">
  export let status: string | null | undefined = 'unknown';
  export let label: string | null | undefined = null;

  const groups: Record<string, string> = {
    delivered: 'green',
    succeeded: 'green',
    verified: 'green',
    active: 'green',
    redeemed: 'green',
    completed: 'green',
    in_progress: 'blue',
    'in progress': 'blue',
    ready_to_deliver: 'blue',
    'ready to deliver': 'blue',
    awaiting_fulfillment: 'amber',
    'awaiting fulfillment': 'amber',
    pending: 'amber',
    pending_payment: 'amber',
    due_soon: 'amber',
    'due soon': 'amber',
    awaiting_customer: 'purple',
    'awaiting customer': 'purple',
    instructions_delivered: 'purple',
    customer_ready: 'teal',
    'customer ready': 'teal',
    failed: 'red',
    issue: 'red',
    overdue: 'red',
    expired: 'gray',
    cancelled: 'gray',
    canceled: 'gray',
    draft: 'gray',
  };

  const colors: Record<string, string> = {
    green: 'background:#e7f6ee;color:#1a7f45',
    blue: 'background:#e7f0fe;color:#1a5fd6',
    amber: 'background:#fbf0d9;color:#8a5a0f',
    purple: 'background:#f1e9fc;color:#7b3fd6',
    teal: 'background:#d9f3ef;color:#0d857a',
    red: 'background:#fdeaea;color:#c0392b',
    gray: 'background:#eef0f2;color:#5f5f66',
  };

  $: normalized = String(status || label || 'unknown').toLowerCase().replace(/-/g, '_');
  $: color = colors[groups[normalized] || groups[normalized.replace(/_/g, ' ')] || 'gray'];
  $: display = label || String(status || 'unknown').replace(/_/g, ' ');
</script>

<span class="status-chip" style={color}>{display}</span>

<style>
  .status-chip {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    border-radius: 999px;
    padding: 3px 9px;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.15;
    text-transform: capitalize;
    white-space: nowrap;
  }
</style>
