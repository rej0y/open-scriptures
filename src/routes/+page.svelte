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

  type ScriptureSearchResult = {
    volume: string;
    book: string;
    chapter: number;
    verse: number;
    reference: string;
    text: string;
  };

  type SavedWord = {
    id: number;
    selection_id: string;
    volume: string;
    book: string;
    chapter: number;
    verse: number;
    reference: string;
    selected_text: string;
    verse_text: string;
    start_offset: number;
    end_offset: number;
    created_at: string;
  };

  type SavedHighlight = {
    id: string;
    text: string;
    book: string;
    chapter: number;
    volume: string;
    reference: string;
    created_at: string;
    words: SavedWord[];
  };

  type VerseSegment = {
    text: string;
    savedWord?: SavedWord;
  };

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
  let chapterSelect: HTMLSelectElement;
  let searchQuery = '';
  let searchError = '';
  let searchResults: ScriptureSearchResult[] = [];
  let hasSearched = false;
  let pendingSelectionParts: SelectionPart[] = [];
  let isHighlightsDrawerOpen = false;
  let activeHighlightId = '';
  let savedWords: SavedWord[] = [];
  let savedHighlights: SavedHighlight[] = [];
  let savedWordsError = '';

  $: pendingBookInfo = books.find((book) => book.title === pendingBook);
  $: totalVerses = chapter?.verses.length ?? 0;
  $: savedWordsByVerse = savedWords.reduce<Record<string, SavedWord[]>>((groups, savedWord) => {
    const key = passageKey(savedWord.book, savedWord.chapter, savedWord.verse);
    const existingWords = groups[key] ?? [];
    const alreadyGrouped = existingWords.some(
      (word) =>
        word.start_offset === savedWord.start_offset &&
        word.end_offset === savedWord.end_offset &&
        word.selected_text === savedWord.selected_text
    );

    groups[key] = alreadyGrouped ? existingWords : [...existingWords, savedWord];
    return groups;
  }, {});
  $: savedHighlights = groupSavedWords(savedWords);
  $: chapterOptions = Array.from(
    { length: pendingBookInfo?.chapter_count ?? chapter?.chapter ?? 1 },
    (_, index) => index + 1
  );

  function passageKey(book: string, chapterNumber: number, verseNumber: number) {
    return `${book}:${chapterNumber}:${verseNumber}`;
  }

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

  function refreshVisibleChapter() {
    if (!chapter) return;

    chapter = {
      ...chapter,
      verses: [...chapter.verses]
    };
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

  async function loadSavedWords() {
    isLoadingSavedWords = true;
    savedWordsError = '';

    try {
      savedWords = await invoke<SavedWord[]>('list_saved_words');
    } catch (error) {
      savedWordsError = error instanceof Error ? error.message : String(error);
    } finally {
      isLoadingSavedWords = false;
    }
  }

  async function removeSavedWord(savedWord: SavedWord) {
    savedWordsError = '';
    savedWords = savedWords.filter(
      (word) =>
        !(
          word.book === savedWord.book &&
          word.chapter === savedWord.chapter &&
          word.verse === savedWord.verse &&
          word.start_offset === savedWord.start_offset &&
          word.end_offset === savedWord.end_offset &&
          word.selected_text === savedWord.selected_text
        )
    );

    if (savedWord.id < 0) return;

    try {
      await invoke('remove_saved_word', { id: savedWord.id });
      await loadSavedWords();
      refreshVisibleChapter();
    } catch (error) {
      savedWordsError = error instanceof Error ? error.message : String(error);
    }
  }

  async function removeSavedHighlight(savedHighlight: SavedHighlight) {
    savedWordsError = '';
    const removedKeys = new Set(savedHighlight.words.map(highlightKey));
    savedWords = savedWords.filter((word) => !removedKeys.has(highlightKey(word)));

    try {
      await Promise.all(
        savedHighlight.words
          .filter((word) => word.id > 0)
          .map((word) => invoke('remove_saved_word', { id: word.id }))
      );
      await loadSavedWords();
      refreshVisibleChapter();
    } catch (error) {
      savedWordsError = error instanceof Error ? error.message : String(error);
    }
  }

  type SelectionPart = {
    verse: ChapterVerse;
    selectedText: string;
    startOffset: number;
    endOffset: number;
  };

  function textLength(value: string) {
    return Array.from(value).length;
  }

  function textSlice(value: string, start: number, end?: number) {
    return Array.from(value).slice(start, end).join('');
  }

  function highlightId(word: SavedWord) {
    return word.selection_id || String(word.id);
  }

  function highlightKey(word: SavedWord) {
    return [
      word.book,
      word.chapter,
      word.verse,
      word.start_offset,
      word.end_offset,
      word.selected_text
    ].join(':');
  }

  function highlightSelector(word: SavedWord) {
    return `[data-highlight-key="${CSS.escape(highlightKey(word))}"]`;
  }

  function closeHighlightsOnOutsideClick(event: MouseEvent) {
    if (!isHighlightsDrawerOpen) return;

    const target = event.target;

    if (!(target instanceof Element)) return;
    if (target.closest('.highlights-drawer') || target.closest('.open-highlights-button')) return;

    isHighlightsDrawerOpen = false;
  }

  function openHighlightsDrawer() {
    isHighlightsDrawerOpen = true;
  }

  function closeHighlightsDrawer() {
    isHighlightsDrawerOpen = false;
  }

  function wordSort(first: SavedWord, second: SavedWord) {
    return (
      first.chapter - second.chapter ||
      first.verse - second.verse ||
      first.start_offset - second.start_offset ||
      first.id - second.id
    );
  }

  function highlightReference(words: SavedWord[]) {
    const sortedWords = [...words].sort(wordSort);
    const first = sortedWords[0];
    const last = sortedWords[sortedWords.length - 1];

    if (!first || !last) return '';
    if (first.verse === last.verse) return `${first.book} ${first.chapter}:${first.verse}`;
    return `${first.book} ${first.chapter}:${first.verse}-${last.verse}`;
  }

  function groupSavedWords(words: SavedWord[]) {
    const uniqueWords = words.reduce<SavedWord[]>((dedupedWords, word) => {
      const alreadyIncluded = dedupedWords.some(
        (existingWord) =>
          existingWord.book === word.book &&
          existingWord.chapter === word.chapter &&
          existingWord.verse === word.verse &&
          existingWord.start_offset === word.start_offset &&
          existingWord.end_offset === word.end_offset &&
          existingWord.selected_text === word.selected_text
      );

      return alreadyIncluded ? dedupedWords : [...dedupedWords, word];
    }, []);

    const groups = uniqueWords.reduce<Record<string, SavedWord[]>>((savedGroups, word) => {
      const key = word.selection_id || String(word.id);
      savedGroups[key] = [...(savedGroups[key] ?? []), word];
      return savedGroups;
    }, {});

    return Object.entries(groups)
      .map(([id, groupWords]) => {
        const sortedWords = [...groupWords].sort(wordSort);
        const firstWord = sortedWords[0];

        return {
          id,
          text: sortedWords.map((word) => word.selected_text).join(' '),
          book: firstWord?.book ?? '',
          chapter: firstWord?.chapter ?? 0,
          volume: firstWord?.volume ?? '',
          reference: highlightReference(sortedWords),
          created_at: sortedWords.reduce(
            (latest, word) => (word.created_at > latest ? word.created_at : latest),
            sortedWords[0]?.created_at ?? ''
          ),
          words: sortedWords
        };
      })
      .sort((first, second) => second.created_at.localeCompare(first.created_at));
  }

  function selectionPartForVerse(range: Range, verse: ChapterVerse, verseElement: HTMLElement) {
    const selectedRange = document.createRange();
    selectedRange.selectNodeContents(verseElement);

    if (verseElement.contains(range.startContainer)) {
      selectedRange.setStart(range.startContainer, range.startOffset);
    }

    if (verseElement.contains(range.endContainer)) {
      selectedRange.setEnd(range.endContainer, range.endOffset);
    }

    const rawText = selectedRange.toString();
    const selectedText = rawText.trim();

    if (!selectedText) return null;

    const offsetRange = document.createRange();
    offsetRange.selectNodeContents(verseElement);
    offsetRange.setEnd(selectedRange.startContainer, selectedRange.startOffset);

    const startOffset = textLength(offsetRange.toString()) + textLength(rawText) - textLength(rawText.trimStart());
    const endOffset = startOffset + textLength(selectedText);

    return {
      verse,
      selectedText,
      startOffset,
      endOffset
    };
  }

  function selectedVerseParts() {
    if (!chapter) return [];

    const selection = document.getSelection();

    if (!selection || selection.rangeCount === 0 || selection.toString().trim().length === 0) {
      return [];
    }

    const range = selection.getRangeAt(0);
    const startElement = selectionNodeElement(range.startContainer);
    const endElement = selectionNodeElement(range.endContainer);
    const startVerse = startElement?.closest<HTMLElement>('[data-verse-key]');
    const endVerse = endElement?.closest<HTMLElement>('[data-verse-key]');

    if (!startVerse || !endVerse) {
      return [];
    }

    const startKey = startVerse.dataset.verseKey;
    const endKey = endVerse.dataset.verseKey;
    const startIndex = chapter.verses.findIndex(
      (verse) => passageKey(chapter!.book, chapter!.chapter, verse.number) === startKey
    );
    const endIndex = chapter.verses.findIndex(
      (verse) => passageKey(chapter!.book, chapter!.chapter, verse.number) === endKey
    );

    if (startIndex === -1 || endIndex === -1) {
      return [];
    }

    const firstIndex = Math.min(startIndex, endIndex);
    const lastIndex = Math.max(startIndex, endIndex);
    const parts: SelectionPart[] = [];

    for (const verse of chapter.verses.slice(firstIndex, lastIndex + 1)) {
      const key = passageKey(chapter.book, chapter.chapter, verse.number);
      const verseElement = document.querySelector<HTMLElement>(`[data-verse-key="${CSS.escape(key)}"]`);
      const part = verseElement ? selectionPartForVerse(range, verse, verseElement) : null;

      if (part) {
        parts.push(part);
      }
    }

    return parts;
  }

  function selectionNodeElement(node: Node) {
    return node instanceof Element ? node : node.parentElement;
  }

  function updatePendingSelection() {
    pendingSelectionParts = selectedVerseParts();
  }

  function saveCurrentSelectionSoon() {
    updatePendingSelection();
    setTimeout(saveCurrentSelection, 60);
  }

  async function saveCurrentSelection() {
    if (!chapter || isSavingSelection) return;

    const parts = pendingSelectionParts.length > 0 ? pendingSelectionParts : selectedVerseParts();

    if (parts.length === 0) return;

    isSavingSelection = true;
    savedWordsError = '';
    const selectionId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const optimisticWords = parts.map((part, index) => ({
      id: -Date.now() - index,
      selection_id: selectionId,
      volume: chapter!.volume,
      book: chapter!.book,
      chapter: chapter!.chapter,
      verse: part.verse.number,
      reference: `${chapter!.book} ${chapter!.chapter}:${part.verse.number}`,
      selected_text: part.selectedText,
      verse_text: part.verse.text,
      start_offset: part.startOffset,
      end_offset: part.endOffset,
      created_at: createdAt
    }));
    const optimisticKeys = new Set(optimisticWords.map(highlightKey));

    savedWords = [
      ...optimisticWords,
      ...savedWords.filter((word) => !optimisticKeys.has(highlightKey(word)))
    ];
    document.getSelection()?.removeAllRanges();

    try {
      const savedSelection = await Promise.all(
        parts.map((part) =>
          invoke<SavedWord>('save_word', {
            book: chapter!.book,
            chapter: chapter!.chapter,
            verse: part.verse.number,
            selectionId,
            selectedText: part.selectedText,
            startOffset: part.startOffset,
            endOffset: part.endOffset
          })
        )
      );

      const savedWordIds = new Set(savedSelection.map((word) => word.id));
      const savedKeys = new Set(savedSelection.map(highlightKey));
      savedWords = [
        ...savedSelection,
        ...savedWords.filter(
          (word) => !savedWordIds.has(word.id) && word.id > 0 && !savedKeys.has(highlightKey(word))
        )
      ].sort((first, second) => second.created_at.localeCompare(first.created_at) || second.id - first.id);
      await loadSavedWords();
      refreshVisibleChapter();
    } catch (error) {
      savedWordsError = error instanceof Error ? error.message : String(error);
    } finally {
      isSavingSelection = false;
      pendingSelectionParts = [];
    }
  }

  function verseSegments(verse: ChapterVerse): VerseSegment[] {
    if (!chapter) return [{ text: verse.text }];

    const key = passageKey(chapter.book, chapter.chapter, verse.number);
    const ranges = (savedWordsByVerse[key] ?? [])
      .filter((word) => word.start_offset >= 0 && word.end_offset > word.start_offset)
      .sort((first, second) => first.start_offset - second.start_offset);

    if (ranges.length === 0) {
      return [{ text: verse.text }];
    }

    const segments: VerseSegment[] = [];
    let lastIndex = 0;

    for (const range of ranges) {
      const start = Math.max(range.start_offset, lastIndex);
      const end = Math.min(range.end_offset, textLength(verse.text));

      if (end <= start) {
        continue;
      }

      if (start > lastIndex) {
        segments.push({ text: textSlice(verse.text, lastIndex, start) });
      }

      segments.push({ text: textSlice(verse.text, start, end), savedWord: range });
      lastIndex = end;
    }

    if (lastIndex < textLength(verse.text)) {
      segments.push({ text: textSlice(verse.text, lastIndex) });
    }

    return segments;
  }

  async function openSavedHighlight(savedHighlight: SavedHighlight) {
    const firstWord = savedHighlight.words[0];

    if (!firstWord) return;

    await loadChapter(savedHighlight.book, savedHighlight.chapter);
    await tick();

    document.querySelector<HTMLElement>(highlightSelector(firstWord))?.scrollIntoView({
      behavior: 'instant',
      block: 'center'
    });
  }

  onMount(async () => {
    try {
      books = await invoke<ScriptureBook[]>('list_books');
      await loadSavedWords();
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

<svelte:document on:selectionchange={updatePendingSelection} />
<svelte:window
  on:click={closeHighlightsOnOutsideClick}
  on:pointerup={saveCurrentSelectionSoon}
  on:mouseup={saveCurrentSelectionSoon}
  on:touchend={saveCurrentSelectionSoon}
/>

<main class:reader-shell-highlights-open={isHighlightsDrawerOpen} class="reader-shell">
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
          {@const verseKey = passageKey(chapter.book, chapter.chapter, verse.number)}
          <div class="verse-row">
            <p>
              <span class="verse-number">{verse.number}</span>
              <span class="verse-text" data-verse-key={verseKey}>
                {#each verseSegments(verse) as segment}
                  {#if segment.savedWord}
                    <mark
                      class="highlight-mark"
                      class:highlight-mark-active={activeHighlightId === highlightId(segment.savedWord)}
                      title="Saved highlight"
                      role="mark"
                      data-highlight-key={highlightKey(segment.savedWord)}
                      data-highlight-id={highlightId(segment.savedWord)}
                      on:mouseenter={() => (activeHighlightId = highlightId(segment.savedWord!))}
                      on:mouseleave={() => (activeHighlightId = '')}
                    >
                      {segment.text}
                    </mark>
                  {:else}
                    {segment.text}
                  {/if}
                {/each}
              </span>
            </p>
          </div>
        {/each}
      </div>

      <footer class="chapter-footer">
        {@render chapterNav(chapter, 'Chapter navigation')}
      </footer>
    {/if}
  </article>

  {#if isHighlightsDrawerOpen}
    <aside class="highlights-drawer" aria-label="Saved highlights">
      <div class="drawer-heading">
        <div>
          <p class="eyebrow">Saved</p>
          <h2>Highlights</h2>
        </div>
        <button
          type="button"
          class="close-drawer-button"
          aria-label="Close highlights"
          on:click={closeHighlightsDrawer}
        >
          &times;
        </button>
      </div>

      {#if savedHighlights.length === 0}
        <p class="panel-status">No saved words yet.</p>
      {:else}
        <ol class="highlight-list" aria-label="Saved highlights">
          {#each savedHighlights as savedHighlight}
            <li>
              <button
                type="button"
                class="highlight-link"
                on:click={() => openSavedHighlight(savedHighlight)}
              >
                <span>{savedHighlight.reference}</span>
                {savedHighlight.text}
              </button>
              <button
                type="button"
                class="remove-highlight-button"
                aria-label="Remove highlight"
                on:click|stopPropagation={() => removeSavedHighlight(savedHighlight)}
              >
                Remove
              </button>
            </li>
          {/each}
        </ol>
      {/if}
    </aside>
  {/if}
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
      linear-gradient(180deg, #f5f7f6 0%, #eef2f1 100%);
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
    --sticky-inset: var(--shell-padding);
    --sticky-panel-max-height: calc(100dvh - (var(--sticky-inset) * 2) - env(safe-area-inset-bottom, 0px));
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
    --shell-max-width: 1180px;
  }

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
  .open-highlights-button:focus-visible,
  .close-drawer-button:focus-visible,
  .highlight-list button:focus-visible,
  .chapter-nav button:focus-visible {
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

  .search-results button:hover,
  .open-highlights-button:hover {
    background: rgba(47, 111, 104, 0.08);
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

  .open-highlights-button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .chapter-view {
    grid-column: 2;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
    min-height: calc(100vh - clamp(2rem, 8vw, 5rem));
    padding: clamp(1.4rem, 4vw, 3.5rem);
    border: 1px solid rgba(29, 37, 45, 0.08);
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 24px 70px rgba(29, 37, 45, 0.08);
  }

  .reader-shell-highlights-open .chapter-view {
    padding: clamp(1.25rem, 3vw, 2.75rem);
  }

  .highlights-drawer {
    position: fixed;
    top: var(--sticky-inset);
    right: var(--sticky-inset);
    bottom: var(--sticky-inset);
    z-index: 30;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
    width: min(28rem, calc(100vw - (var(--sticky-inset) * 2)));
    max-height: none;
    overflow: hidden;
    overscroll-behavior: contain;
    padding: 1rem;
    border: 1px solid rgba(29, 37, 45, 0.1);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 24px 80px rgba(29, 37, 45, 0.18);
  }

  .drawer-heading {
    display: flex;
    min-width: 0;
    gap: 0.85rem;
    align-items: start;
    justify-content: space-between;
    padding-bottom: 0.8rem;
    border-bottom: 1px solid rgba(29, 37, 45, 0.09);
  }

  .drawer-heading > div {
    min-width: 0;
  }

  .drawer-heading h2 {
    margin: 0;
    color: #111820;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.65rem;
    line-height: 1.05;
  }

  .close-drawer-button {
    display: inline-grid;
    flex: 0 0 auto;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border: 1px solid rgba(29, 37, 45, 0.12);
    border-radius: 6px;
    color: #52605b;
    background: #ffffff;
    font: inherit;
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }

  .close-drawer-button:hover {
    border-color: rgba(47, 111, 104, 0.28);
    background: rgba(47, 111, 104, 0.08);
  }

  .remove-highlight-button {
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

  .remove-highlight-button:hover {
    background: rgba(47, 111, 104, 0.08);
  }

  .highlight-list {
    display: grid;
    align-content: start;
    gap: 0;
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    list-style: none;
  }

  .highlight-list li {
    display: grid;
    gap: 0.35rem;
    align-items: start;
    padding: 0.85rem 0;
    border-bottom: 1px solid rgba(29, 37, 45, 0.08);
  }

  .highlight-link {
    display: grid;
    gap: 0.35rem;
    border: 0;
    border-radius: 6px;
    padding: 0.2rem 0.3rem;
    color: #252b31;
    background: transparent;
    font: inherit;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1rem;
    line-height: 1.55;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .highlight-link:hover {
    background: rgba(47, 111, 104, 0.07);
  }

  .highlight-link span {
    color: #6b756f;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 0.72rem;
    font-weight: 850;
    line-height: 1.2;
    text-transform: uppercase;
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
    gap: 0.9rem;
    max-width: 760px;
    min-width: 0;
    font-family: Georgia, "Times New Roman", serif;
  }

  .verse-row {
    min-width: 0;
    padding: 0.25rem 0 0.25rem 0.75rem;
    border-left: 3px solid transparent;
  }

  .verses p {
    margin: 0;
    color: #252b31;
    font-size: clamp(1.08rem, 2vw, 1.2rem);
    line-height: 1.86;
    overflow-wrap: anywhere;
  }

  .highlight-mark {
    appearance: none;
    border: 0;
    border-radius: 4px;
    display: inline;
    padding: 0.04em 0.12em;
    color: inherit;
    background: rgba(227, 178, 75, 0.34);
    box-decoration-break: clone;
    font: inherit;
    line-height: inherit;
    text-align: left;
    -webkit-box-decoration-break: clone;
  }

  .highlight-mark:hover,
  .highlight-mark-active {
    background: rgba(227, 178, 75, 0.58);
  }

  .verse-number {
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

  .verse-text {
    display: inline;
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

  @media (max-width: 980px) {
    .reader-shell-highlights-open .highlights-drawer {
      top: var(--sticky-inset);
      right: var(--sticky-inset);
      bottom: var(--sticky-inset);
      width: min(24rem, calc(100vw - (var(--sticky-inset) * 2)));
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

    .chapter-view {
      min-height: 100vh;
      border-width: 0;
      border-radius: 0;
      box-shadow: none;
    }

    .highlights-drawer {
      inset: 0;
      z-index: 20;
      grid-template-rows: auto minmax(0, 1fr);
      width: 100%;
      max-width: none;
      max-height: none;
      margin: 0;
      border-width: 1px 0 0;
      border-radius: 0;
      box-shadow: none;
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

    .chapter-nav {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .chapter-nav button {
      width: 100%;
    }
  }
</style>
