<script lang="ts">
  import { onMount } from 'svelte';
  import ChapterView from '$lib/ChapterView.svelte';
  import HighlightsDrawer from '$lib/HighlightsDrawer.svelte';
  import ReaderSidebar from '$lib/ReaderSidebar.svelte';
  import {
    type ChapterBookmark,
    highlightId,
    highlightKey,
    type SavedHighlight,
    type SavedWord,
    type ScriptureBook,
    type ScriptureChapter,
    type ScriptureSearchResult,
    type SelectionPart
  } from '$lib/study';
  import {
    loadBooks,
    loadChapter as fetchChapter,
    loadBookmarks as fetchBookmarks,
    loadSavedWords as fetchSavedWords,
    removeSavedHighlight as removeSavedHighlightRemote,
    removeBookmark as removeBookmarkRemote,
    removeSavedWord as removeSavedWordRemote,
    saveBookmark as saveBookmarkRemote,
    searchScriptures
  } from '$lib/readerData';
  import {
    getSelectedVerseParts,
    persistSelection,
    removeSavedHighlightLocally,
    removeSavedWordLocally
  } from '$lib/readerSelection';
  import { createReaderActions } from '$lib/readerActions';
  import { deriveReaderViewState, verseSegmentsForChapter } from '$lib/readerView';
  import { cloneVisibleChapter } from '$lib/readerPage';
  import { shouldCloseHighlightsDrawer } from '$lib/readerDrawer';
  import { createReaderStateAdapter } from '$lib/readerStateAdapter';
  import { invoke } from '$lib/tauriBridge';

  let books: ScriptureBook[] = [];
  let chapter: ScriptureChapter | null = null;
  let errorMessage = '';
  let isLoading = true;
  let isSearching = false;
  let isLoadingSavedWords = false;
  let isSavingSelection = false;
  let selectedBook = '1 Nephi';
  let selectedChapter = 1;
  let pendingBook = selectedBook;
  let searchQuery = '';
  let searchError = '';
  let searchResults: ScriptureSearchResult[] = [];
  let hasSearched = false;
  let pendingSelectionParts: SelectionPart[] = [];
  let isHighlightsDrawerOpen = false;
  let bookmarks: ChapterBookmark[] = [];
  let bookmarkTitle = '';
  let bookmarkError = '';
  let isLoadingBookmarks = false;
  let isSavingBookmark = false;
  let activeHighlightId = '';
  let savedWords: SavedWord[] = [];
  let savedHighlights: SavedHighlight[] = [];
  let savedWordsError = '';

  const readerState = createReaderStateAdapter({
    books: [() => books, (value) => (books = value)],
    chapter: [() => chapter, (value) => (chapter = value)],
    errorMessage: [() => errorMessage, (value) => (errorMessage = value)],
    isLoading: [() => isLoading, (value) => (isLoading = value)],
    selectedBook: [() => selectedBook, (value) => (selectedBook = value)],
    selectedChapter: [() => selectedChapter, (value) => (selectedChapter = value)],
    pendingBook: [() => pendingBook, (value) => (pendingBook = value)],
    searchQuery: [() => searchQuery, (value) => (searchQuery = value)],
    searchError: [() => searchError, (value) => (searchError = value)],
    searchResults: [() => searchResults, (value) => (searchResults = value)],
    hasSearched: [() => hasSearched, (value) => (hasSearched = value)],
    isSearching: [() => isSearching, (value) => (isSearching = value)],
    isLoadingSavedWords: [() => isLoadingSavedWords, (value) => (isLoadingSavedWords = value)],
    savedWordsError: [() => savedWordsError, (value) => (savedWordsError = value)],
    savedWords: [() => savedWords, (value) => (savedWords = value)],
    bookmarks: [() => bookmarks, (value) => (bookmarks = value)],
    bookmarkTitle: [() => bookmarkTitle, (value) => (bookmarkTitle = value)],
    bookmarkError: [() => bookmarkError, (value) => (bookmarkError = value)],
    isLoadingBookmarks: [() => isLoadingBookmarks, (value) => (isLoadingBookmarks = value)],
    isSavingBookmark: [() => isSavingBookmark, (value) => (isSavingBookmark = value)],
    isSavingSelection: [() => isSavingSelection, (value) => (isSavingSelection = value)],
    pendingSelectionParts: [
      () => pendingSelectionParts,
      (value) => (pendingSelectionParts = value)
    ]
  });

  const readerActions = createReaderActions(readerState, {
    invoke,
    loadBooks,
    loadChapter: fetchChapter,
    searchScriptures,
    loadBookmarks: fetchBookmarks,
    loadSavedWords: fetchSavedWords,
    removeSavedWordRemote,
    removeSavedHighlightRemote,
    saveBookmarkRemote,
    removeBookmarkRemote,
    persistSelection,
    getSelectedVerseParts,
    removeSavedWordLocally,
    removeSavedHighlightLocally,
    refreshVisibleChapter,
    queryVerseElement: (verseKey: string) =>
      document.querySelector<HTMLElement>(`[data-verse-key="${CSS.escape(verseKey)}"]`),
    getSelection: () => document.getSelection(),
    scrollHighlightIntoView: (selector: string) =>
      document.querySelector<HTMLElement>(selector)?.scrollIntoView({
        behavior: 'instant',
        block: 'center'
      })
  });

  $: ({
    totalVerses,
    savedWordsByVerse,
    savedHighlights,
    chapterOptions
  } = deriveReaderViewState(books, pendingBook, chapter, savedWords));

  function refreshVisibleChapter() {
    chapter = cloneVisibleChapter(chapter);
  }

  function closeHighlightsOnOutsideClick(event: MouseEvent) {
    if (isHighlightsDrawerOpen && shouldCloseHighlightsDrawer(event)) {
      isHighlightsDrawerOpen = false;
    }
  }

  function openHighlightsDrawer() {
    isHighlightsDrawerOpen = true;
  }

  function closeHighlightsDrawer() {
    isHighlightsDrawerOpen = false;
  }

  onMount(async () => {
    try {
      await readerActions.bootstrap(selectedBook, selectedChapter);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
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

<svelte:document on:selectionchange={readerActions.updatePendingSelection} />
<svelte:window
  on:click={closeHighlightsOnOutsideClick}
  on:pointerup={readerActions.saveCurrentSelectionSoon}
  on:mouseup={readerActions.saveCurrentSelectionSoon}
  on:touchend={readerActions.saveCurrentSelectionSoon}
/>

<main class:reader-shell-highlights-open={isHighlightsDrawerOpen} class="reader-shell">
  <ReaderSidebar
    bind:pendingBook
    bind:selectedChapter
    bind:bookmarkTitle
    books={books}
    isLoading={isLoading}
    isSearching={isSearching}
    searchQuery={searchQuery}
    searchError={searchError}
    searchResults={searchResults}
    hasSearched={hasSearched}
    chapterOptions={chapterOptions}
    bookmarks={bookmarks}
    bookmarkError={bookmarkError}
    isLoadingBookmarks={isLoadingBookmarks}
    isSavingBookmark={isSavingBookmark}
    savedHighlights={savedHighlights}
    isSavingSelection={isSavingSelection}
    isLoadingSavedWords={isLoadingSavedWords}
    savedWordsError={savedWordsError}
    onBookChange={readerActions.handleBookChange}
    onChapterChange={readerActions.handleChapterChange}
    onSearch={readerActions.handleSearch}
    onClearSearch={readerActions.clearSearch}
    openSearchResult={readerActions.openSearchResult}
    openHighlightsDrawer={openHighlightsDrawer}
    onSaveBookmark={readerActions.saveCurrentBookmark}
    onOpenBookmark={readerActions.openBookmark}
    onRemoveBookmark={readerActions.removeBookmark}
  />

  <ChapterView
    bind:activeHighlightId
    chapter={chapter}
    isLoading={isLoading}
    errorMessage={errorMessage}
    totalVerses={totalVerses}
    verseSegments={(verse) => verseSegmentsForChapter(chapter, verse, savedWordsByVerse)}
    highlightId={highlightId}
    highlightKey={highlightKey}
    onPreviousChapter={() => chapter?.previous_chapter && readerActions.openChapter(chapter.book, chapter.previous_chapter)}
    onNextChapter={() => chapter?.next_chapter && readerActions.openChapter(chapter.book, chapter.next_chapter)}
  />

  <HighlightsDrawer
    isOpen={isHighlightsDrawerOpen}
    savedHighlights={savedHighlights}
    onClose={closeHighlightsDrawer}
    onOpenHighlight={readerActions.openSavedHighlight}
    onRemoveHighlight={readerActions.removeSavedHighlight}
  />
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html) {
    width: 100%;
    max-width: 100%;
    overflow-x: clip;
  }

  :global(body) {
    margin: 0;
    width: 100%;
    max-width: 100%;
    min-width: 320px;
    min-height: 100vh;
    overflow-x: clip;
    color: #1d252d;
    background:
      linear-gradient(135deg, rgba(47, 111, 104, 0.1) 0%, rgba(247, 250, 248, 0) 42%),
      linear-gradient(180deg, #f6f8f5 0%, #e8eeeb 100%);
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    text-rendering: optimizeLegibility;
  }

  :global(body > div) {
    width: 100%;
    max-width: 100%;
    overflow-x: clip;
  }

  .reader-shell {
    --shell-gap: clamp(1rem, 1.8vw, 1.5rem);
    --shell-padding: clamp(1rem, 3vw, 2.25rem);
    --shell-max-width: 1180px;
    --sidebar-width: clamp(11rem, 18vw, 14rem);
    --drawer-width: clamp(14rem, 22vw, 18rem);
    --panel-title-size: 0.82rem;
    --panel-title-line-height: 1.2;
    --panel-title-weight: 850;
    --panel-title-letter-spacing: 0;
    --panel-title-transform: uppercase;
    --panel-title-color: #425b55;
    --panel-text-color: #1c2a2e;
    --panel-muted-color: #66756f;
    --panel-border-color: rgba(52, 79, 72, 0.16);
    --panel-surface: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(245, 249, 247, 0.78));
    --panel-shadow: 0 18px 46px rgba(31, 46, 42, 0.09), inset 0 1px 0 rgba(255, 255, 255, 0.7);
    --control-surface: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(244, 248, 246, 0.82));
    --control-border-color: rgba(50, 67, 63, 0.24);
    --accent-color: #2f766d;
    --accent-color-hover: #285f58;
    --accent-color-muted: rgba(47, 118, 109, 0.12);
    --sticky-inset: var(--shell-padding);
    --sticky-panel-max-height: calc(
      100dvh - (var(--sticky-inset) * 2) - env(safe-area-inset-bottom, 0px)
    );
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    gap: var(--shell-gap);
    align-items: start;
    width: 100%;
    max-width: var(--shell-max-width);
    margin: 0 auto;
    padding: var(--shell-padding);
  }

  .reader-shell-highlights-open {
    --shell-max-width: 1560px;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr) var(--drawer-width);
  }

  @media (max-width: 980px) {
    .reader-shell-highlights-open {
      --shell-max-width: 1180px;
      grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    }
  }

  @media (max-width: 900px) {
    .reader-shell {
      display: block;
      padding: calc(100dvh - env(safe-area-inset-bottom, 0px)) 0 0;
      overflow-x: hidden;
    }

    .reader-shell-highlights-open {
      width: 100%;
      max-width: 100%;
      padding-inline: 0;
    }
  }

  @media (max-width: 500px) {
    .reader-shell,
    .reader-shell-highlights-open {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
