<script lang="ts">
  import { adminService } from '$lib/api/admin.js';

  const MAX_MESSAGE_LENGTH = 2000;

  let message = '';
  let actionMessage = '';
  let actionError = '';
  let isSending = false;

  const resetFeedback = () => {
    actionMessage = '';
    actionError = '';
  };

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const submitAnnouncement = async () => {
    resetFeedback();
    const trimmed = message.trim();
    if (!trimmed) {
      actionError = 'Please enter a notification message.';
      return;
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      actionError = `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
      return;
    }

    if (!confirm('Send this notification to all users?')) {
      return;
    }

    isSending = true;
    try {
      const result = await adminService.sendAnnouncement({ message: trimmed });
      if (typeof result.targetCount === 'number') {
        actionMessage = `Sent to ${result.created} of ${result.targetCount} users.`;
      } else {
        actionMessage = 'Notification sent.';
      }
      message = '';
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to send notification.');
    } finally {
      isSending = false;
    }
  };
</script>

<svelte:head>
  <title>Notification announcements - Admin</title>
  <meta name="description" content="Send an announcement notification to all users." />
</svelte:head>

<div class="space-y-6">
  <section>
    <h1 class="text-2xl font-bold text-gray-900">Notification announcements</h1>
    <p class="text-sm text-gray-600">
      Send a short broadcast message to every user in the system.
    </p>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div>
      <label for="announcement-message" class="text-sm font-semibold text-gray-900">
        Announcement message
      </label>
      <p class="text-xs text-gray-500 mt-1">
        Plain text only. Keep it concise for best visibility.
      </p>
    </div>

    <textarea
      id="announcement-message"
      class="w-full min-h-[140px] rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
      placeholder="Write your notification message here..."
      bind:value={message}
      maxlength={MAX_MESSAGE_LENGTH}
    ></textarea>

    <div class="flex items-center justify-between">
      <p class="text-xs text-gray-500">
        {message.trim().length}/{MAX_MESSAGE_LENGTH}
      </p>
      <button
        type="button"
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        on:click={submitAnnouncement}
        disabled={isSending || !message.trim()}
      >
        {isSending ? 'Sending...' : 'Send notification'}
      </button>
    </div>

    {#if actionMessage}
      <p class="text-sm text-emerald-600">{actionMessage}</p>
    {/if}
    {#if actionError}
      <p class="text-sm text-red-600">{actionError}</p>
    {/if}
  </section>
</div>
