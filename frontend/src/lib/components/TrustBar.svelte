<script lang="ts">
  import { Shield, CheckCircle, Users, WalletCards } from 'lucide-svelte';
</script>

<div class="bg-gray-50 border-t border-gray-200 py-4">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-8">
      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <Shield size={16} class="text-black flex-shrink-0" />
        <span class="font-medium">256-bit Bank-Level Encryption</span>
      </div>

      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <CheckCircle size={16} class="text-black flex-shrink-0" />
        <span class="font-medium">Support-backed fulfillment</span>
      </div>

      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <Users size={16} class="text-black flex-shrink-0" />
        <span class="font-medium">Trusted by 600+ users</span>
      </div>
    </div>

    <div class="mt-4 flex items-start justify-center gap-2 text-center text-xs sm:text-sm text-gray-600">
      <WalletCards size={15} class="mt-0.5 shrink-0 text-gray-700" />
      <span>
        Available payment methods are shown at checkout and may vary by country, currency, risk review,
        and payment provider availability.
      </span>
    </div>
  </div>
</div>
