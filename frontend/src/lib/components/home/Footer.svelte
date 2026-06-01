<script lang="ts">
  import TrustBar from '$lib/components/TrustBar.svelte';
  import { Instagram, Music2, Youtube, Twitter, MessageCircle, Twitch } from 'lucide-svelte';
  import { openCrispChat } from '$lib/consent/thirdParty.js';
  import subslushLogoIcon from '$lib/assets/subslushlogos.webp';
</script>

<!-- Trust Bar -->
<TrustBar />

<footer class="bg-gray-900 text-gray-300 py-10">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-8 mb-7">
      <div>
        <div class="mb-4 flex items-center gap-2.5">
          <img
            src={subslushLogoIcon}
            alt="SubSlush logo icon"
            class="h-8 w-8 rounded-md object-cover"
            loading="lazy"
          />
          <span
            class="text-2xl font-extrabold bg-gradient-to-r bg-clip-text text-transparent"
            style="background-image: linear-gradient(90deg, #7e22ce 0%, #db2777 100%);"
          >
            SubSlush
          </span>
        </div>

        <div class="text-[13px] leading-6 text-gray-400 space-y-2.5">
          <p class="text-gray-300">
            SubSlush is operated by <span class="font-semibold">3NITY DIGITAL LIMITED</span> and
            <span class="font-semibold">2Sneaks AB</span>.
          </p>
          <p>
            3NITY DIGITAL LIMITED · Platform operator &amp; fulfillment provider · BRN 79886556
          </p>
          <p>
            2Sneaks AB · Merchant of record for applicable transactions · Org.nr 559265-0963 · VAT SE559265096301
          </p>
          <p>
            Full legal company details are available in our
            <a href="/terms" class="underline underline-offset-2 hover:text-gray-200">Terms and Conditions</a>.
          </p>
          <p class="text-gray-300">
            Customer support: hello@subslush.com · Legal/payment: compliance@subslush.com
          </p>
        </div>
      </div>

      <div>
        <h3 class="font-semibold text-white mb-4">Support &amp; legal</h3>
        <ul class="space-y-2 text-sm">
          <li><a href="/about" class="hover:text-white transition-colors">About us</a></li>
          <li><a href="/help" class="hover:text-white transition-colors">Help</a></li>
          <li><a href="/how-delivery-works" class="hover:text-white transition-colors">How delivery works</a></li>
          <li><a href="/terms" class="hover:text-white transition-colors">Terms and conditions</a></li>
          <li><a href="/privacy" class="hover:text-white transition-colors">Privacy and cookie policy</a></li>
          <li><a href="/returns" class="hover:text-white transition-colors">Refund policy</a></li>
        </ul>
        <button
          type="button"
          class="mt-3 text-sm text-gray-400 transition-colors hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700/40 rounded"
          on:click={openCrispChat}
        >
          Live chat support
        </button>
      </div>

      <div>
        <h3 class="font-semibold text-white mb-4">Follow us</h3>
        <div class="flex flex-wrap gap-3">
          <a href="https://instagram.com" class="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors" aria-label="Instagram">
            <Instagram size={18} />
          </a>
          <a href="https://tiktok.com" class="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors" aria-label="TikTok">
            <Music2 size={18} />
          </a>
          <a href="https://youtube.com" class="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors" aria-label="YouTube">
            <Youtube size={18} />
          </a>
          <a href="https://twitter.com" class="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors" aria-label="X">
            <Twitter size={18} />
          </a>
          <a href="https://reddit.com" class="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors" aria-label="Reddit">
            <MessageCircle size={18} />
          </a>
          <a href="https://twitch.tv" class="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors" aria-label="Twitch">
            <Twitch size={18} />
          </a>
        </div>
      </div>
    </div>

    <div class="border-t border-gray-800 pt-6 space-y-2 text-center">
      <p class="text-sm text-gray-400">
        Copyright © SubSlush, 2026. All rights reserved.
      </p>
      <p class="text-xs text-gray-500 mt-2">
        Unless explicitly stated otherwise, SubSlush is not affiliated with, endorsed by, or sponsored by any third-party brand owner.
      </p>
    </div>
  </div>
</footer>
