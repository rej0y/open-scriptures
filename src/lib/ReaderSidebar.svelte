<script lang="ts">
  import type {
    ChapterBookmark,
    SavedHighlight,
    ScriptureBook,
    ScriptureSearchResult
  } from '$lib/study';
  import BookmarkPanel from '$lib/BookmarkPanel.svelte';
  import SearchPanel from '$lib/SearchPanel.svelte';

  export let books: ScriptureBook[] = [];
  export let pendingBook = '';
  export let selectedChapter = 1;
  export let isLoading = false;
  export let isSearching = false;
  export let searchQuery = '';
  export let searchError = '';
  export let searchResults: ScriptureSearchResult[] = [];
  export let hasSearched = false;
  export let chapterOptions: number[] = [];
  export let bookmarks: ChapterBookmark[] = [];
  export let bookmarkTitle = '';
  export let bookmarkError = '';
  export let isLoadingBookmarks = false;
  export let isSavingBookmark = false;
  export let savedHighlights: SavedHighlight[] = [];
  export let isSavingSelection = false;
  export let isLoadingSavedWords = false;
  export let savedWordsError = '';
  export let onBookChange = async (_event: Event) => {};
  export let onChapterChange = async (_event: Event) => {};
  export let onSearch = async () => {};
  export let onClearSearch = () => {};
  export let openSearchResult = async (_result: ScriptureSearchResult) => {};
  export let openHighlightsDrawer = () => {};
  export let onSaveBookmark = async () => {};
  export let onOpenBookmark = async (_bookmark: ChapterBookmark) => {};
  export let onRemoveBookmark = async (_bookmark: ChapterBookmark) => {};

  let chapterSelect: HTMLSelectElement;

  async function handleBookChange(event: Event) {
    await onBookChange(event);
    chapterSelect?.focus();
  }
</script>

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
        on:change={onChapterChange}
      >
        {#each chapterOptions as chapterNumber}
          <option value={chapterNumber}>{chapterNumber}</option>
        {/each}
      </select>
    </label>
  </form>

  <SearchPanel
    bind:searchQuery
    isSearching={isSearching}
    searchError={searchError}
    searchResults={searchResults}
    hasSearched={hasSearched}
    onSearch={onSearch}
    onClearSearch={onClearSearch}
    openSearchResult={openSearchResult}
  />

  <section class="saved-panel" aria-label="Saved highlights">
    <div class="panel-heading">
      <h2>Highlights</h2>
      <span>{savedHighlights.length}</span>
    </div>

    {#if savedWordsError}
      <p class="panel-status" role="alert">{savedWordsError}</p>
    {:else if isSavingSelection}
      <p class="panel-status">Saving highlight...</p>
    {:else if isLoadingSavedWords}
      <p class="panel-status">Loading saved words...</p>
    {:else if savedHighlights.length === 0}
      <p class="panel-status">No saved words yet.</p>
    {/if}

    <button
      type="button"
      class="open-highlights-button"
      disabled={savedHighlights.length === 0}
      on:click|stopPropagation={openHighlightsDrawer}
    >
      Open highlights
    </button>
  </section>

  <BookmarkPanel
    bind:bookmarkTitle
    bookmarks={bookmarks}
    bookmarkError={bookmarkError}
    isLoadingBookmarks={isLoadingBookmarks}
    isSavingBookmark={isSavingBookmark}
    onSaveBookmark={onSaveBookmark}
    onOpenBookmark={onOpenBookmark}
    onRemoveBookmark={onRemoveBookmark}
  />
</aside>

<style>
  .reader-sidebar {
    position: sticky;
    top: var(--sticky-inset);
    z-index: 10;
    display: grid;
    align-content: start;
    min-width: 0;
    width: 100%;
    max-width: calc(100vw - (var(--sticky-inset) * 2));
    max-height: var(--sticky-panel-max-height);
    gap: 0.9rem;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .reader-toolbar,
  .saved-panel {
    display: grid;
    min-width: 0;
    width: 100%;
    padding: 0.95rem;
    border: 1px solid var(--panel-border-color);
    border-radius: 8px;
    background: var(--panel-surface);
    box-shadow: var(--panel-shadow);
  }

  .reader-toolbar {
    gap: 0.85rem;
  }

  .saved-panel {
    gap: 0.75rem;
  }

  .panel-heading {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    justify-content: space-between;
  }

  .panel-heading h2 {
    margin: 0;
    color: var(--panel-title-color);
    font-size: var(--panel-title-size);
    font-weight: var(--panel-title-weight);
    line-height: var(--panel-title-line-height);
    letter-spacing: var(--panel-title-letter-spacing);
    text-transform: var(--panel-title-transform);
  }

  .panel-heading span {
    display: inline-grid;
    min-width: 1.65rem;
    min-height: 1.65rem;
    place-items: center;
    border-radius: 999px;
    color: #ffffff;
    background: var(--accent-color);
    font-size: 0.72rem;
    font-weight: 850;
    line-height: 1;
  }

  .reader-toolbar label {
    display: grid;
    min-width: 0;
    gap: 0.4rem;
    color: var(--panel-title-color);
    font-size: var(--panel-title-size);
    font-weight: var(--panel-title-weight);
    line-height: var(--panel-title-line-height);
    letter-spacing: var(--panel-title-letter-spacing);
    text-transform: var(--panel-title-transform);
  }

  .reader-toolbar select {
    min-width: 0;
    min-height: 2.55rem;
    width: 100%;
    border: 1px solid var(--control-border-color);
    border-radius: 6px;
    padding: 0 2rem 0 0.75rem;
    color: var(--panel-text-color);
    background: var(--control-surface);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 750;
  }

  .reader-toolbar select:focus-visible,
  .open-highlights-button:focus-visible {
    outline: 3px solid var(--accent-color-muted);
    outline-offset: 2px;
  }

  .open-highlights-button {
    width: 100%;
    min-width: 0;
    min-height: 2.35rem;
    border: 1px solid var(--accent-color);
    border-radius: 6px;
    color: #ffffff;
    background: linear-gradient(180deg, var(--accent-color), #276a62);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 850;
    cursor: pointer;
  }

  .open-highlights-button:hover {
    background: linear-gradient(180deg, var(--accent-color-hover), #214f49);
  }

  .open-highlights-button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  @media (max-width: 900px) {
    .reader-sidebar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: auto;
      z-index: 10;
      display: grid;
      align-content: start;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.75rem;
      width: 100%;
      max-width: none;
      padding: 0;
      border-bottom: 1px solid rgba(29, 37, 45, 0.09);
      background: rgba(245, 247, 246, 0.94);
      backdrop-filter: blur(14px);
      max-height: calc(100dvh - env(safe-area-inset-bottom, 0px));
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    .reader-toolbar,
    .saved-panel {
      gap: 0.75rem;
      align-items: end;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: transparent;
    }

    .reader-toolbar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 500px) {
    .reader-sidebar {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .reader-toolbar,
    .saved-panel {
      grid-template-columns: 1fr;
    }
  }
</style>
