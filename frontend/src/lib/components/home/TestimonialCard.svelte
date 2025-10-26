<script lang="ts">
  import type { Testimonial } from '$lib/data/testimonials';

  export let testimonial: Testimonial;

  function getInitials(name: string): string {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0].charAt(0) + parts[1].charAt(0);
    }
    return name.charAt(0);
  }
</script>

<div class="bg-gray-50 border-2 border-gray-200 rounded-2xl p-8 hover:shadow-md transition-shadow">
  <!-- Star Rating -->
  <div class="flex mb-4">
    {#each Array(5) as _}
      <span class="text-yellow-400 text-xl">⭐</span>
    {/each}
  </div>

  <!-- Quote -->
  <p class="text-gray-700 mb-6 leading-relaxed">
    "{testimonial.quote}"
  </p>

  <!-- Author Section -->
  <div class="flex flex-col items-center">
    <!-- Avatar Circle with Initials -->
    <div class="w-12 h-12 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-full flex items-center justify-center mb-2">
      <span class="text-white font-bold text-sm">{getInitials(testimonial.authorName)}</span>
    </div>

    <!-- Name -->
    <h4 class="font-semibold text-gray-900 mb-1">{testimonial.authorName}</h4>

    <!-- Verified Badge -->
    <div class="flex items-center space-x-1">
      <span class="text-green-500 text-sm">✓</span>
      <span class="text-green-600 text-sm font-medium">Verified Purchase</span>
    </div>
  </div>
</div>