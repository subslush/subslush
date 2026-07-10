<script lang="ts">
  import MethodBadge from './MethodBadge.svelte';

  export let method:
    | {
        manual_monthly_upgrade?: boolean;
        activation_link_handshake?: boolean;
        strict_rules?: boolean;
      }
    | null
    | undefined = null;
  export let itemType: 'new_account' | 'own_account' | 'activation_code' | null = null;
  export let compact = false;
</script>

<span class:badges={!compact} class:badges-compact={compact}>
  {#if itemType === 'own_account'}
    <MethodBadge label="Own account" />
  {:else if itemType === 'activation_code'}
    <MethodBadge label="Activation code" />
  {:else}
    <MethodBadge label="New account" />
  {/if}
  {#if method?.activation_link_handshake}
    <MethodBadge label="Activation link" tone="indigo" />
  {/if}
  {#if method?.strict_rules}
    <MethodBadge label="Strict rules" tone="red" />
  {/if}
  {#if method?.manual_monthly_upgrade}
    <MethodBadge label="MMU" />
  {/if}
</span>

<style>
  .badges,
  .badges-compact {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .badges-compact {
    gap: 4px;
  }
</style>
