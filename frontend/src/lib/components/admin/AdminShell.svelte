<script lang="ts">
  import AdminSidebar from '$lib/components/admin/AdminSidebar.svelte';
  import AdminTopbar from '$lib/components/admin/AdminTopbar.svelte';
  import type { User } from '$lib/types/auth.js';

  export let user: User | null = null;

  let sidebarOpen = false;

  const closeSidebar = () => {
    sidebarOpen = false;
  };

  const toggleSidebar = () => {
    sidebarOpen = !sidebarOpen;
  };
</script>

<div class="min-h-screen bg-gray-50 text-gray-900">
  <div class="lg:flex">
    <AdminSidebar isOpen={sidebarOpen} onClose={closeSidebar} />

    <div class="flex-1 min-w-0">
      <AdminTopbar {user} onToggle={toggleSidebar} />
      <main class="px-4 py-6 lg:px-8">
        <slot />
      </main>
    </div>
  </div>
</div>
