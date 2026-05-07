<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';

  type ChapterVerse = {
    number: number;
    text: string;
  };

  type ScriptureChapter = {
    volume: string;
    book: string;
    chapter: number;
    reference: string;
    verses: ChapterVerse[];
  };

  let chapter: ScriptureChapter | null = null;
  let errorMessage = '';
  let isLoading = true;

  onMount(async () => {
    try {
      chapter = await invoke<ScriptureChapter>('get_example_chapter');
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      isLoading = false;
    }
  });
</script>

<svelte:head>
  <title>Open Scriptures</title>
  <meta
    name="description"
    content="A local-first scripture reader built with Tauri, SvelteKit, and SQLite."
  />
</svelte:head>

<main class="reader-shell">
  <article class="chapter-view" aria-labelledby="chapter-title">
    {#if isLoading}
      <p class="status">Loading chapter...</p>
    {:else if errorMessage}
      <div class="empty-state" role="alert">
        <p class="eyebrow">Database unavailable</p>
        <h1 id="chapter-title">Open Scriptures</h1>
        <p>{errorMessage}</p>
      </div>
    {:else if chapter}
      <header class="chapter-header">
        <p class="eyebrow">{chapter.volume}</p>
        <h1 id="chapter-title">{chapter.reference}</h1>
        <p>{chapter.book}, chapter {chapter.chapter}</p>
      </header>

      <div class="verses" aria-label={`${chapter.reference} verses`}>
        {#each chapter.verses as verse}
          <p>
            <span>{verse.number}</span>
            {verse.text}
          </p>
        {/each}
      </div>
    {/if}
  </article>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
    color: #20242b;
    background:
      linear-gradient(135deg, rgba(50, 88, 101, 0.12), transparent 36%),
      linear-gradient(225deg, rgba(151, 98, 65, 0.12), transparent 42%),
      #f8f7f1;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .reader-shell {
    width: min(100%, 980px);
    margin: 0 auto;
    padding: clamp(1.25rem, 4vw, 3rem);
  }

  .chapter-view {
    min-height: calc(100vh - clamp(2.5rem, 8vw, 6rem));
    padding: clamp(1.5rem, 5vw, 4rem);
    border: 1px solid rgba(32, 36, 43, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 252, 0.82);
    box-shadow: 0 22px 70px rgba(32, 36, 43, 0.08);
  }

  .chapter-header {
    max-width: 720px;
    margin-bottom: clamp(2rem, 5vw, 3.5rem);
    padding-bottom: 1.25rem;
    border-bottom: 1px solid rgba(32, 36, 43, 0.12);
  }

  .eyebrow {
    margin: 0 0 0.55rem;
    color: #486254;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.65rem;
    color: #171b21;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(2.45rem, 8vw, 5rem);
    font-weight: 700;
    line-height: 1;
  }

  .chapter-header p:last-child,
  .empty-state p:last-child,
  .status {
    margin-bottom: 0;
    color: #5b626b;
    line-height: 1.65;
  }

  .verses {
    display: grid;
    gap: 1.05rem;
    max-width: 760px;
    font-family: Georgia, "Times New Roman", serif;
  }

  .verses p {
    margin: 0;
    color: #262a30;
    font-size: clamp(1.08rem, 2vw, 1.25rem);
    line-height: 1.85;
  }

  .verses span {
    display: inline-block;
    min-width: 1.65rem;
    margin-right: 0.35rem;
    color: #7a624b;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 0.72em;
    font-weight: 800;
    line-height: 1;
    transform: translateY(-0.08em);
  }

  .empty-state,
  .status {
    max-width: 620px;
  }

  @media (max-width: 640px) {
    .reader-shell {
      padding: 0;
    }

    .chapter-view {
      min-height: 100vh;
      border-width: 0;
      border-radius: 0;
      box-shadow: none;
    }
  }
</style>
