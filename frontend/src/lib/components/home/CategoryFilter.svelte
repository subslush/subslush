<script lang="ts">
  export let selectedCategory = 'all';

  const categories = [
    { id: 'all', label: 'All Categories', count: 560 },
    { id: 'streaming', label: 'Streaming', icon: '🎬' },
    { id: 'music', label: 'Music', icon: '🎵' },
    { id: 'productivity', label: 'Productivity', icon: '💼' },
    { id: 'design', label: 'Design', icon: '🎨' },
    { id: 'fitness', label: 'Fitness', icon: '💪' },
    { id: 'gaming', label: 'Gaming', icon: '🎮' },
    { id: 'education', label: 'Education', icon: '📚' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'news', label: 'News', icon: '📰' },
    { id: 'shopping', label: 'Shopping', icon: '🛍️' },
    { id: 'health', label: 'Health', icon: '🏥' }
  ];
</script>

<div class="flex items-center space-x-2 overflow-x-auto pb-2">
  {#each categories as category}
    <button
      class="px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors"
      class:bg-black={selectedCategory === category.id}
      class:text-white={selectedCategory === category.id}
      class:bg-white={selectedCategory !== category.id}
      class:text-gray-700={selectedCategory !== category.id}
      class:border={selectedCategory !== category.id}
      class:border-gray-300={selectedCategory !== category.id}
      class:hover:bg-gray-50={selectedCategory !== category.id}
      on:click={() => selectedCategory = category.id}
    >
      {#if category.icon}
        <span class="mr-1">{category.icon}</span>
      {/if}
      {category.label}
      {#if category.count}
        <span class="ml-1 text-xs opacity-75">{category.count}</span>
      {/if}
    </button>
  {/each}
</div>