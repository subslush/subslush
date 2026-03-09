<script lang="ts">
  export let selectedCategory = 'all';

  const categories = [
    { id: 'all', label: 'All products', icon: '📁', count: 560 },
    { id: 'streaming', label: 'Streaming', icon: '📺' },
    { id: 'music', label: 'Music', icon: '🎵' },
    { id: 'productivity', label: 'Productivity', icon: '💼' },
    { id: 'design', label: 'Design', icon: '🎨' },
    { id: 'fitness', label: 'Fitness', icon: '💪' },
    { id: 'gaming', label: 'Gaming', icon: '🎮' },
    { id: 'education', label: 'Education', icon: '📚' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'news', label: 'News', icon: '📰' }
  ];
</script>

<div class="flex flex-wrap gap-2 justify-center">
  {#each categories as category}
    <button on:click={() => selectedCategory = category.id}
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors
                   {selectedCategory === category.id
                     ? 'bg-gradient-to-br from-purple-700/[0.08] to-pink-600/[0.08] border border-cyan-200/50 text-gray-900'
                     : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900'}">
      {#if category.icon}
        <span class="mr-2">{category.icon}</span>
      {/if}
      {category.label}
      {#if category.count}
        <span class="ml-1 text-xs opacity-75">({category.count})</span>
      {/if}
    </button>
  {/each}
</div>
