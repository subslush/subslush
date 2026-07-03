<script lang="ts">
  import amexLogo from '$lib/assets/amex-logo.svg';
  import applePayLogo from '$lib/assets/apple-pay.svg';
  import btcLogo from '$lib/assets/btc.svg';
  import ethLogo from '$lib/assets/eth.svg';
  import googlePayLogo from '$lib/assets/google-pay.svg';
  import mastercardLogo from '$lib/assets/mastercard-logo.webp';
  import paydoLogo from '$lib/assets/paydo-logo.webp';
  import revolutLogo from '$lib/assets/revolut-logo.webp';
  import sepaLogo from '$lib/assets/sepa-logo.webp';
  import usdcLogo from '$lib/assets/usdc.svg';
  import usdtLogo from '$lib/assets/usdt.svg';
  import visaLogo from '$lib/assets/visa.svg';
  import { Shield, CheckCircle, PackageCheck } from 'lucide-svelte';

  const paymentMethods = [
    { name: 'Visa', logo: visaLogo, imageClass: 'h-5 w-12 object-contain' },
    { name: 'Mastercard', logo: mastercardLogo, imageClass: 'h-5 w-12 object-contain' },
    { name: 'American Express', logo: amexLogo, imageClass: 'h-5 w-12 scale-[2] object-contain' },
    { name: 'Apple Pay', logo: applePayLogo, imageClass: 'h-5 w-12 object-contain' },
    { name: 'Google Pay', logo: googlePayLogo, imageClass: 'h-5 w-12 object-contain' },
    { name: 'Revolut', logo: revolutLogo, imageClass: 'h-5 w-12 object-contain' },
    { name: 'PayDo', logo: paydoLogo, imageClass: 'h-5 w-12 scale-[2] object-contain' },
    { name: 'SEPA', logo: sepaLogo, imageClass: 'h-5 w-12 scale-[2] object-contain' },
    { name: 'Bitcoin', logo: btcLogo, imageClass: 'h-5 w-12 object-contain' },
    { name: 'Ethereum', logo: ethLogo, imageClass: 'h-5 w-12 object-contain' },
    { name: 'USDT', logo: usdtLogo, imageClass: 'h-5 w-12 object-contain' },
    { name: 'USDC', logo: usdcLogo, imageClass: 'h-5 w-12 object-contain' }
  ] as const;
</script>

<div class="bg-gray-50 border-t border-gray-200 py-4">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-8">
      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <Shield size={16} class="text-black flex-shrink-0" />
        <span class="font-medium">256-bit encryption</span>
      </div>

      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <CheckCircle size={16} class="text-black flex-shrink-0" />
        <span class="font-medium">Money-back guarantee on every order</span>
      </div>

      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <PackageCheck size={16} class="text-black flex-shrink-0" />
        <span class="font-medium">100+ orders delivered</span>
      </div>
    </div>

    <div
      class="mt-4 flex flex-wrap items-center justify-center gap-2"
      aria-label="Supported payment methods"
    >
      {#each paymentMethods as method}
        <span
          class="flex h-8 w-16 items-center justify-center rounded-md border border-gray-200 bg-white px-2 shadow-sm"
          title={method.name}
        >
          <img
            src={method.logo}
            alt={method.name}
            class={method.imageClass}
            loading="lazy"
          />
        </span>
      {/each}
    </div>
  </div>
</div>
