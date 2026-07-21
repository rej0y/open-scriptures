<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import ChapterView from '$lib/ChapterView.svelte';
  import ScriptureReferencePage from '$lib/ScriptureReferencePage.svelte';
  import TopicalGuidePage from '$lib/TopicalGuidePage.svelte';
  import {
    type ChapterBookmark,
    type ChapterNote,
    highlightId,
    highlightKey,
    type SavedHighlight,
    type SavedWord,
    type ScriptureBook,
    type ScriptureChapter,
    type ScriptureSearchResult,
    type SelectionPart,
    type TopicalGuideLink,
    type TopicalGuideTopic
  } from '$lib/study';
  import {
    loadBooks,
    loadChapter as fetchChapter,
    loadTopicalGuideTopic,
    loadTopicalGuideTopicByTitle,
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
  let bookmarks: ChapterBookmark[] = [];
  let bookmarkTitle = '';
  let bookmarkError = '';
  let isLoadingBookmarks = false;
  let isSavingBookmark = false;
  let activeHighlightId = '';
  let savedWords: SavedWord[] = [];
  let savedHighlights: SavedHighlight[] = [];
  let savedWordsError = '';
  let selectionOverlayRects: DOMRect[] = [];
  let chapterNotes: ChapterNote[] = [];
  let previousChapterPreview: ScriptureChapter | null = null;
  let nextChapterPreview: ScriptureChapter | null = null;
  let chapterPreviewRequest = 0;
  let isCarouselRecentering = false;
  let carouselViewport: HTMLElement;
  let carouselSettleTimer: number | undefined;
  let carouselLayoutFrame: number | undefined;
  let carouselLayoutRequest = 0;
  let hasCenteredCarousel = false;
  let activeChapterSlideHeight: number | undefined;
  let selectedTopicLink: TopicalGuideLink | null = null;
  let topicalGuideTopic: TopicalGuideTopic | null = null;
  let topicalGuideError = '';
  let isLoadingTopicalGuide = false;
  let topicalGuideRequest = 0;
  let topicalGuideCloseRequest = 0;
  let isClosingTopicalGuide = false;
  let nextRelatedTopicPanelKey = 0;
  let relatedTopicalGuidePanels: Array<
    | {
        kind: 'topic';
        key: number;
        title: string;
        topic: TopicalGuideTopic | null;
        errorMessage: string;
        isLoading: boolean;
        isClosing: boolean;
      }
    | {
        kind: 'scripture';
        key: number;
        title: string;
        chapter: ScriptureChapter | null;
        verse: number;
        errorMessage: string;
        isLoading: boolean;
        isClosing: boolean;
      }
  > = [];
  let noteSaveTimer: number | undefined;
  const pendingNoteSaves = new Map<string, ChapterNote[]>();

  $: topicalGuidePanelCount = selectedTopicLink && !isClosingTopicalGuide
    ? 1 + relatedTopicalGuidePanels.filter((panel) => !panel.isClosing).length
    : 0;

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

  $: if (chapter) {
    void loadChapterPreviews(chapter);
    chapterNotes = loadChapterNotes(chapter);
  }

  function refreshVisibleChapter() {
    chapter = cloneVisibleChapter(chapter);
  }

  function chapterNotesKey(currentChapter: ScriptureChapter) {
    return `open-scriptures:notes:${currentChapter.book}:${currentChapter.chapter}`;
  }

  function loadChapterNotes(currentChapter: ScriptureChapter) {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const savedNotes = localStorage.getItem(chapterNotesKey(currentChapter));
      if (!savedNotes) return [];
      const parsedNotes = JSON.parse(savedNotes) as ChapterNote[];
      const contentNotes = parsedNotes.filter((note) => note.text.trim().length > 0);
      if (contentNotes.length !== parsedNotes.length) {
        localStorage.setItem(chapterNotesKey(currentChapter), JSON.stringify(contentNotes));
      }
      return contentNotes;
    } catch {
      return [];
    }
  }

  function saveChapterNotes() {
    if (!chapter || typeof localStorage === 'undefined') {
      return;
    }

    pendingNoteSaves.set(chapterNotesKey(chapter), chapterNotes);
    window.clearTimeout(noteSaveTimer);
    noteSaveTimer = window.setTimeout(flushPendingChapterNotes, 150);
  }

  function flushPendingChapterNotes() {
    if (typeof window !== 'undefined') {
      window.clearTimeout(noteSaveTimer);
    }
    noteSaveTimer = undefined;
    if (pendingNoteSaves.size === 0 || typeof localStorage === 'undefined') {
      return;
    }

    for (const [key, notes] of pendingNoteSaves) {
      localStorage.setItem(key, JSON.stringify(notes));
    }
    pendingNoteSaves.clear();
  }

  function createChapterNote(note: ChapterNote) {
    chapterNotes = [...chapterNotes, note];
    saveChapterNotes();
  }

  function updateChapterNote(
    id: string,
    text: string,
    layout?: Pick<ChapterNote, 'x' | 'y' | 'width' | 'height' | 'manualWidth'>
  ) {
    chapterNotes = chapterNotes.map((note) =>
      note.id === id ? { ...note, ...layout, text } : note);
    saveChapterNotes();
  }

  function updateChapterNoteLayout(
    id: string,
    layout: Pick<ChapterNote, 'x' | 'y' | 'width' | 'height' | 'manualWidth'>
  ) {
    chapterNotes = chapterNotes.map((note) => (note.id === id ? { ...note, ...layout } : note));
    saveChapterNotes();
  }

  function removeChapterNotes(ids: string[]) {
    const noteIds = new Set(ids);
    chapterNotes = chapterNotes.filter((note) => !noteIds.has(note.id));
    saveChapterNotes();
  }

  async function loadChapterPreviews(currentChapter: ScriptureChapter) {
    const request = ++chapterPreviewRequest;

    const [previous, next] = await Promise.all([
      currentChapter.previous_chapter
        ? fetchChapter(currentChapter.book, currentChapter.previous_chapter)
        : Promise.resolve(null),
      currentChapter.next_chapter
        ? fetchChapter(currentChapter.book, currentChapter.next_chapter)
        : Promise.resolve(null)
    ]);

    if (request !== chapterPreviewRequest) {
      return;
    }

    previousChapterPreview = previous;
    nextChapterPreview = next;

    if (!hasCenteredCarousel) {
      await tick();
      centerCarousel();
      hasCenteredCarousel = true;
    }
  }

  function updateSelectionOverlay() {
    const selection = document.getSelection();

    if (!chapter || !selection || selection.rangeCount === 0 || selection.toString().trim().length === 0) {
      selectionOverlayRects = [];
      return;
    }

    const selectedParts = getSelectedVerseParts(
      chapter,
      selection,
      (verseKey) => document.querySelector<HTMLElement>(`[data-verse-key="${CSS.escape(verseKey)}"]`)
    );

    selectionOverlayRects = selectedParts.length
      ? Array.from(selection.getRangeAt(0).getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0)
      : [];
  }

  function updatePendingSelection() {
    readerActions.updatePendingSelection();
    updateSelectionOverlay();
  }

  function centerCarousel() {
    if (carouselViewport) {
      carouselViewport.scrollLeft = carouselPageWidth();
    }
  }

  async function recenterCarouselAfterLayoutChange() {
    const request = ++carouselLayoutRequest;
    if (carouselLayoutFrame !== undefined) cancelAnimationFrame(carouselLayoutFrame);
    isCarouselRecentering = true;
    await tick();
    if (request !== carouselLayoutRequest) return;

    const startedAt = performance.now();
    const keepCentered = (timestamp: number) => {
      if (request !== carouselLayoutRequest) return;
      centerCarousel();

      if (timestamp - startedAt < 280) {
        carouselLayoutFrame = requestAnimationFrame(keepCentered);
      } else {
        carouselLayoutFrame = undefined;
        isCarouselRecentering = false;
      }
    };

    centerCarousel();
    carouselLayoutFrame = requestAnimationFrame(keepCentered);
  }

  function carouselPageWidth() {
    const carousel = carouselViewport?.querySelector<HTMLElement>('.chapter-carousel');
    return carousel ? carousel.clientWidth / 3 : carouselViewport?.clientWidth ?? 0;
  }

  function measureActiveChapterSlide(node: HTMLElement) {
    const updateHeight = () => {
      activeChapterSlideHeight = node.offsetHeight;
    };
    const observer = new ResizeObserver(updateHeight);

    observer.observe(node);
    updateHeight();

    return {
      destroy() {
        observer.disconnect();
      }
    };
  }

  function handleCarouselScroll() {
    if (isCarouselRecentering) {
      return;
    }

    window.clearTimeout(carouselSettleTimer);
    carouselSettleTimer = window.setTimeout(() => {
      completeCarouselScroll();
    }, 180);
  }

  function completeCarouselScroll() {
    if (!carouselViewport || !chapter) {
      return;
    }

    if (selectedTopicLink) {
      centerCarousel();
      return;
    }

    const pageWidth = carouselPageWidth();

    if (carouselViewport.scrollLeft < pageWidth * 0.5 && previousChapterPreview) {
      void settleChapterSwipe(previousChapterPreview, 1);
      return;
    }

    if (carouselViewport.scrollLeft > pageWidth * 1.5 && nextChapterPreview) {
      void settleChapterSwipe(nextChapterPreview, -1);
      return;
    }

    carouselViewport.scrollTo({ left: pageWidth, behavior: 'smooth' });
  }

  function openChapter(book: string, chapterNumber: number) {
    void readerActions.openChapter(book, chapterNumber);
  }

  async function openTopicalGuideScriptureReference(
    abbreviatedBook: string,
    chapterNumber: number,
    verseNumber: number,
    sourcePanelIndex: number
  ) {
    const normalizedBook = abbreviatedBook.trim().toLocaleLowerCase();
    const book = books.find(
      (candidate) =>
        candidate.title.toLocaleLowerCase() === normalizedBook ||
        candidate.short_title.toLocaleLowerCase() === normalizedBook
    );
    if (!book) return;

    const key = ++nextRelatedTopicPanelKey;
    relatedTopicalGuidePanels = [
      ...relatedTopicalGuidePanels.slice(0, sourcePanelIndex),
      {
        kind: 'scripture',
        key,
        title: `${book.title} ${chapterNumber}:${verseNumber}`,
        chapter: null,
        verse: verseNumber,
        errorMessage: '',
        isLoading: true,
        isClosing: false
      }
    ];
    await recenterCarouselAfterLayoutChange();

    try {
      const loadedChapter = await fetchChapter(book.title, chapterNumber);
      relatedTopicalGuidePanels = relatedTopicalGuidePanels.map((panel) =>
        panel.key === key && panel.kind === 'scripture'
          ? { ...panel, chapter: loadedChapter }
          : panel
      );
    } catch (error) {
      relatedTopicalGuidePanels = relatedTopicalGuidePanels.map((panel) =>
        panel.key === key && panel.kind === 'scripture'
          ? { ...panel, errorMessage: error instanceof Error ? error.message : String(error) }
          : panel
      );
    } finally {
      relatedTopicalGuidePanels = relatedTopicalGuidePanels.map((panel) =>
        panel.key === key && panel.kind === 'scripture'
          ? { ...panel, isLoading: false }
          : panel
      );
    }
  }

  async function settleChapterSwipe(destination: ScriptureChapter, direction: -1 | 1) {
    const departingChapter = chapter;

    if (!departingChapter) {
      return;
    }

    isCarouselRecentering = true;
    // Keep the chapter currently on screen in its outer slide while it becomes
    // the center slide. This makes the recentering position visually identical.
    if (direction === 1) {
      previousChapterPreview = destination;
      nextChapterPreview = departingChapter;
    } else {
      previousChapterPreview = departingChapter;
      nextChapterPreview = destination;
    }
    chapter = destination;
    selectedBook = destination.book;
    pendingBook = destination.book;
    selectedChapter = destination.chapter;
    await tick();
    centerCarousel();
    await tick();
    isCarouselRecentering = false;
  }

  async function removeHighlightOnDoubleClick(savedWord: SavedWord) {
    readerActions.cancelPendingSelectionSave();
    selectionOverlayRects = [];

    const savedHighlight = savedHighlights.find((highlight) =>
      highlight.words.some((word) => word.id === savedWord.id)
    );

    if (savedHighlight) {
      await readerActions.removeSavedHighlight(savedHighlight);
    }
  }

  async function openTopicalGuide(topicLink: TopicalGuideLink) {
    const request = ++topicalGuideRequest;
    topicalGuideCloseRequest += 1;
    isClosingTopicalGuide = false;
    selectedTopicLink = topicLink;
    topicalGuideTopic = null;
    topicalGuideError = '';
    isLoadingTopicalGuide = true;
    relatedTopicalGuidePanels = [];
    await recenterCarouselAfterLayoutChange();

    if (request !== topicalGuideRequest) return;

    try {
      const topic = await loadTopicalGuideTopic(topicLink.topic_id);
      if (request === topicalGuideRequest) topicalGuideTopic = topic;
    } catch (error) {
      if (request === topicalGuideRequest) {
        topicalGuideError = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (request === topicalGuideRequest) isLoadingTopicalGuide = false;
    }
  }

  async function openRelatedTopicalGuide(topicTitle: string, sourcePanelIndex: number) {
    const key = ++nextRelatedTopicPanelKey;
    relatedTopicalGuidePanels = [
      ...relatedTopicalGuidePanels.slice(0, sourcePanelIndex),
      {
        kind: 'topic',
        key,
        title: topicTitle,
        topic: null,
        errorMessage: '',
        isLoading: true,
        isClosing: false
      }
    ];
    await recenterCarouselAfterLayoutChange();

    try {
      const topic = await loadTopicalGuideTopicByTitle(topicTitle);
      relatedTopicalGuidePanels = relatedTopicalGuidePanels.map((panel) =>
        panel.key === key && panel.kind === 'topic' ? { ...panel, topic } : panel
      );
    } catch {
      relatedTopicalGuidePanels = relatedTopicalGuidePanels.filter((panel) => panel.key !== key);
      void recenterCarouselAfterLayoutChange();
    } finally {
      relatedTopicalGuidePanels = relatedTopicalGuidePanels.map((panel) =>
        panel.key === key && panel.kind === 'topic' ? { ...panel, isLoading: false } : panel
      );
    }
  }

  function closeTopicalGuide() {
    if (!selectedTopicLink || isClosingTopicalGuide) return;
    const closeRequest = ++topicalGuideCloseRequest;
    topicalGuideRequest += 1;
    isClosingTopicalGuide = true;
    isLoadingTopicalGuide = false;
    relatedTopicalGuidePanels = relatedTopicalGuidePanels.map((panel) => ({
      ...panel,
      isClosing: true
    }));
    void recenterCarouselAfterLayoutChange();
    window.setTimeout(() => {
      if (closeRequest !== topicalGuideCloseRequest) return;
      selectedTopicLink = null;
      topicalGuideTopic = null;
      topicalGuideError = '';
      relatedTopicalGuidePanels = [];
      isClosingTopicalGuide = false;
    }, 260);
  }

  function closeTopicalGuidePanelsAfter(panelIndex: number) {
    if (panelIndex >= topicalGuidePanelCount - 1) return;
    const closingKeys = new Set(
      relatedTopicalGuidePanels.slice(panelIndex).map((panel) => panel.key)
    );
    relatedTopicalGuidePanels = relatedTopicalGuidePanels.map((panel) =>
      closingKeys.has(panel.key) ? { ...panel, isClosing: true } : panel
    );
    void recenterCarouselAfterLayoutChange();
    window.setTimeout(() => {
      relatedTopicalGuidePanels = relatedTopicalGuidePanels.filter(
        (panel) => !closingKeys.has(panel.key)
      );
    }, 260);
  }

  function closeTopicalGuideFromMainClick(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('.reader-scroll-viewport')) {
      closeTopicalGuide();
      return;
    }

    if (
      event.target instanceof Element &&
      !event.target.closest('.related-topic-button, .scripture-reference-button')
    ) {
      const panel = event.target.closest<HTMLElement>('.reader-side-page');
      if (panel) closeTopicalGuidePanelsAfter(Number(panel.dataset.panelIndex));
    }
  }

  onMount(async () => {
    try {
      await readerActions.bootstrap(selectedBook, selectedChapter);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      isLoading = false;
    }
  });

  onDestroy(() => {
    carouselLayoutRequest += 1;
    if (carouselLayoutFrame !== undefined) cancelAnimationFrame(carouselLayoutFrame);
    flushPendingChapterNotes();
  });
