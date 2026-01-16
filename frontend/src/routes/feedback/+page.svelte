<script lang="ts">
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import { apiClient } from '$lib/api/client.js';
  import { API_ENDPOINTS } from '$lib/utils/constants.js';

  const MIN_WORDS = 30;
  const MAX_WORDS = 3000;

  let topic = 'bug';
  let email = '';
  let message = '';
  let isSubmitting = false;
  let submitError = '';
  let submitSuccess = '';

  const countWords = (value: string): number => {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  };

  const limitWords = (value: string): string => {
    const matches = value.match(/\S+\s*/g);
    if (!matches || matches.length <= MAX_WORDS) {
      return value;
    }
    return matches.slice(0, MAX_WORDS).join('').trimEnd();
  };

  const handleMessageInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement;
    const limited = limitWords(target.value);
    if (limited !== target.value) {
      target.value = limited;
    }
    message = limited;
  };

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const getStatusCode = (error: unknown): number | null => {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const statusValue = (error as { statusCode?: unknown }).statusCode;
      if (typeof statusValue === 'number') {
        return statusValue;
      }
    }
    return null;
  };

  $: wordCount = countWords(message);
  $: canSubmit =
    !isSubmitting &&
    email.trim().length > 0 &&
    wordCount >= MIN_WORDS &&
    wordCount <= MAX_WORDS;

  const handleSubmit = async () => {
    submitError = '';
    submitSuccess = '';

    if (!email.trim()) {
      submitError = 'Email is required.';
      return;
    }

    if (wordCount < MIN_WORDS) {
      submitError = `Please enter at least ${MIN_WORDS} words.`;
      return;
    }

    if (wordCount > MAX_WORDS) {
      submitError = `Please keep your message within ${MAX_WORDS} words.`;
      return;
    }

    isSubmitting = true;
    try {
      await apiClient.post(API_ENDPOINTS.BIS.SUBMIT, {
        email: email.trim(),
        topic,
        message: message.trim(),
      });
      submitSuccess = 'Thanks for the report. We appreciate the help.';
      message = '';
      email = '';
      topic = 'bug';
    } catch (error) {
      if (getStatusCode(error) === 429) {
        submitError =
          'You have submitted too many inquiries in a short amount of time. Please try again in one hour.';
      } else {
        submitError = getErrorMessage(error, 'Failed to send your report. Please try again.');
      }
    } finally {
      isSubmitting = false;
    }
  };
</script>

<svelte:head>
  <title>Report a Bug or Suggestion - SubSlush</title>
  <meta
    name="description"
    content="Report bugs, issues, or improvement suggestions for the SubSlush Marketplace beta."
  />
</svelte:head>

<div class="min-h-screen bg-white">
  <HomeNav />

  <section class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div class="space-y-4">
      <h1 class="text-3xl font-bold text-gray-900">Beta feedback</h1>
      <p class="text-sm text-gray-600">
        Thanks for helping us improve. Please be as clear as possible when describing issues so we can
        reproduce them. For suggestions, explain the improvement you want and why it matters.
      </p>
    </div>

    <form class="mt-8 space-y-6" on:submit|preventDefault={handleSubmit}>
      <div class="grid gap-4 md:grid-cols-2">
        <label class="space-y-2 text-sm font-semibold text-gray-900">
          Topic
          <select
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
            bind:value={topic}
          >
            <option value="bug">Bug</option>
            <option value="issue">Issue</option>
            <option value="suggestion">Suggestion for improvement</option>
          </select>
        </label>

        <label class="space-y-2 text-sm font-semibold text-gray-900">
          Email
          <input
            type="email"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
            placeholder="you@example.com"
            bind:value={email}
            required
          />
        </label>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-semibold text-gray-900" for="bis-message">Details</label>
        <p class="text-xs text-gray-500">
          Be specific about what happened, when it happened, and how to reproduce it. For suggestions,
          share the outcome you want us to achieve.
        </p>
        <textarea
          id="bis-message"
          class="w-full min-h-[220px] rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          placeholder="Write your report or suggestion here..."
          bind:value={message}
          on:input={handleMessageInput}
          required
        ></textarea>
        <div class="flex items-center justify-between text-xs text-gray-500">
          <span>{wordCount}/{MAX_WORDS} words</span>
          <span>
            {#if wordCount < MIN_WORDS}
              {MIN_WORDS - wordCount} words to minimum
            {:else}
              Ready to send
            {/if}
          </span>
        </div>
      </div>

      {#if submitError}
        <p class="text-sm text-red-600">{submitError}</p>
      {/if}
      {#if submitSuccess}
        <p class="text-sm text-green-600">{submitSuccess}</p>
      {/if}

      <div class="flex items-center justify-end">
        <button
          type="submit"
          class="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={!canSubmit}
        >
          {isSubmitting ? 'Sending...' : 'Submit feedback'}
        </button>
      </div>
    </form>
  </section>

  <Footer />
</div>
