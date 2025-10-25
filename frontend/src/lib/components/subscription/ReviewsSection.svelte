<script lang="ts">
  import { Star, CheckCircle, User, ChevronDown } from 'lucide-svelte';
  import type { Review } from '$lib/types/subscription';

  export let reviews: Review[];
  export let averageRating: number;
  export let totalReviews: number;

  let showAllReviews = false;
  let displayedReviews = 3;

  $: visibleReviews = showAllReviews ? reviews : reviews.slice(0, displayedReviews);
  $: hasMoreReviews = reviews.length > displayedReviews;

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function toggleAllReviews() {
    showAllReviews = !showAllReviews;
  }

  function getInitials(name: string) {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow duration-300">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <h3 class="text-xl font-semibold text-gray-900">
      What Members Say
    </h3>
    <div class="flex items-center space-x-2">
      <div class="flex items-center space-x-1">
        {#each Array(5) as _, i}
          <Star
            size={16}
            class={i < Math.floor(averageRating)
              ? 'text-yellow-400 fill-current'
              : 'text-gray-300'}
          />
        {/each}
      </div>
      <span class="text-sm font-medium text-gray-900">
        {averageRating.toFixed(1)}
      </span>
      <span class="text-sm text-gray-600">
        ({totalReviews})
      </span>
    </div>
  </div>

  <!-- Reviews List -->
  <div class="space-y-4">
    {#each visibleReviews as review}
      <div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <!-- Review Header -->
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center space-x-4">
            <!-- Avatar -->
            <div class="w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
              <span class="text-sm font-medium text-primary-700 dark:text-primary-300">
                {getInitials(review.author)}
              </span>
            </div>

            <!-- Author Info -->
            <div>
              <div class="flex items-center space-x-2">
                <span class="font-medium text-gray-900">
                  {review.author}
                </span>
                {#if review.isVerified}
                  <CheckCircle size={16} class="text-green-500" />
                  <span class="text-xs text-green-600">
                    Verified
                  </span>
                {/if}
              </div>
              <div class="text-sm text-gray-500">
                {formatDate(review.createdAt)}
              </div>
            </div>
          </div>

          <!-- Rating -->
          <div class="flex items-center space-x-1">
            {#each Array(5) as _, i}
              <Star
                size={14}
                class={i < review.rating
                  ? 'text-yellow-400 fill-current'
                  : 'text-surface-300 dark:text-surface-600'}
              />
            {/each}
          </div>
        </div>

        <!-- Review Content -->
        <p class="text-gray-700 leading-relaxed">
          {review.comment}
        </p>
      </div>
    {/each}
  </div>

  <!-- Show More/Less Button -->
  {#if hasMoreReviews}
    <div class="mt-6 text-center">
      <button
        on:click={toggleAllReviews}
        class="inline-flex items-center space-x-2 px-4 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors duration-200"
      >
        <span>
          {showAllReviews ? 'Show Less' : `View All ${reviews.length} Reviews`}
        </span>
        <ChevronDown
          size={16}
          class="transform transition-transform duration-200 {showAllReviews ? 'rotate-180' : ''}"
        />
      </button>
    </div>
  {/if}

  <!-- Empty State -->
  {#if reviews.length === 0}
    <div class="text-center py-8">
      <User size={48} class="mx-auto text-surface-400 dark:text-surface-500 mb-4" />
      <p class="text-surface-600 dark:text-surface-400">
        No reviews yet. Be the first to share your experience!
      </p>
    </div>
  {/if}
</div>