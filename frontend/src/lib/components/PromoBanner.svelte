<script lang="ts">
  import { PartyPopper } from 'lucide-svelte';
</script>

<div
  id="promo-banner"
  class="sticky top-0 z-50 w-full bg-gradient-to-r from-pink-600 to-cyan-500 text-white text-center px-4 py-1.5"
>
  <div class="flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-wide">
    <PartyPopper size={18} aria-hidden="true" />
    <span>Happy New Year!</span>
    <PartyPopper size={18} aria-hidden="true" />
  </div>
  <p class="mt-1 text-xs md:text-sm">
    Start the new year with <span class="font-semibold">15%</span> off using CODE
    <span class="font-semibold">NEW15</span>
  </p>
</div>
