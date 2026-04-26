<script lang="ts">
  import { Shield, CheckCircle, Users } from 'lucide-svelte';
  import visaLogo from '$lib/assets/visa.svg';
  import mastercardLogo from '$lib/assets/mastercard.svg';
  import paypalLogo from '$lib/assets/paypal-logo.svg';
  import amexLogo from '$lib/assets/amex.webp';
  import discoverLogo from '$lib/assets/discover.webp';
  import btcLogo from '$lib/assets/btc.svg';
  import ethLogo from '$lib/assets/eth.svg';
  import usdtLogo from '$lib/assets/usdt.svg';
  import usdcLogo from '$lib/assets/usdc.svg';
</script>

<div class="bg-gray-50 border-t border-gray-200 py-4">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-8">
      <!-- 256-bit Encryption Badge -->
      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <Shield size={16} class="text-black flex-shrink-0" />
        <span class="font-medium">256-bit Bank-Level Encryption</span>
      </div>

      <!-- 99.9% Uptime Badge -->
      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <CheckCircle size={16} class="text-black flex-shrink-0" />
        <span class="font-medium">99.9% Uptime Guaranteed</span>
      </div>

      <!-- User Count Badge -->
      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <Users size={16} class="text-black flex-shrink-0" />
        <span class="font-medium">Trusted by 2,847+ Users</span>
      </div>
    </div>
    <div class="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-600">
      <span class="font-medium whitespace-nowrap">Payment methods:</span>
      <img src={visaLogo} alt="Visa" width="50" height="16" class="h-4 w-auto shrink-0" loading="lazy" />
      <img
        src={mastercardLogo}
        alt="Mastercard"
        width="90"
        height="16"
        class="h-[18px] w-auto shrink-0"
        loading="lazy"
      />
      <img
        src={paypalLogo}
        alt="PayPal"
        width="124"
        height="33"
        class="h-5 w-auto shrink-0"
        loading="lazy"
      />
      <img src={amexLogo} alt="American Express" width="88" height="54" class="h-8 w-auto shrink-0" loading="lazy" />
      <img src={discoverLogo} alt="Discover" width="88" height="54" class="h-8 w-auto shrink-0" loading="lazy" />
      <img src={btcLogo} alt="Bitcoin" width="77" height="16" class="h-4 w-auto shrink-0" loading="lazy" />
      <img src={ethLogo} alt="Ethereum" width="64" height="16" class="h-[18px] w-auto shrink-0" loading="lazy" />
      <img src={usdtLogo} alt="USDT" width="18" height="16" class="h-4 w-auto shrink-0" loading="lazy" />
      <img src={usdcLogo} alt="USDC" width="18" height="16" class="h-4 w-auto shrink-0" loading="lazy" />
      <span class="text-gray-600 text-xs sm:text-sm font-medium whitespace-nowrap">+300 more</span>
    </div>
  </div>
</div>
