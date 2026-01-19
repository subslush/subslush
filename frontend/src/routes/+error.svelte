<script lang="ts">
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';

  export let status: number;

  const title = 'Page not found';
  const message = 'The page you are looking for does not exist or has moved.';
  $: showStatus = status === 404;
</script>

<svelte:head>
  <title>{title} - SubSlush</title>
</svelte:head>

<div class="min-h-screen bg-white">
  <HomeNav />

  <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
    <div class="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
      <div class="flex flex-col items-center text-center gap-4">
        {#if showStatus}
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-600">
            404
          </p>
        {/if}
        <h1 class="text-3xl font-bold text-gray-900">{title}</h1>
        <p class="text-sm text-gray-600 max-w-2xl">{message}</p>
        <div class="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <a
            href="/"
            class="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Home
          </a>
          <a
            href="/browse"
            class="inline-flex items-center justify-center rounded-lg border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Browse products
          </a>
        </div>
      </div>
    </div>
  </main>

  <Footer />
</div>
