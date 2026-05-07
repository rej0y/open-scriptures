<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount, tick } from 'svelte';

  type ChapterVerse = {
    number: number;
    text: string;
  };

  type ScriptureChapter = {
    volume: string;
    book: string;
    chapter: number;
    previous_chapter: number | null;
    next_chapter: number | null;
    reference: string;
    verses: ChapterVerse[];
  };

  type ScriptureBook = {
    title: string;
    volume: string;
    chapter_count: number;
  };

  let books: ScriptureBook[] = [];
  let chapter: ScriptureChapter | null = null;
  let errorMessage = '';
  let isLoading = true;
  let selectedBook = '1 Nephi';
  let selectedChapter = 1;
  let pendingBook = selectedBook;
  let chapterSelect: HTMLSelectElement;

  $: pendingBookInfo = books.find((book) => book.title === pendingBook);
  $: chapterOptions = Array.from(
    { length: pendingBookInfo?.chapter_count ?? chapter?.chapter ?? 1 },
    (_, index) => index + 1
  );

  async function loadChapter(bookTitle = selectedBook, chapterNumber = selectedChapter) {
    isLoading = true;
    errorMessage = '';
    selectedBook = bookTitle;
    pendingBook = bookTitle;
    selectedChapter = chapterNumber;

    try {
      chapter = await invoke<ScriptureChapter>('get_chapter', {
        book: bookTitle,
        chapterNumber
      });
      selectedBook = chapter.book;
      selectedChapter = chapter.chapter;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      isLoading = false;
    }
  }

  async function handleBookChange(event: Event) {
    const nextBook = (event.currentTarget as HTMLSelectElement).value;
    const nextBookInfo = books.find((book) => book.title === nextBook);
    pendingBook = nextBook;
    selectedChapter = Math.min(selectedChapter, nextBookInfo?.chapter_count ?? selectedChapter);
    await tick();
    chapterSelect?.focus();
  }

  async function handleChapterChange(event: Event) {
    const nextChapter = Number((event.currentTarget as HTMLSelectElement).value);
    await loadChapter(pendingBook, nextChapter);
  }

  onMount(async () => {
    try {
      books = await invoke<ScriptureBook[]>('list_books');
      await loadChapter(selectedBook, selectedChapter);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      isLoading = false;
    }
  });
</script>

{#snippet chapterNav(chapter: ScriptureChapter, label: string)}
  <nav class="chapter-nav" aria-label={label}>
    <button
      type="button"
      aria-label="Previous chapter"
      disabled={chapter.previous_chapter === null || isLoading}
      on:click={() =>
        chapter.previous_chapter && loadChapter(chapter.book, chapter.previous_chapter)}
    >
      &larr;
    </button>
    <button
      type="button"
      aria-label="Next chapter"
      disabled={chapter.next_chapter === null || isLoading}
      on:click={() => chapter.next_chapter && loadChapter(chapter.book, chapter.next_chapter)}
    >
      &rarr;
    </button>
  </nav>
{/snippet}

<svelte:head>
  <title>Open Scriptures</title>
  <meta
    name="description"
    content="A local-first scripture reader built with Tauri, SvelteKit, and SQLite."
  />
</svelte:head>

<main class="reader-shell">
  {#if chapter}
    <form class="reader-toolbar" aria-label="Select scripture chapter">
      <label>
        <span>Book</span>
        <select bind:value={pendingBook} disabled={isLoading} on:change={handleBookChange}>
          {#each books as book}
            <option value={book.title}>{book.title}</option>
          {/each}
        </select>
      </label>

      <label>
        <span>Chapter</span>
        <select
          bind:this={chapterSelect}
          bind:value={selectedChapter}
          disabled={isLoading}
          on:change={handleChapterChange}
        >
          {#each chapterOptions as chapterNumber}
            <option value={chapterNumber}>{chapterNumber}</option>
          {/each}
        </select>
      </label>
    </form>
  {/if}

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
        <div>
          <p class="eyebrow">{chapter.volume}</p>
          <h1 id="chapter-title">{chapter.reference}</h1>
          <p>{chapter.book}, chapter {chapter.chapter}</p>
        </div>
      </header>

      <div class="verses" aria-label={`${chapter.reference} verses`}>
        {#each chapter.verses as verse}
          <p>
            <span>{verse.number}</span>
            {verse.text}
          </p>
        {/each}
      </div>

      {@render chapterNav(chapter, 'Chapter navigation')}
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

  .reader-toolbar {
    display: inline-flex;
    gap: 0.75rem;
    align-items: end;
    margin-bottom: 0.9rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid rgba(32, 36, 43, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 252, 0.74);
    box-shadow: 0 12px 34px rgba(32, 36, 43, 0.06);
    backdrop-filter: blur(12px);
  }

  .reader-toolbar label {
    display: grid;
    gap: 0.3rem;
    color: #68705f;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .reader-toolbar label:first-child {
    min-width: min(13rem, 52vw);
  }

  .reader-toolbar label:last-child {
    width: 6rem;
  }

  .reader-toolbar select {
    min-height: 2.2rem;
    width: 100%;
    border: 1px solid rgba(32, 36, 43, 0.14);
    border-radius: 6px;
    padding: 0 1.8rem 0 0.65rem;
    color: #20242b;
    background: rgba(255, 255, 252, 0.9);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 700;
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
    max-width: 760px;
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

  .chapter-nav {
    display: flex;
    gap: 0.5rem;
    position: fixed;
    right: clamp(1rem, 3vw, 2rem);
    bottom: clamp(1rem, 3vw, 2rem);
    z-index: 10;
    padding: 0.35rem;
    border: 1px solid rgba(32, 36, 43, 0.12);
    border-radius: 999px;
    background: rgba(255, 255, 252, 0.78);
    box-shadow: 0 14px 36px rgba(32, 36, 43, 0.12);
    backdrop-filter: blur(14px);
  }

  .chapter-nav button {
    display: grid;
    place-items: center;
    width: 2.65rem;
    height: 2.65rem;
    border: 1px solid rgba(32, 36, 43, 0.16);
    border-radius: 999px;
    color: #20242b;
    background: rgba(255, 255, 252, 0.72);
    font: inherit;
    font-size: 1.25rem;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }

  .chapter-nav button:disabled {
    cursor: default;
    opacity: 0.35;
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
    .reader-toolbar {
      width: 100%;
      flex-wrap: wrap;
      margin-bottom: 0;
    }
  }
</style>
