<script lang="ts">
  import TrustBar from '$lib/components/TrustBar.svelte';
  import { openConsentPreferences } from '$lib/stores/consent.js';
  import { Instagram, Music2, Youtube, Twitter, MessageCircle, Twitch } from 'lucide-svelte';
</script>

<!-- Trust Bar -->
<TrustBar />

<footer class="bg-gray-900 text-gray-300 py-12">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- Top Section -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
      <!-- Company Info -->
      <div>
        <!-- SubSlush Text Branding (NOT logo image) -->
        <div class="mb-4">
          <span
            class="text-2xl font-extrabold bg-gradient-to-r bg-clip-text text-transparent"
            style="background-image: linear-gradient(45deg, #4FC3F7, #F06292);"
          >
            SubSlush
          </span>
        </div>

        <p class="text-sm text-gray-400 leading-relaxed mb-4">
          Discover a world of subscriptions with SubSlush.
          Effortlessly manage and enjoy a variety of premium content and tools in one place.
        </p>

        <div class="text-sm">
          <p class="font-medium text-gray-300 mb-2">
            hello@subslush.com
          </p>
          <p class="text-gray-400">
            Live chat support
          </p>
        </div>
      </div>

      <!-- Support -->
      <div>
        <h3 class="font-semibold text-white mb-4">Support</h3>
        <ul class="space-y-2 text-sm">
          <li><a href="/help" class="hover:text-white transition-colors">Help</a></li>
          <li><a href="/terms" class="hover:text-white transition-colors">Terms and conditions</a></li>
          <li><a href="/privacy" class="hover:text-white transition-colors">Privacy and cookie policy</a></li>
          <li><a href="/returns" class="hover:text-white transition-colors">Refund policy</a></li>
          <li>
            <button
              type="button"
              class="hover:text-white transition-colors"
              on:click={openConsentPreferences}
            >
              Cookie settings
            </button>
          </li>
        </ul>
      </div>

      <!-- Social -->
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

    <!-- Bottom Section -->
    <div class="border-t border-gray-800 pt-8 text-center">
      <p class="text-sm text-gray-400">
        Copyright © SubSlush, 2026. All rights reserved.
      </p>
      <p class="text-sm text-gray-300 mt-2">Premium For Less.</p>
      <p class="text-xs text-gray-500 mt-4">
        Using the SUBSLUSH.COM platform constitutes acceptance of the SubSlush
        <a href="/terms" class="underline underline-offset-2 hover:text-gray-300">Terms and Conditions</a>.
        Information on how we process your personal data can be found in the
        <a href="/privacy" class="underline underline-offset-2 hover:text-gray-300">Privacy and Cookies Policy</a>.
      </p>
    </div>
  </div>
</footer>
