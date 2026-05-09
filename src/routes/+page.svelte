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

  type ScriptureSearchResult = {
    volume: string;
    book: string;
    chapter: number;
    verse: number;
    reference: string;
    text: string;
  };

  let books: ScriptureBook[] = [];
  let chapter: ScriptureChapter | null = null;
  let errorMessage = '';
  let isLoading = true;
  let isSearching = false;
  let selectedBook = '1 Nephi';
  let selectedChapter = 1;
  let pendingBook = selectedBook;
  let chapterSelect: HTMLSelectElement;
  let searchQuery = '';
  let searchError = '';
  let searchResults: ScriptureSearchResult[] = [];
  let hasSearched = false;

  $: pendingBookInfo = books.find((book) => book.title === pendingBook);
  $: totalVerses = chapter?.verses.length ?? 0;
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
    await loadChapter(nextBook, 1);
    chapterSelect?.focus();
  }

  async function handleChapterChange(event: Event) {
    const nextChapter = Number((event.currentTarget as HTMLSelectElement).value);
    await loadChapter(pendingBook, nextChapter);
  }

  async function handleSearch() {
    const query = searchQuery.trim();
    searchError = '';
    hasSearched = true;

    if (query.length < 2) {
      searchResults = [];
      searchError = 'Enter at least 2 characters.';
      return;
    }

    isSearching = true;

    try {
      searchResults = await invoke<ScriptureSearchResult[]>('search_scriptures', { query });
    } catch (error) {
      searchResults = [];
      searchError = error instanceof Error ? error.message : String(error);
    } finally {
      isSearching = false;
    }
  }

  function clearSearch() {
    searchQuery = '';
    searchError = '';
    searchResults = [];
    hasSearched = false;
  }

  async function openSearchResult(result: ScriptureSearchResult) {
    await loadChapter(result.book, result.chapter);
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
      <span aria-hidden="true">&larr;</span>
    </button>
    <button
      type="button"
      aria-label="Next chapter"
      disabled={chapter.next_chapter === null || isLoading}
      on:click={() => chapter.next_chapter && loadChapter(chapter.book, chapter.next_chapter)}
    >
      <span aria-hidden="true">&rarr;</span>
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
  <aside class="reader-sidebar" aria-label="Reader navigation">
    <form class="reader-toolbar" aria-label="Select scripture chapter">
      <label>
        <span>Book</span>
        <select
          bind:value={pendingBook}
          disabled={isLoading || books.length === 0}
          on:change={handleBookChange}
        >
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
          disabled={isLoading || books.length === 0}
          on:change={handleChapterChange}
        >
          {#each chapterOptions as chapterNumber}
            <option value={chapterNumber}>{chapterNumber}</option>
          {/each}
        </select>
      </label>
    </form>

    <section class="search-panel" aria-label="Search scriptures">
      <form class="search-form" on:submit|preventDefault={handleSearch}>
        <label>
          <span>Search</span>
          <input
            type="search"
            bind:value={searchQuery}
            placeholder="Find words or phrases"
            disabled={isSearching}
          />
        </label>

        <div class="search-actions">
          <button type="submit" disabled={isSearching}>
            {isSearching ? 'Searching' : 'Search'}
          </button>
          <button type="button" class="secondary-button" disabled={isSearching} on:click={clearSearch}>
            Clear
          </button>
        </div>
      </form>

      {#if searchError}
        <p class="search-status" role="alert">{searchError}</p>
      {:else if isSearching}
        <p class="search-status">Searching...</p>
      {:else if hasSearched && searchResults.length === 0}
        <p class="search-status">No results found.</p>
      {:else if searchResults.length > 0}
        <ol class="search-results" aria-label="Search results">
          {#each searchResults as result}
            <li>
              <button type="button" on:click={() => openSearchResult(result)}>
                <span>{result.reference}</span>
                <small>{result.volume}</small>
                <p>{result.text}</p>
              </button>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  </aside>

  <article class="chapter-view" aria-labelledby="chapter-title">
    {#if isLoading}
      <p class="status">Loading chapter...</p>
    {:else if errorMessage}
      <div class="empty-state" role="alert">
        <p class="eyebrow">Database unavailable</p>
        <h1 id="chapter-title">Reader unavailable</h1>
        <p>{errorMessage}</p>
      </div>
    {:else if chapter}
      <header class="chapter-header">
        <div>
          <p class="eyebrow">{chapter.volume}</p>
          <h1 id="chapter-title">{chapter.reference}</h1>
          <p class="chapter-meta">
            <span>{chapter.book}</span>
            <span>Chapter {chapter.chapter}</span>
            <span>{totalVerses} verses</span>
          </p>
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

      <footer class="chapter-footer">
        {@render chapterNav(chapter, 'Chapter navigation')}
      </footer>
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
    color: #1d252d;
    background:
      linear-gradient(180deg, #f5f7f6 0%, #eef2f1 100%);
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    text-rendering: optimizeLegibility;
  }

  .reader-shell {
    display: grid;
    grid-template-columns: minmax(12rem, 14rem) minmax(0, 1fr);
    gap: clamp(1.25rem, 4vw, 2.75rem);
    align-items: start;
    width: min(100%, 1120px);
    margin: 0 auto;
    padding: clamp(1.25rem, 4vw, 3rem);
  }

  .reader-sidebar {
    position: sticky;
    top: clamp(1.25rem, 4vw, 3rem);
    display: grid;
    gap: 0.9rem;
  }

  .reader-toolbar,
  .search-panel {
    display: grid;
    width: 100%;
    padding: 0.8rem;
    border: 1px solid rgba(29, 37, 45, 0.09);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 16px 40px rgba(29, 37, 45, 0.06);
  }

  .reader-toolbar {
    gap: 0.85rem;
  }

  .search-panel,
  .search-form {
    gap: 0.75rem;
  }

  .reader-toolbar label,
  .search-form label {
    display: grid;
    gap: 0.4rem;
    color: #52605b;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .reader-toolbar select,
  .search-form input {
    min-height: 2.55rem;
    width: 100%;
    border: 1px solid rgba(29, 37, 45, 0.12);
    border-radius: 6px;
    padding: 0 2rem 0 0.75rem;
    color: #182127;
    background: #ffffff;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 750;
  }

  .search-form input {
    padding-right: 0.75rem;
    text-transform: none;
  }

  .reader-toolbar select:focus-visible,
  .search-form input:focus-visible,
  .search-actions button:focus-visible,
  .search-results button:focus-visible,
  .chapter-nav button:focus-visible {
    outline: 3px solid rgba(47, 111, 104, 0.2);
    outline-offset: 2px;
  }

  .search-form {
    display: grid;
  }

  .search-actions {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.45rem;
  }

  .search-actions button,
  .search-results button {
    border: 1px solid rgba(29, 37, 45, 0.12);
    border-radius: 6px;
    color: #182127;
    background: #ffffff;
    font: inherit;
    cursor: pointer;
  }

  .search-actions button {
    min-height: 2.35rem;
    padding: 0 0.7rem;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .search-actions button[type='submit'] {
    color: #ffffff;
    border-color: #2f6f68;
    background: #2f6f68;
  }

  .search-actions button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .secondary-button {
    color: #52605b;
  }

  .search-status {
    margin: 0;
    color: #56615c;
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .search-results {
    display: grid;
    gap: 0.55rem;
    max-height: min(42vh, 28rem);
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  }

  .search-results button {
    display: grid;
    gap: 0.18rem;
    width: 100%;
    padding: 0.65rem;
    text-align: left;
    transition:
      border-color 150ms ease,
      background 150ms ease;
  }

  .search-results button:hover {
    border-color: rgba(47, 111, 104, 0.34);
    background: #f5f8f7;
  }

  .search-results span {
    color: #182127;
    font-size: 0.88rem;
    font-weight: 800;
    line-height: 1.25;
  }

  .search-results small {
    color: #6b756f;
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1.25;
    text-transform: uppercase;
  }

  .search-results p {
    display: -webkit-box;
    margin: 0.15rem 0 0;
    overflow: hidden;
    color: #404a45;
    font-size: 0.82rem;
    line-height: 1.42;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .chapter-view {
    min-height: calc(100vh - clamp(2rem, 8vw, 5rem));
    padding: clamp(1.6rem, 5vw, 4.25rem);
    border: 1px solid rgba(29, 37, 45, 0.08);
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 24px 70px rgba(29, 37, 45, 0.08);
  }

  .chapter-header {
    max-width: 760px;
    margin-bottom: clamp(2rem, 5vw, 3.25rem);
    padding-bottom: 1.2rem;
    border-bottom: 1px solid rgba(29, 37, 45, 0.09);
  }

  .eyebrow {
    margin: 0 0 0.55rem;
    color: #2f6f68;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.65rem;
    color: #111820;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(2.4rem, 7vw, 4.75rem);
    font-weight: 700;
    line-height: 0.98;
  }

  .chapter-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.6rem;
    align-items: center;
  }

  .chapter-meta span {
    color: #56615c;
    font-size: 0.94rem;
    line-height: 1.35;
  }

  .chapter-meta span:not(:last-child)::after {
    content: "/";
    margin-left: 0.6rem;
    color: #a6afaa;
  }

  .chapter-header p:last-child,
  .empty-state p:last-child {
    margin-bottom: 0;
    color: #56615c;
    line-height: 1.65;
  }

  .chapter-footer {
    max-width: 760px;
    margin-top: clamp(2.25rem, 5vw, 3.5rem);
    padding-top: 1.15rem;
    border-top: 1px solid rgba(29, 37, 45, 0.09);
  }

  .chapter-nav {
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  .chapter-nav button {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    width: 2.85rem;
    height: 2.85rem;
    border: 1px solid rgba(29, 37, 45, 0.12);
    border-radius: 8px;
    color: #182127;
    background: #fff;
    font: inherit;
    font-size: 1.25rem;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      background 150ms ease,
      transform 150ms ease;
  }

  .chapter-nav button:not(:disabled):hover {
    border-color: rgba(47, 111, 104, 0.34);
    background: #f5f8f7;
    transform: translateY(-1px);
  }

  .chapter-nav button:disabled {
    cursor: default;
    opacity: 0.35;
  }

  .chapter-nav span {
    font-size: 1.2rem;
    line-height: 0;
  }

  .verses {
    display: grid;
    gap: 1rem;
    max-width: 760px;
    font-family: Georgia, "Times New Roman", serif;
  }

  .verses p {
    margin: 0;
    color: #252b31;
    font-size: clamp(1.08rem, 2vw, 1.2rem);
    line-height: 1.86;
  }

  .verses span {
    display: inline-block;
    min-width: 1.7rem;
    margin-right: 0.38rem;
    color: #6b756f;
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

  .status {
    margin-bottom: 0;
    color: #56615c;
    line-height: 1.65;
  }

  @media (max-width: 820px) {
    .reader-shell {
      display: block;
      padding: 0;
    }

    .reader-sidebar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: grid;
      gap: 0;
      padding: 0;
      border-bottom: 1px solid rgba(29, 37, 45, 0.09);
      background: rgba(245, 247, 246, 0.94);
      backdrop-filter: blur(14px);
    }

    .reader-toolbar,
    .search-panel {
      grid-template-columns: minmax(0, 1fr) minmax(5.5rem, 7rem);
      gap: 0.75rem;
      align-items: end;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: transparent;
    }

    .search-panel {
      display: block;
      padding-top: 0;
    }

    .search-results {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      max-height: 14rem;
      margin-top: 0.75rem;
    }

    .chapter-view {
      min-height: 100vh;
      border-width: 0;
      border-radius: 0;
      box-shadow: none;
    }
  }

  @media (max-width: 500px) {
    .reader-toolbar,
    .search-panel {
      grid-template-columns: 1fr;
    }

    .search-results {
      grid-template-columns: 1fr;
    }

    .chapter-nav {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .chapter-nav button {
      width: 100%;
    }
  }
</style>
