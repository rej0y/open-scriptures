<script lang="ts">
  import type {
    ChapterBookmark,
    SavedHighlight,
    ScriptureBook,
    ScriptureSearchResult
  } from '$lib/study';

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

  <section class="search-panel" aria-label="Search scriptures">
    <form class="search-form" on:submit|preventDefault={onSearch}>
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
        <button type="button" class="secondary-button" disabled={isSearching} on:click={onClearSearch}>
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

  <section class="bookmark-panel" aria-label="Chapter bookmarks">
    <div class="panel-heading">
      <h2>Bookmarks</h2>
      <span>{bookmarks.length}</span>
    </div>

    <form class="bookmark-form" on:submit|preventDefault={onSaveBookmark}>
      <label>
        <span>Title</span>
        <input
          type="text"
          bind:value={bookmarkTitle}
          placeholder="Name this chapter"
          disabled={isSavingBookmark}
        />
      </label>

      <button type="submit" disabled={isSavingBookmark || bookmarkTitle.trim().length === 0}>
        {isSavingBookmark ? 'Saving' : 'Save chapter'}
      </button>
    </form>

    {#if bookmarkError}
      <p class="panel-status" role="alert">{bookmarkError}</p>
    {:else if isLoadingBookmarks}
      <p class="panel-status">Loading bookmarks...</p>
    {:else if bookmarks.length === 0}
      <p class="panel-status">No chapter bookmarks yet.</p>
    {:else}
      <ol class="bookmark-list" aria-label="Chapter bookmarks">
        {#each bookmarks as bookmark}
          <li>
            <button type="button" class="bookmark-link" on:click={() => onOpenBookmark(bookmark)}>
              <span>{bookmark.title}</span>
              <small>{bookmark.reference}</small>
            </button>
            <button
              type="button"
              class="remove-bookmark-button"
              aria-label="Remove bookmark"
              on:click|stopPropagation={() => onRemoveBookmark(bookmark)}
            >
              Remove
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
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
  .search-panel,
  .saved-panel {
    display: grid;
    min-width: 0;
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
  .search-form,
  .saved-panel {
    gap: 0.75rem;
  }

  .reader-toolbar label,
  .search-form label {
    display: grid;
    min-width: 0;
    gap: 0.4rem;
    color: #52605b;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .reader-toolbar select,
  .search-form input {
    min-width: 0;
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
  .open-highlights-button:focus-visible {
    outline: 3px solid rgba(47, 111, 104, 0.2);
    outline-offset: 2px;
  }

  .search-form {
    display: grid;
    min-width: 0;
  }

  .search-actions {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto);
    gap: 0.45rem;
  }

  .search-actions button,
  .search-results button,
  .open-highlights-button {
    border: 1px solid rgba(29, 37, 45, 0.12);
    border-radius: 6px;
    color: #182127;
    background: #ffffff;
    font: inherit;
    cursor: pointer;
  }

  .search-actions button {
    min-width: 0;
    min-height: 2.35rem;
    padding: 0 0.7rem;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .open-highlights-button {
    width: 100%;
    min-width: 0;
    min-height: 2.35rem;
    color: #ffffff;
    border-color: #2f6f68;
    background: #2f6f68;
    font-size: 0.82rem;
    font-weight: 850;
  }

  .search-actions button[type='submit'] {
    color: #ffffff;
    border-color: #2f6f68;
    background: #2f6f68;
  }

  .bookmark-panel {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    width: 100%;
    padding: 0.8rem;
    border: 1px solid rgba(29, 37, 45, 0.09);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 16px 40px rgba(29, 37, 45, 0.06);
  }

  .search-actions button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .secondary-button {
    color: #52605b;
  }

  .search-status,
  .panel-status {
    margin: 0;
    color: #56615c;
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .panel-heading {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    justify-content: space-between;
  }

  .panel-heading h2 {
    margin: 0;
    color: #182127;
    font-size: 0.82rem;
    font-weight: 850;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .panel-heading span {
    display: inline-grid;
    min-width: 1.65rem;
    min-height: 1.65rem;
    place-items: center;
    border-radius: 999px;
    color: #ffffff;
    background: #2f6f68;
    font-size: 0.72rem;
    font-weight: 850;
    line-height: 1;
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

  .search-results li {
    min-width: 0;
  }

  .bookmark-form {
    display: grid;
    gap: 0.55rem;
  }

  .bookmark-form label {
    display: grid;
    gap: 0.4rem;
    color: #52605b;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .bookmark-form input {
    min-width: 0;
    min-height: 2.55rem;
    width: 100%;
    border: 1px solid rgba(29, 37, 45, 0.12);
    border-radius: 6px;
    padding: 0 0.75rem;
    color: #182127;
    background: #ffffff;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 750;
  }

  .bookmark-form input:focus-visible,
  .bookmark-form button:focus-visible,
  .bookmark-link:focus-visible,
  .remove-bookmark-button:focus-visible {
    outline: 3px solid rgba(47, 111, 104, 0.2);
    outline-offset: 2px;
  }

  .bookmark-form button {
    min-width: 0;
    min-height: 2.35rem;
    padding: 0 0.7rem;
    border: 1px solid #2f6f68;
    border-radius: 6px;
    color: #ffffff;
    background: #2f6f68;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 800;
    cursor: pointer;
  }

  .bookmark-form button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .bookmark-list {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bookmark-list li {
    display: grid;
    gap: 0.35rem;
    padding: 0.65rem 0;
    border-top: 1px solid rgba(29, 37, 45, 0.08);
  }

  .bookmark-link {
    display: grid;
    gap: 0.18rem;
    width: 100%;
    min-width: 0;
    border: 0;
    border-radius: 6px;
    padding: 0.2rem 0.3rem;
    color: #252b31;
    background: transparent;
    font: inherit;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .bookmark-link:hover {
    background: rgba(47, 111, 104, 0.08);
  }

  .bookmark-link span {
    color: #182127;
    font-size: 0.88rem;
    font-weight: 800;
    line-height: 1.25;
  }

  .bookmark-link {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1rem;
    line-height: 1.45;
  }

  .bookmark-link small {
    color: #6b756f;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 0.72rem;
    font-weight: 850;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .remove-bookmark-button {
    justify-self: start;
    border: 0;
    border-radius: 6px;
    padding: 0.3rem 0.45rem;
    color: #52605b;
    background: transparent;
    font: inherit;
    font-size: 0.74rem;
    font-weight: 850;
    line-height: 1;
    cursor: pointer;
  }

  .remove-bookmark-button:hover {
    background: rgba(47, 111, 104, 0.08);
  }

  .search-results li {
    min-width: 0;
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

  .search-results button span {
    color: #182127;
    font-size: 0.88rem;
    font-weight: 800;
    line-height: 1.25;
  }

  .search-results button small {
    color: #6b756f;
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1.25;
    text-transform: uppercase;
  }

  .search-results button p {
    margin: 0;
    color: #404a45;
    font-size: 0.82rem;
    line-height: 1.42;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    margin-top: 0.15rem;
  }

  .search-results button:hover,
  .open-highlights-button:hover {
    background: rgba(47, 111, 104, 0.08);
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
    .search-panel,
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

    .search-results {
      max-height: min(28vh, 14rem);
      margin-top: 0.75rem;
    }
  }

  @media (max-width: 500px) {
    .reader-sidebar {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .reader-toolbar,
    .search-panel,
    .saved-panel {
      grid-template-columns: 1fr;
    }

    .search-results {
      grid-template-columns: 1fr;
    }
  }
</style>
