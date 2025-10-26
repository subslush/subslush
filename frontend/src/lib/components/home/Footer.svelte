<script lang="ts">
  import TrustBar from '$lib/components/TrustBar.svelte';
</script>

<!-- Trust Bar -->
<TrustBar />

<footer class="bg-gray-900 text-gray-300 py-12">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- Top Section -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
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
            📧 hello@subslush.com
          </p>
          <p class="text-gray-400">
            Available 24/7 • Live chat support • Madrid, Spain
          </p>
        </div>
      </div>

      <!-- Quick Links -->
      <div>
        <h3 class="font-semibold text-white mb-4">Quick Links</h3>
        <ul class="space-y-2 text-sm">
          <li><a href="/" class="hover:text-white transition-colors">Home</a></li>
          <li><a href="/dashboard" class="hover:text-white transition-colors">Dashboard</a></li>
          <li><a href="/browse" class="hover:text-white transition-colors">Browse</a></li>
          <li><a href="/settings" class="hover:text-white transition-colors">Settings</a></li>
          <li><a href="/contact" class="hover:text-white transition-colors">Contacts</a></li>
        </ul>
      </div>

      <!-- Legal -->
      <div>
        <h3 class="font-semibold text-white mb-4">Legal</h3>
        <ul class="space-y-2 text-sm">
          <li><a href="/terms" class="hover:text-white transition-colors">Terms of Service</a></li>
          <li><a href="/privacy" class="hover:text-white transition-colors">Privacy Policy</a></li>
          <li><a href="/refund" class="hover:text-white transition-colors">Refund Policy</a></li>
        </ul>
      </div>

      <!-- Newsletter -->
      <div>
        <h3 class="font-semibold text-white mb-4">Stay Updated</h3>
        <p class="text-sm text-gray-400 mb-4">
          Get the latest deals and updates delivered to your inbox
        </p>
        <!-- Placeholder for newsletter signup -->
        <div class="flex space-x-2">
          <input
            type="email"
            placeholder="Your email"
            class="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500"
          />
          <button
            class="px-4 py-2 text-white text-sm font-medium rounded-lg bg-gradient-to-r from-[#4FC3F7] to-[#F06292] hover:from-[#29B6F6] hover:to-[#E91E63] transition-all"
          >
            Subscribe
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Section -->
    <div class="border-t border-gray-800 pt-8 text-center">
      <p class="text-sm text-gray-400">
        © 2025 SubSlush. Made with love for smarter spending. Madrid, Spain
      </p>
    </div>
  </div>
</footer>