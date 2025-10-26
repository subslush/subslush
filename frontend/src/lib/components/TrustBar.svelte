<script lang="ts">
  import { Shield, CheckCircle, Users } from 'lucide-svelte';
</script>

<div class="bg-gray-50 border-t border-gray-200 py-4">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-wrap items-center justify-center gap-4 sm:gap-6 md:gap-8">
      <!-- 256-bit Encryption Badge -->
      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <Shield size={16} class="text-green-600 flex-shrink-0" />
        <span class="font-medium">256-bit Bank-Level Encryption</span>
      </div>

      <!-- 99.9% Uptime Badge -->
      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <CheckCircle size={16} class="text-green-600 flex-shrink-0" />
        <span class="font-medium">99.9% Uptime Guaranteed</span>
      </div>

      <!-- User Count Badge -->
      <div class="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <Users size={16} class="text-blue-600 flex-shrink-0" />
        <span class="font-medium">Trusted by 2,847+ Users</span>
      </div>
    </div>
  </div>
</div>