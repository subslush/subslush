<script lang="ts">
  import { Megaphone } from 'lucide-svelte';

  export let isVisible = true;
</script>

<div
  id="promo-banner"
  hidden={!isVisible}
  aria-hidden={!isVisible}
  class="sticky top-0 z-50 w-full bg-gradient-to-r from-purple-700 to-pink-600 text-white text-center px-4 py-1.5"
>
  <div class="flex items-center justify-center gap-2 text-sm font-semibold tracking-wide">
    <Megaphone size={16} aria-hidden="true" />
    <span>Marketplace update in progress</span>
  </div>
  <p class="mt-1 text-[11px] leading-relaxed md:text-xs">
    We are currently updating the marketplace. You may notice changes during the next few days, but we are working to keep everything usable and stable. If you face any issue, contact support via live chat or
    <a href="mailto:hello@subslush.com" class="font-semibold underline underline-offset-2">hello@subslush.com</a>.
  </p>
</div>
