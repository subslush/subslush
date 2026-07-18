<script lang="ts">
  import { goto } from '$app/navigation';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import PageHeader from '$lib/components/admin-next/PageHeader.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { formatDateTime, formatMoney, shortId } from '$lib/utils/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;
  let search = data.search || '';

  const runSearch = async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    await goto(`/admin-next/users?${params.toString()}`);
  };

  const initials = (email?: string | null) =>
    (email || 'A').split(/[ @._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
</script>

<svelte:head><title>Users - Admin Next</title></svelte:head>

<div class="page">
  <PageHeader title="Users" subtitle="Slim support lookup for account, orders, subscriptions, and recent evidence." />
  <ErrorBanner message={data.error} />

  <AdminCard><div class="search"><input bind:value={search} placeholder="Email, user id, username" on:keydown={(event) => event.key === 'Enter' && runSearch()} /><button type="button" on:click={runSearch}>Search</button></div></AdminCard>

  {#if !data.search}
    <EmptyState title="Search for a user" message="Enter an email, user id, or username to view support context." />
  {:else if data.users.length === 0}
    <EmptyState title="No users found" message="No matching account exists." />
  {:else}
    {#each data.users as user}
      <div class="result">
        <AdminCard>
          <div class="avatar">{initials(user.account.email)}</div>
          <h2>{user.account.email}</h2>
          <StatusChip status={user.account.status || 'active'} />
          <dl>
            <dt>Verified</dt><dd>{user.account.email_verified_at ? '✓' : '✗'}</dd>
            <dt>Registered</dt><dd>{formatDateTime(user.account.created_at)}</dd>
            <dt>Last login</dt><dd>{formatDateTime(user.account.last_login)}</dd>
            <dt>User id</dt><dd class="mono">{user.account.id}</dd>
            <dt>Guest claim</dt><dd>{user.account.is_guest ? user.account.guest_claimed_at ? `Claimed ${formatDateTime(user.account.guest_claimed_at)}` : 'Guest account' : 'None'}</dd>
          </dl>
        </AdminCard>
        <div class="stack">
          <AdminCard><h3>Orders</h3>{#each user.orders as order}<a class="line" href={`/admin-next/orders/${order.id}`}><span class="mono">{shortId(order.id)}</span><StatusChip status={order.status} /><span>{formatMoney(order.total_cents, order.currency || 'USD')}</span></a>{:else}<p class="muted">No orders.</p>{/each}</AdminCard>
          <AdminCard><h3>Subscriptions</h3>{#each user.subscriptions as sub}<a class="line" href={`/admin-next/subscriptions?subscription=${sub.id}`}><span>{sub.product_name || sub.service_type || 'Subscription'}</span><StatusChip status={sub.status} /><span class="mono">{shortId(sub.id)}</span></a>{:else}<p class="muted">No subscriptions.</p>{/each}</AdminCard>
          <AdminCard><h3>Recent evidence</h3>{#each user.evidence as event}<p class="line"><span>{event.event_type}</span><code>{formatDateTime(event.created_at)}</code><code>{event.ip_address || '--'}</code><code>{event.user_agent || '--'}</code></p>{:else}<p class="muted">No recent evidence.</p>{/each}</AdminCard>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .page { display: grid; gap: 18px; }
  .search { display: grid; grid-template-columns: minmax(240px, 1fr) auto; gap: 12px; }
  input { min-height: 38px; border: 1px solid #dedee4; border-radius: 10px; padding: 0 10px; font: inherit; }
  button { min-height: 38px; border: 0; border-radius: 10px; background: #1a1a1c; color: white; padding: 0 14px; font-weight: 750; cursor: pointer; }
  .result { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 18px; align-items: start; }
  .avatar { display: grid; place-items: center; width: 54px; height: 54px; border-radius: 999px; background: #ece8fb; color: #5b46e0; font-weight: 800; }
  h2, h3, p { margin: 0; } h2 { margin-top: 12px; font-size: 17px; overflow-wrap: anywhere; } h3 { margin-bottom: 10px; font-size: 15px; }
  dl { display: grid; gap: 8px; margin-top: 14px; }
  dt { color: #71717a; font-size: 12px; } dd { margin: 0; overflow-wrap: anywhere; }
  .stack { display: grid; gap: 14px; }
  .line { display: grid; grid-template-columns: minmax(150px, 1fr) auto auto auto; gap: 10px; align-items: center; border-bottom: 1px solid #f0f0f2; padding: 9px 0; color: #1a1a1c; text-decoration: none; }
  .mono, code { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .muted { color: #71717a; }
  @media (max-width: 900px) { .result { grid-template-columns: 1fr; } }
</style>
