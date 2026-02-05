<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fly, slide } from 'svelte/transition';
  import { Search, X, Loader2, Keyboard } from 'lucide-svelte';
  import type { SearchResult } from '$lib/types/browse.js';

  export let query = '';
  export let placeholder = 'Search Netflix, Spotify, Adobe, TradingView...';
  export let suggestions: SearchResult[] = [];
  export let isLoading = false;
  export let maxSuggestions = 5;
  export let debounceMs = 300;

  const dispatch = createEventDispatcher<{
    queryChange: string;
    suggestionSelect: SearchResult;
    search: string;
    clear: void;
  }>();

  let inputElement: HTMLInputElement;
  let dropdownElement: HTMLElement;
  let isOpen = false;
  let selectedIndex = -1;
  let debounceTimer: ReturnType<typeof setTimeout>;

  // Handle query changes with debouncing
  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    query = target.value;

    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set new timer
    debounceTimer = setTimeout(() => {
      dispatch('queryChange', query);
      if (query.trim().length > 0) {
        isOpen = true;
        selectedIndex = -1;
      } else {
        isOpen = false;
      }
    }, debounceMs);
  }

  function handleClear() {
    query = '';
    isOpen = false;
    selectedIndex = -1;
    dispatch('clear');
    dispatch('queryChange', '');
    inputElement?.focus();
  }

  function handleSearch() {
    if (query.trim()) {
      dispatch('search', query.trim());
      isOpen = false;
    }
  }

  function selectSuggestion(suggestion: SearchResult) {
    query = suggestion.serviceName + ' ' + suggestion.planName;
    isOpen = false;
    selectedIndex = -1;
    dispatch('suggestionSelect', suggestion);
    inputElement?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen || suggestions.length === 0) {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleSearch();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
        scrollToSelected();
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        scrollToSelected();
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          selectSuggestion(suggestions[selectedIndex]);
        } else {
          handleSearch();
        }
        break;
      case 'Escape':
        event.preventDefault();
        isOpen = false;
        selectedIndex = -1;
        inputElement?.blur();
        break;
      case 'Tab':
        isOpen = false;
        selectedIndex = -1;
        break;
    }
  }

  function scrollToSelected() {
    if (dropdownElement && selectedIndex >= 0) {
      const selectedElement = dropdownElement.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }
  }

  function handleFocus() {
    if (query.trim() && suggestions.length > 0) {
      isOpen = true;
    }
  }

  function handleBlur(event: FocusEvent) {
    // Delay closing to allow clicking on suggestions
    setTimeout(() => {
      if (!dropdownElement?.contains(event.relatedTarget as Node)) {
        isOpen = false;
        selectedIndex = -1;
      }
    }, 150);
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as Element;
    const searchContainer = inputElement?.closest('.search-container');

    if (searchContainer && !searchContainer.contains(target)) {
      isOpen = false;
      selectedIndex = -1;
    }
  }

  type HighlightPart = { text: string; match: boolean };

  function getHighlightParts(text: string, query: string): HighlightPart[] {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [{ text, match: false }];
    }

    const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    const parts: HighlightPart[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: text.slice(lastIndex, match.index), match: false });
      }
      parts.push({
        text: text.slice(match.index, match.index + match[0].length),
        match: true
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex), match: false });
    }

    return parts.length ? parts : [{ text, match: false }];
  }

  // Cleanup on component destroy
  onDestroy(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    if (typeof window !== 'undefined') {
      document.removeEventListener('click', handleClickOutside);
    }
  });

  // Setup click outside listener
  onMount(() => {
    if (typeof window !== 'undefined') {
      document.addEventListener('click', handleClickOutside);
    }
  });

  // Update open state when suggestions change
  $: if (suggestions.length > 0 && query.trim() && document.activeElement === inputElement) {
    isOpen = true;
  }

  // Limit displayed suggestions
  $: displayedSuggestions = suggestions.slice(0, maxSuggestions);
</script>

<div
  class="search-container relative w-full max-w-2xl"
  role="combobox"
  aria-expanded={isOpen}
  aria-controls="search-suggestions"
  aria-haspopup="listbox"