</script>
<svelte:head>
  <title>Open Scriptures</title>
  <meta
    name="description"
    content="A local-first scripture reader built with Tauri, SvelteKit, and SQLite."
  />
</svelte:head>

<svelte:document
  on:click={closeTopicalGuideFromMainClick}
  on:selectionchange={updatePendingSelection}
/>
<svelte:window
  on:pointerup={readerActions.saveCurrentSelectionSoon}
  on:mouseup={readerActions.saveCurrentSelectionSoon}
  on:touchend={readerActions.saveCurrentSelectionSoon}
  on:scroll={updateSelectionOverlay}
  on:resize={updateSelectionOverlay}
  on:pagehide={flushPendingChapterNotes}
/>

<div class="reader-layout">
  <main
    class="reader-shell reader-scroll-viewport"
    class:reader-page-hidden={topicalGuidePanelCount >= 3}
    on:scroll={updateSelectionOverlay}
  >
    <div
      bind:this={carouselViewport}
      class="chapter-carousel-viewport"
      class:carousel-recentering={isCarouselRecentering}
      class:topical-guide-open={Boolean(selectedTopicLink)}
      style:height={activeChapterSlideHeight ? `${activeChapterSlideHeight}px` : undefined}
      on:scroll={handleCarouselScroll}
    >
      <div class="chapter-carousel">
      <div class="chapter-slide">
        {#if previousChapterPreview}
          <ChapterView
            bind:activeHighlightId
            chapter={previousChapterPreview}
            totalVerses={previousChapterPreview.verses.length}
            verseSegments={(verse) => verseSegmentsForChapter(previousChapterPreview, verse, savedWordsByVerse)}
            {highlightId}
            {highlightKey}
            onRemoveHighlight={removeHighlightOnDoubleClick}
            onOpenTopicalGuide={openTopicalGuide}
          />
        {/if}
      </div>

      <div class="chapter-slide" use:measureActiveChapterSlide>
        <ChapterView
          bind:activeHighlightId
          {chapter}
          isLoading={isLoading}
          errorMessage={errorMessage}
          totalVerses={totalVerses}
          verseSegments={(verse) => verseSegmentsForChapter(chapter, verse, savedWordsByVerse)}
          {highlightId}
          {highlightKey}
          onRemoveHighlight={removeHighlightOnDoubleClick}
          onOpenTopicalGuide={openTopicalGuide}
          sidePageOpen={Boolean(selectedTopicLink)}
          notes={chapterNotes}
          onCreateNote={createChapterNote}
          onUpdateNote={updateChapterNote}
          onUpdateNoteLayout={updateChapterNoteLayout}
          onRemoveNotes={removeChapterNotes}
        />
      </div>

      <div class="chapter-slide">
        {#if nextChapterPreview}
        <ChapterView
            bind:activeHighlightId
            chapter={nextChapterPreview}
            totalVerses={nextChapterPreview.verses.length}
            verseSegments={(verse) => verseSegmentsForChapter(nextChapterPreview, verse, savedWordsByVerse)}
            {highlightId}
            {highlightKey}
            onRemoveHighlight={removeHighlightOnDoubleClick}
            onOpenTopicalGuide={openTopicalGuide}
          />
        {/if}
      </div>
      </div>
    </div>
  </main>

  {#if selectedTopicLink}
    <TopicalGuidePage
      title={selectedTopicLink.title}
      topic={topicalGuideTopic}
      isLoading={isLoadingTopicalGuide}
      errorMessage={topicalGuideError}
      compact={topicalGuidePanelCount >= 2}
      threeColumn={topicalGuidePanelCount >= 3}
      hidden={
        isClosingTopicalGuide ||
        (topicalGuidePanelCount >= 3 && 0 < topicalGuidePanelCount - 3)
      }
      panelIndex={0}
      primary
      onOpenRelatedTopic={(title) => openRelatedTopicalGuide(title, 0)}
      onOpenScriptureReference={(book, chapterNumber, verseNumber) =>
        openTopicalGuideScriptureReference(book, chapterNumber, verseNumber, 0)}
    />
  {/if}

  {#each relatedTopicalGuidePanels as panel, index (panel.key)}
    {@const panelHidden =
      panel.isClosing ||
      (topicalGuidePanelCount >= 3 && index + 1 < topicalGuidePanelCount - 3)}
    {#if panel.kind === 'topic'}
      <TopicalGuidePage
        title={panel.title}
        topic={panel.topic}
        isLoading={panel.isLoading}
        errorMessage={panel.errorMessage}
        compact={topicalGuidePanelCount >= 2}
        threeColumn={topicalGuidePanelCount >= 3}
        hidden={panelHidden}
        panelIndex={index + 1}
        onOpenRelatedTopic={(title) => openRelatedTopicalGuide(title, index + 1)}
        onOpenScriptureReference={(book, chapterNumber, verseNumber) =>
          openTopicalGuideScriptureReference(book, chapterNumber, verseNumber, index + 1)}
      />
    {:else}
      <ScriptureReferencePage
        title={panel.title}
        chapter={panel.chapter}
        verse={panel.verse}
        isLoading={panel.isLoading}
        errorMessage={panel.errorMessage}
        compact={topicalGuidePanelCount >= 2}
        threeColumn={topicalGuidePanelCount >= 3}
        hidden={panelHidden}
        panelIndex={index + 1}
      />
    {/if}
  {/each}
</div>

{#if selectionOverlayRects.length > 0}
  <div class="selection-overlay" aria-hidden="true">
    {#each selectionOverlayRects as rect}
      <span
        style={`left: ${rect.left}px; top: ${rect.top}px; width: ${rect.width}px; height: ${rect.height}px;`}
      ></span>
    {/each}
  </div>
{/if}

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(::selection) {
    color: inherit;
    background: transparent;
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

  .reader-layout {
    display: flex;
    align-items: flex-start;
    width: 100%;
    height: 100dvh;
    min-width: 0;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 252, 251, 0.94));
  }

  .reader-shell {
    --shell-padding: clamp(1rem, 3vw, 2.25rem);
    --shell-max-width: 900px;
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
    width: 100%;
    max-width: none;
    margin: 0 auto;
    padding: var(--shell-padding);
  }

  .reader-scroll-viewport {
    flex: 1 1 0;
    width: 0;
    min-width: 0;
    height: 100dvh;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
    opacity: 1;
    transition: opacity 180ms ease;
  }

  .reader-scroll-viewport.reader-page-hidden {
    flex-grow: 0;
    flex-shrink: 0;
    opacity: 0;
    pointer-events: none;
  }

  .chapter-carousel-viewport {
    width: 100%;
    min-width: 0;
    padding: 0;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-behavior: smooth;
    scroll-snap-type: x mandatory;
  }

  .chapter-carousel-viewport.carousel-recentering {
    scroll-behavior: auto;
  }

  .chapter-carousel-viewport.topical-guide-open {
    overflow-x: hidden;
    overscroll-behavior-x: none;
    touch-action: pan-y;
  }

  .chapter-carousel {
    display: flex;
    align-items: flex-start;
    width: 300%;
  }

  .chapter-slide {
    flex: 0 0 33.333333333333%;
    min-width: 0;
    padding: 0;
    scroll-snap-align: start;
  }

  .chapter-carousel :global(.chapter-view) {
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .selection-overlay {
    position: fixed;
    z-index: 20;
    inset: 0;
    pointer-events: none;
  }

  .selection-overlay span {
    position: fixed;
    border-radius: 4px;
    background: rgba(227, 178, 75, 0.34);
  }

  @media (max-width: 900px) {
    .reader-shell {
      padding: 0;
    }

    .chapter-slide {
      padding: 0;
    }
  }
</style>
