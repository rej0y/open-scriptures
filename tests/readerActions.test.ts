import assert from 'node:assert/strict';
import test from 'node:test';

import { createReaderNavigationActions } from '$lib/readerActionsNavigation';
import { createReaderSavedWordActions } from '$lib/readerActionsSavedWords';
import { createReaderSearchActions } from '$lib/readerActionsSearch';
import type { ReaderActionDeps, ReaderActionState } from '$lib/readerActionsTypes';
import type {
  SavedHighlight,
  SavedWord,
  ScriptureBook,
  ScriptureChapter,
  ScriptureSearchResult,
  SelectionPart
} from '$lib/study';

const noopInvoke: ReaderActionDeps['invoke'] = async <T>() => undefined as T;

function createState(overrides: Partial<{
  books: ScriptureBook[];
  chapter: ScriptureChapter | null;
  errorMessage: string;
  isLoading: boolean;
  selectedBook: string;
  selectedChapter: number;
  pendingBook: string;
  searchQuery: string;
  searchError: string;
  searchResults: ScriptureSearchResult[];
  hasSearched: boolean;
  isSearching: boolean;
  isLoadingSavedWords: boolean;
  savedWordsError: string;
  savedWords: SavedWord[];
  isSavingSelection: boolean;
  pendingSelectionParts: SelectionPart[];
}> = {}) {
  let books = overrides.books ?? [];
  let chapter = overrides.chapter ?? null;
  let errorMessage = overrides.errorMessage ?? '';
  let isLoading = overrides.isLoading ?? false;
  let selectedBook = overrides.selectedBook ?? '1 Nephi';
  let selectedChapter = overrides.selectedChapter ?? 1;
  let pendingBook = overrides.pendingBook ?? '1 Nephi';
  let searchQuery = overrides.searchQuery ?? '';
  let searchError = overrides.searchError ?? '';
  let searchResults = overrides.searchResults ?? [];
  let hasSearched = overrides.hasSearched ?? false;
  let isSearching = overrides.isSearching ?? false;
  let isLoadingSavedWords = overrides.isLoadingSavedWords ?? false;
  let savedWordsError = overrides.savedWordsError ?? '';
  let savedWords = overrides.savedWords ?? [];
  let isSavingSelection = overrides.isSavingSelection ?? false;
  let pendingSelectionParts = overrides.pendingSelectionParts ?? [];

  const state: ReaderActionState = {
    getBooks: () => books,
    setBooks: (value) => {
      books = value;
    },
    getChapter: () => chapter,
    setChapter: (value) => {
      chapter = value;
    },
    getErrorMessage: () => errorMessage,
    setErrorMessage: (value) => {
      errorMessage = value;
    },
    getIsLoading: () => isLoading,
    setIsLoading: (value) => {
      isLoading = value;
    },
    getSelectedBook: () => selectedBook,
    setSelectedBook: (value) => {
      selectedBook = value;
    },
    getSelectedChapter: () => selectedChapter,
    setSelectedChapter: (value) => {
      selectedChapter = value;
    },
    getPendingBook: () => pendingBook,
    setPendingBook: (value) => {
      pendingBook = value;
    },
    getSearchQuery: () => searchQuery,
    setSearchQuery: (value) => {
      searchQuery = value;
    },
    getSearchError: () => searchError,
    setSearchError: (value) => {
      searchError = value;
    },
    getSearchResults: () => searchResults,
    setSearchResults: (value) => {
      searchResults = value;
    },
    getHasSearched: () => hasSearched,
    setHasSearched: (value) => {
      hasSearched = value;
    },
    getIsSearching: () => isSearching,
    setIsSearching: (value) => {
      isSearching = value;
    },
    getIsLoadingSavedWords: () => isLoadingSavedWords,
    setIsLoadingSavedWords: (value) => {
      isLoadingSavedWords = value;
    },
    getSavedWordsError: () => savedWordsError,
    setSavedWordsError: (value) => {
      savedWordsError = value;
    },
    getSavedWords: () => savedWords,
    setSavedWords: (value) => {
      savedWords = value;
    },
    getIsSavingSelection: () => isSavingSelection,
    setIsSavingSelection: (value) => {
      isSavingSelection = value;
    },
    getPendingSelectionParts: () => pendingSelectionParts,
    setPendingSelectionParts: (value) => {
      pendingSelectionParts = value;
    }
  };

  return {
    state,
    snapshot: () => ({
      books,
      chapter,
      errorMessage,
      isLoading,
      selectedBook,
      selectedChapter,
      pendingBook,
      searchQuery,
      searchError,
      searchResults,
      hasSearched,
      isSearching,
      isLoadingSavedWords,
      savedWordsError,
      savedWords,
      isSavingSelection,
      pendingSelectionParts
    })
  };
}