>
  <!-- Search input -->
  <div class="relative">
    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
      <Search size={20} class="text-gray-400" aria-hidden="true" />
    </div>

    <input
      bind:this={inputElement}
      type="text"
      bind:value={query}
      {placeholder}
      class="w-full px-4 py-3 pl-12 pr-20 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-gray-900 placeholder-gray-500 transition-all duration-200"
      on:input={handleInput}
      on:keydown={handleKeydown}
      on:focus={handleFocus}
      on:blur={handleBlur}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      aria-autocomplete="list"
      aria-controls="search-suggestions"
      aria-describedby="search-description"
      aria-activedescendant={selectedIndex >= 0 ? `suggestion-${selectedIndex}` : ''}
    />

    <!-- Right side icons -->
    <div class="absolute inset-y-0 right-0 flex items-center pr-4 space-x-2">
      {#if isLoading}
        <Loader2 size={16} class="animate-spin text-gray-400" aria-label="Loading suggestions" />
      {/if}

      {#if query.trim()}
        <button
          type="button"
          class="text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600 transition-colors duration-150"
          on:click={handleClear}
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      {/if}

      <!-- Keyboard hint -->
      <div class="hidden sm:flex items-center space-x-1 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded border">
        <Keyboard size={12} />
        <span>⌘K</span>
      </div>
    </div>
  </div>

  <!-- Suggestions dropdown -->
  {#if isOpen && (displayedSuggestions.length > 0 || isLoading)}
    <div
      bind:this={dropdownElement}
      class="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto"
      id="search-suggestions"
      role="listbox"
      transition:slide={{ duration: 200 }}
    >
      {#if isLoading}
        <div class="flex items-center justify-center py-4">
          <Loader2 size={20} class="animate-spin text-gray-400 mr-2" />
          <span class="text-gray-600">Searching...</span>
        </div>
      {:else if displayedSuggestions.length > 0}
        {#each displayedSuggestions as suggestion, index (suggestion.id)}
          <button
            type="button"
            class="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3 border-b border-gray-100 last:border-b-0 transition-colors duration-150"
            class:bg-cyan-50={selectedIndex === index}
            class:border-cyan-200={selectedIndex === index}
            on:click={() => selectSuggestion(suggestion)}
            on:mouseenter={() => { selectedIndex = index; }}
            role="option"
            aria-selected={selectedIndex === index}
            id="suggestion-{index}"
            tabindex="-1"
          >
            <!-- Service logo or fallback -->
            <div class="flex-shrink-0">
              {#if suggestion.logoUrl}
                <img
                  src={suggestion.logoUrl}
                  alt="{suggestion.serviceName} logo"
                  width="40"
                  height="40"
                  class="w-10 h-10 rounded-lg object-cover"
                  loading="lazy"
                />
              {:else}
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/10 to-pink-500/10 flex items-center justify-center text-sm font-bold text-gray-700">
                  {suggestion.serviceName.charAt(0)}
                </div>
              {/if}
            </div>

            <!-- Service info -->
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900">
                {#each getHighlightParts(suggestion.serviceName, query) as part, partIndex (partIndex)}
                  {#if part.match}
                    <mark class="bg-yellow-200 text-yellow-900 px-0.5 rounded">{part.text}</mark>
                  {:else}
                    {part.text}
                  {/if}
                {/each}
              </div>
              <div class="text-sm text-gray-600">
                {#each getHighlightParts(suggestion.planName, query) as part, partIndex (partIndex)}
                  {#if part.match}
                    <mark class="bg-yellow-200 text-yellow-900 px-0.5 rounded">{part.text}</mark>
                  {:else}
                    {part.text}
                  {/if}
                {/each}
              </div>
            </div>

            <!-- Price -->
            <div class="flex-shrink-0 text-right">
              <div class="text-sm font-semibold text-gray-900">
                €{suggestion.price.toFixed(2)}/mo
              </div>
            </div>
          </button>
        {/each}

        <!-- Show all results link -->
        {#if suggestions.length > maxSuggestions}
          <div class="px-4 py-2 text-center border-t border-gray-100">
            <button
              type="button"
              class="text-sm text-cyan-600 hover:text-cyan-700 font-medium"
              on:click={handleSearch}
            >
              Show all {suggestions.length} results
            </button>
          </div>
        {/if}
      {:else}
        <div class="px-4 py-3 text-sm text-gray-600 text-center">
          No results found for "{query}"
        </div>
      {/if}
    </div>
  {/if}

  <!-- Screen reader description -->
  <div id="search-description" class="sr-only">
    Use arrow keys to navigate suggestions, Enter to select, Escape to close
  </div>
</div>

<style>
  /* Ensure dropdown appears above other elements */
  .search-container {
    isolation: isolate;
  }

  /* Custom scrollbar for suggestions */
  #search-suggestions {
    scrollbar-width: thin;
    scrollbar-color: #d1d5db #f9fafb;
  }

  #search-suggestions::-webkit-scrollbar {
    width: 6px;
  }

  #search-suggestions::-webkit-scrollbar-track {
    background: #f9fafb;
  }

  #search-suggestions::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 3px;
  }

  #search-suggestions::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }

  /* Focus styles for accessibility */
  input:focus {
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
  }

  /* Reduce motion for accessibility */
  @media (prefers-reduced-motion: reduce) {
    input,
    button {
      transition: none;
    }
  }
</style>
