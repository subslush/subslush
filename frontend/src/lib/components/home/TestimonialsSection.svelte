<script lang="ts">
  import TestimonialCard from './TestimonialCard.svelte';
  import { testimonials } from '$lib/data/testimonials';
</script>

<section class="py-12 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- Section Header -->
    <div class="text-center mb-12">
      <h2 class="text-2xl font-semibold text-gray-900 mb-2">
        What Our Customers Say
      </h2>
      <p class="text-sm text-gray-600">
        Real reviews from real users
      </p>
    </div>

    <!-- Testimonials Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {#each testimonials as testimonial}
        <TestimonialCard {testimonial} />
      {/each}
    </div>
  </div>
</section>