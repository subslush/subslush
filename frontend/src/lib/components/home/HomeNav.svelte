<script lang="ts">
  const navLinks = [
    { label: 'Browse Subscriptions', href: '/browse' },
    { label: 'Contact Us', href: '/contact' }
  ];
</script>

<nav class="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-16">

      <!-- LEFT: SubSlush Text Branding (NOT logo image) -->
      <a href="/" class="flex items-center">
        <span
          class="text-2xl font-extrabold bg-gradient-to-r bg-clip-text text-transparent"
          style="background-image: linear-gradient(45deg, #4FC3F7, #F06292);"
        >
          SubSlush
        </span>
      </a>

      <!-- CENTER: Navigation Links -->
      <div class="hidden md:flex items-center space-x-1">
        {#each navLinks as link}
          <a
            href={link.href}
            class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {link.label}
          </a>
        {/each}
      </div>

      <!-- RIGHT: Login + Get Started Buttons -->
      <div class="flex items-center space-x-3">
        <!-- Login Button - Ghost Style (NO background color) -->
        <a
          href="/auth/login"
          class="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all"
        >
          Login
        </a>

        <!-- Get Started Button - Gradient Background -->
        <a
          href="/auth/register"
          class="px-5 py-2 text-sm font-medium text-white rounded-lg transition-all hover:shadow-lg relative overflow-hidden group"
        >
          <!-- Gradient Background (same as SubSlush text) -->
          <span class="absolute inset-0 bg-gradient-to-r from-[#4FC3F7] to-[#F06292]"></span>

          <!-- Hover Effect Layer -->
          <span class="absolute inset-0 bg-gradient-to-r from-[#29B6F6] to-[#E91E63] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>

          <!-- Button Text -->
          <span class="relative z-10">Get Started</span>
        </a>
      </div>

      <!-- Mobile Menu Button (Hidden by default) -->
      <button class="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>
    </div>

    <!-- Mobile Menu (Hidden by default) -->
    <div class="hidden md:hidden border-t border-gray-200 py-2">
      {#each navLinks as link}
        <a
          href={link.href}
          class="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          {link.label}
        </a>
      {/each}
      <div class="border-t border-gray-200 mt-2 pt-2 space-y-2">
        <a href="/auth/login" class="block px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg text-center">
          Login
        </a>
        <a href="/auth/register" class="block px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-[#4FC3F7] to-[#F06292] rounded-lg text-center">
          Get Started
        </a>
      </div>
    </div>
  </div>
</nav>