const chapter: ScriptureChapter = {
  volume: 'Book of Mormon',
  book: '1 Nephi',
  chapter: 2,
  previous_chapter: 1,
  next_chapter: 3,
  reference: '1 Nephi 2',
  verses: [
    { number: 1, text: 'Alpha beta gamma.' },
    { number: 2, text: 'Delta epsilon zeta.' }
  ]
};

const savedWord: SavedWord = {
  id: 1,
  selection_id: 'group-a',
  volume: 'Book of Mormon',
  book: '1 Nephi',
  chapter: 2,
  verse: 1,
  reference: '1 Nephi 2:1',
  selected_text: 'beta',
  verse_text: 'Alpha beta gamma.',
  start_offset: 6,
  end_offset: 10,
  created_at: '2026-05-09T21:00:00.000Z'
};

const savedHighlight: SavedHighlight = {
  id: 'group-a',
  text: 'beta',
  book: '1 Nephi',
  chapter: 2,
  volume: 'Book of Mormon',
  reference: '1 Nephi 2:1',
  created_at: '2026-05-09T21:00:00.000Z',
  words: [savedWord]
};

test('navigation openChapter sets loading state and loads the requested chapter', async () => {
  const calls: Array<[string, number]> = [];
  const { state, snapshot } = createState({
    selectedBook: '1 Nephi',
    selectedChapter: 1,
    pendingBook: '1 Nephi'
  });

  const actions = createReaderNavigationActions(state, {
    invoke: noopInvoke,
    loadBooks: async () => [],
    loadChapter: async (bookTitle, chapterNumber) => {
      calls.push([bookTitle, chapterNumber]);
      return chapter;
    },
    searchScriptures: async () => [],
    loadSavedWords: async () => [],
    removeSavedWordRemote: async () => undefined,
    removeSavedHighlightRemote: async () => undefined,
    persistSelection: async () => [],
    getSelectedVerseParts: () => [],
    removeSavedWordLocally: (words) => words,
    removeSavedHighlightLocally: (words) => words,
    refreshVisibleChapter: () => undefined,
    queryVerseElement: () => null,
    getSelection: () => null,
    scrollHighlightIntoView: () => undefined
  });

  await actions.openChapter('2 Nephi', 3);

  assert.deepStrictEqual(calls, [['2 Nephi', 3]]);
  assert.equal(snapshot().isLoading, false);
  assert.equal(snapshot().selectedBook, '1 Nephi');
  assert.equal(snapshot().selectedChapter, 2);
  assert.equal(snapshot().pendingBook, '2 Nephi');
  assert.equal(snapshot().chapter, chapter);
});

test('navigation openChapter surfaces load errors', async () => {
  const { state, snapshot } = createState();
  const actions = createReaderNavigationActions(state, {
    invoke: noopInvoke,
    loadBooks: async () => [],
    loadChapter: async () => {
      throw new Error('load failed');
    },
    searchScriptures: async () => [],
    loadSavedWords: async () => [],
    removeSavedWordRemote: async () => undefined,
    removeSavedHighlightRemote: async () => undefined,
    persistSelection: async () => [],
    getSelectedVerseParts: () => [],
    removeSavedWordLocally: (words) => words,
    removeSavedHighlightLocally: (words) => words,
    refreshVisibleChapter: () => undefined,
    queryVerseElement: () => null,
    getSelection: () => null,
    scrollHighlightIntoView: () => undefined
  });

  await actions.openChapter('2 Nephi', 3);

  assert.equal(snapshot().errorMessage, 'load failed');
  assert.equal(snapshot().isLoading, false);
});

