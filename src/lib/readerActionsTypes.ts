import type {
  ChapterBookmark,
  SavedHighlight,
  SavedWord,
  ScriptureBook,
  ScriptureChapter,
  ScriptureSearchResult,
  SelectionPart
} from '$lib/study';
import type { InvokeFunction } from '$lib/tauriBridge';

export type ReaderActionState = {
  getBooks: () => ScriptureBook[];
  setBooks: (value: ScriptureBook[]) => void;
  getChapter: () => ScriptureChapter | null;
  setChapter: (value: ScriptureChapter | null) => void;
  getErrorMessage: () => string;
  setErrorMessage: (value: string) => void;
  getIsLoading: () => boolean;
  setIsLoading: (value: boolean) => void;
  getSelectedBook: () => string;
  setSelectedBook: (value: string) => void;
  getSelectedChapter: () => number;
  setSelectedChapter: (value: number) => void;
  getPendingBook: () => string;
  setPendingBook: (value: string) => void;
  getSearchQuery: () => string;
  setSearchQuery: (value: string) => void;
  getSearchError: () => string;
  setSearchError: (value: string) => void;
  getSearchResults: () => ScriptureSearchResult[];
  setSearchResults: (value: ScriptureSearchResult[]) => void;
  getHasSearched: () => boolean;
  setHasSearched: (value: boolean) => void;
  getIsSearching: () => boolean;
  setIsSearching: (value: boolean) => void;
  getIsLoadingSavedWords: () => boolean;
  setIsLoadingSavedWords: (value: boolean) => void;
  getSavedWordsError: () => string;
  setSavedWordsError: (value: string) => void;
  getSavedWords: () => SavedWord[];
  setSavedWords: (value: SavedWord[]) => void;
  getBookmarks: () => ChapterBookmark[];
  setBookmarks: (value: ChapterBookmark[]) => void;
  getBookmarkTitle: () => string;
  setBookmarkTitle: (value: string) => void;
  getIsLoadingBookmarks: () => boolean;
  setIsLoadingBookmarks: (value: boolean) => void;
  getIsSavingBookmark: () => boolean;
  setIsSavingBookmark: (value: boolean) => void;
  getBookmarkError: () => string;
  setBookmarkError: (value: string) => void;
  getIsSavingSelection: () => boolean;
  setIsSavingSelection: (value: boolean) => void;
  getPendingSelectionParts: () => SelectionPart[];
  setPendingSelectionParts: (value: SelectionPart[]) => void;
};

export type ReaderActionDeps = {
  invoke: InvokeFunction;
  loadBooks: () => Promise<ScriptureBook[]>;
  loadChapter: (bookTitle: string, chapterNumber: number) => Promise<ScriptureChapter>;
  searchScriptures: (query: string) => Promise<ScriptureSearchResult[]>;
  loadSavedWords: () => Promise<SavedWord[]>;
  loadBookmarks: () => Promise<ChapterBookmark[]>;
  removeSavedWordRemote: (savedWord: SavedWord) => Promise<unknown>;
  removeSavedHighlightRemote: (savedHighlight: SavedHighlight) => Promise<unknown>;
  saveBookmarkRemote: (
    title: string,
    volume: string,
    book: string,
    chapter: number
  ) => Promise<ChapterBookmark>;
  removeBookmarkRemote: (bookmark: ChapterBookmark) => Promise<unknown>;
  persistSelection: (
    invoke: InvokeFunction,
    chapter: ScriptureChapter,
    parts: SelectionPart[],
    savedWords: SavedWord[]
  ) => Promise<SavedWord[]>;
  getSelectedVerseParts: (
    chapter: ScriptureChapter | null,
    selection: Selection | null,
    queryVerseElement: (verseKey: string) => HTMLElement | null
  ) => SelectionPart[];
  removeSavedWordLocally: (savedWords: SavedWord[], savedWord: SavedWord) => SavedWord[];
  removeSavedHighlightLocally: (
    savedWords: SavedWord[],
    savedHighlight: SavedHighlight
  ) => SavedWord[];
  refreshVisibleChapter: () => void;
  queryVerseElement: (verseKey: string) => HTMLElement | null;
  getSelection: () => Selection | null;
  scrollHighlightIntoView: (selector: string) => void;
};
