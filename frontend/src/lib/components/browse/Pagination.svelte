<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fly } from 'svelte/transition';
  import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-svelte';
  import type { PaginationInfo } from '$lib/types/browse.js';

  export let pagination: PaginationInfo;
  export let showItemsPerPage = true;
  export let maxVisiblePages = 7;

  const dispatch = createEventDispatcher<{
    pageChange: number;
    itemsPerPageChange: number;
  }>();

  const itemsPerPageOptions = [12, 24, 48, 96];

  function goToPage(page: number) {
    if (page >= 1 && page <= pagination.totalPages && page !== pagination.currentPage) {
      dispatch('pageChange', page);

      // Smooth scroll to top of results
      const gridElement = document.getElementById('subscription-grid');
      if (gridElement) {
        gridElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function changeItemsPerPage(newItemsPerPage: number) {
    if (newItemsPerPage !== pagination.itemsPerPage) {
      dispatch('itemsPerPageChange', newItemsPerPage);
    }
  }

  function getVisiblePages(): (number | 'ellipsis')[] {
    const { currentPage, totalPages } = pagination;
    const pages: (number | 'ellipsis')[] = [];

    if (totalPages <= maxVisiblePages) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Complex pagination with ellipsis
      pages.push(1);

      if (currentPage <= 4) {
        // Near the beginning
        for (let i = 2; i <= Math.min(5, totalPages - 1); i++) {
          pages.push(i);
        }
        if (totalPages > 5) {
          pages.push('ellipsis');
        }
      } else if (currentPage >= totalPages - 3) {
        // Near the end
        if (totalPages > 5) {
          pages.push('ellipsis');
        }
        for (let i = Math.max(totalPages - 4, 2); i <= totalPages - 1; i++) {
          pages.push(i);
        }
      } else {
        // In the middle
        pages.push('ellipsis');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
      }

      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  }

  function handleKeydown(event: KeyboardEvent, page: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      goToPage(page);
    }
  }

  function handleJumpKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const target = event.currentTarget as HTMLInputElement;
      const page = parseInt(target.value);
      if (page >= 1 && page <= pagination.totalPages) {
        goToPage(page);
      }
    }
  }

  $: visiblePages = getVisiblePages();
  $: startItem = (pagination.currentPage - 1) * pagination.itemsPerPage + 1;
  $: endItem = Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems);
</script>

{#if pagination.totalPages > 1}
  <div class="pagination-container" transition:fly={{ y: 20, duration: 300 }}>
    <!-- Items info and per-page selector -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div class="text-sm text-gray-600">
        Showing <span class="font-medium text-gray-900">{startItem}</span> to
        <span class="font-medium text-gray-900">{endItem}</span> of
        <span class="font-medium text-gray-900">{pagination.totalItems}</span> results
      </div>

      {#if showItemsPerPage}
        <div class="flex items-center space-x-2">
          <label for="items-per-page" class="text-sm text-gray-600">Show:</label>
          <select
            id="items-per-page"
            bind:value={pagination.itemsPerPage}
            on:change={(e) => changeItemsPerPage(parseInt(e.currentTarget.value))}
            class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          >
            {#each itemsPerPageOptions as option}
              <option value={option}>{option} per page</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- Pagination controls -->
    <nav class="flex items-center justify-center" aria-label="Pagination">
      <div class="flex items-center space-x-1">
        <!-- Previous button -->
        <button
          type="button"
          class="pagination-btn flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-all duration-150"
          disabled={!pagination.hasPrevious}
          on:click={() => goToPage(pagination.currentPage - 1)}
          aria-label="Go to previous page"
        >
          <ChevronLeft size={16} />
          <span class="hidden sm:inline">Previous</span>
        </button>

        <!-- Page numbers -->
        <div class="flex items-center space-x-1 mx-2">
          {#each visiblePages as page}
            {#if page === 'ellipsis'}
              <div class="flex items-center justify-center w-10 h-10 text-gray-400">
                <MoreHorizontal size={16} />
              </div>
            {:else}
              <button
                type="button"
                class={`pagination-btn w-10 h-10 text-sm font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                  page === pagination.currentPage
                    ? 'bg-gradient-to-br from-cyan-500/5 to-pink-500/5 border border-cyan-200 text-gray-900 font-semibold'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                on:click={() => goToPage(page)}
                on:keydown={(e) => handleKeydown(e, page)}
                aria-label="Go to page {page}"
                aria-current={page === pagination.currentPage ? 'page' : undefined}
              >
                {page}
              </button>
            {/if}
          {/each}
        </div>

        <!-- Next button -->
        <button
          type="button"
          class="pagination-btn flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-all duration-150"
          disabled={!pagination.hasNext}
          on:click={() => goToPage(pagination.currentPage + 1)}
          aria-label="Go to next page"
        >
          <span class="hidden sm:inline">Next</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>

    <!-- Quick jump (for large datasets) -->
    {#if pagination.totalPages > 10}
      <div class="flex items-center justify-center mt-4">
        <div class="flex items-center space-x-2 text-sm">
          <label for="jump-to-page" class="text-gray-600">Jump to page:</label>
          <input
            id="jump-to-page"
            type="number"
            min="1"
            max={pagination.totalPages}
            placeholder={pagination.currentPage.toString()}
            class="w-16 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            on:keydown={handleJumpKeydown}
          />
          <span class="text-gray-500">of {pagination.totalPages}</span>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .pagination-container {
    /* Ensure good spacing and alignment */
    margin-top: 2rem;
    margin-bottom: 2rem;
  }

  .pagination-btn {
    /* Ensure consistent button styling */
    border-width: 1px;
    min-height: 40px; /* Minimum touch target */
  }

  .pagination-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .pagination-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .pagination-container {
      margin-top: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .pagination-btn {
      min-height: 44px; /* Larger touch targets on mobile */
    }

    /* Hide page numbers on very small screens, show only prev/next */
    @media (max-width: 480px) {
      .pagination-container nav > div > div {
        display: none;
      }
    }
  }

  /* Focus styles for accessibility */
  .pagination-btn:focus {
    outline: 2px solid #0ea5e9;
    outline-offset: 2px;
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .pagination-btn {
      border-width: 2px;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .pagination-btn {
      transition: none;
    }

    .pagination-btn:hover:not(:disabled) {
      transform: none;
      box-shadow: none;
    }
  }

  /* Print styles */
  @media print {
    .pagination-container {
      display: none;
    }
  }
</style>