test('search handles short queries, success, and clear', async () => {
  const { state, snapshot } = createState({ searchQuery: '  a ' });
  const calls: string[] = [];
  const actions = createReaderSearchActions(
    state,
    {
      invoke: noopInvoke,
      loadBooks: async () => [],
      loadChapter: async () => chapter,
      searchScriptures: async (query) => {
        calls.push(query);
        return [
          {
            volume: 'Book of Mormon',
            book: '1 Nephi',
            chapter: 2,
            verse: 1,
            reference: '1 Nephi 2:1',
            text: 'Alpha beta gamma.'
          }
        ];
      },
      loadSavedWords: async () => [],
      removeSavedWordRemote: async () => undefined,
      removeSavedHighlightRemote: async () => undefined,
      persistSelection: async () => [],
      getSelectedVerseParts: () => [],
      removeSavedWordLocally: (words) => words,
      removeSavedHighlightLocally: (words) => words,
      refreshVisibleChapter: () => undefined,
      queryVerseElement: () => null,
      getSelection: () => null,
      scrollHighlightIntoView: () => undefined
    },
    async () => undefined
  );

  await actions.handleSearch();
  assert.equal(snapshot().hasSearched, true);
  assert.equal(snapshot().searchError, 'Enter at least 2 characters.');
  assert.deepStrictEqual(snapshot().searchResults, []);
  assert.deepStrictEqual(calls, []);

  state.setSearchQuery('  nephi  ');
  await actions.handleSearch();
  assert.deepStrictEqual(calls, ['nephi']);
  assert.equal(snapshot().searchResults.length, 1);
  assert.equal(snapshot().isSearching, false);

  actions.clearSearch();
  assert.equal(snapshot().searchQuery, '');
  assert.equal(snapshot().searchResults.length, 0);
  assert.equal(snapshot().hasSearched, false);
});

test('saved word actions reload data after removal and expose chapter-local refresh', async () => {
  const reloads: number[] = [];
  const refreshes: number[] = [];
  const removed: number[] = [];
  const highlightRemovals: string[] = [];
  const loadedWords = [savedWord];
  const { state, snapshot } = createState({ savedWords: [savedWord] });

  const actions = createReaderSavedWordActions(
    state,
    {
      invoke: noopInvoke,
      loadBooks: async () => [],
      loadChapter: async () => chapter,
      searchScriptures: async () => [],
      loadSavedWords: async () => {
        reloads.push(1);
        return loadedWords;
      },
      removeSavedWordRemote: async (word) => {
        removed.push(word.id);
      },
      removeSavedHighlightRemote: async (highlight) => {
        highlightRemovals.push(highlight.id);
      },
      persistSelection: async () => [],
      getSelectedVerseParts: () => [],
      removeSavedWordLocally: (words, word) => words.filter((entry) => entry.id !== word.id),
      removeSavedHighlightLocally: (words, highlight) =>
        words.filter((entry) => entry.selection_id !== highlight.id),
      refreshVisibleChapter: () => {
        refreshes.push(1);
      },
      queryVerseElement: () => null,
      getSelection: () => null,
      scrollHighlightIntoView: () => undefined
    },
    async () => {
      reloads.push(1);
      state.setSavedWords(loadedWords);
    }
  );

  await actions.refreshSavedWords();
  assert.equal(snapshot().isLoadingSavedWords, false);
  assert.equal(snapshot().savedWords.length, 1);

  await actions.removeSavedWord(savedWord);
  assert.deepStrictEqual(removed, [1]);
  assert.ok(reloads.length >= 2);
  assert.ok(refreshes.length >= 1);

  await actions.removeSavedHighlight(savedHighlight);
  assert.deepStrictEqual(highlightRemovals, ['group-a']);
});
