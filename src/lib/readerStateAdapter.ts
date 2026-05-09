import type { ReaderActionState } from '$lib/readerActionsTypes';
import type {
  ChapterBookmark,
  SavedWord,
  ScriptureBook,
  ScriptureChapter,
  ScriptureSearchResult,
  SelectionPart
} from '$lib/study';

type Binding<T> = [() => T, (value: T) => void];

type ReaderStateBindings = {
  books: Binding<ScriptureBook[]>;
  chapter: Binding<ScriptureChapter | null>;
  errorMessage: Binding<string>;
  isLoading: Binding<boolean>;
  selectedBook: Binding<string>;
  selectedChapter: Binding<number>;
  pendingBook: Binding<string>;
  searchQuery: Binding<string>;
  searchError: Binding<string>;
  searchResults: Binding<ScriptureSearchResult[]>;
  hasSearched: Binding<boolean>;
  isSearching: Binding<boolean>;
  isLoadingSavedWords: Binding<boolean>;
  savedWordsError: Binding<string>;
  savedWords: Binding<SavedWord[]>;
  bookmarks: Binding<ChapterBookmark[]>;
  bookmarkTitle: Binding<string>;
  bookmarkError: Binding<string>;
  isLoadingBookmarks: Binding<boolean>;
  isSavingBookmark: Binding<boolean>;
  isSavingSelection: Binding<boolean>;
  pendingSelectionParts: Binding<SelectionPart[]>;
};

export function createReaderStateAdapter(bindings: ReaderStateBindings): ReaderActionState {
  return {
    getBooks: bindings.books[0],
    setBooks: bindings.books[1],
    getChapter: bindings.chapter[0],
    setChapter: bindings.chapter[1],
    getErrorMessage: bindings.errorMessage[0],
    setErrorMessage: bindings.errorMessage[1],
    getIsLoading: bindings.isLoading[0],
    setIsLoading: bindings.isLoading[1],
    getSelectedBook: bindings.selectedBook[0],
    setSelectedBook: bindings.selectedBook[1],
    getSelectedChapter: bindings.selectedChapter[0],
    setSelectedChapter: bindings.selectedChapter[1],
    getPendingBook: bindings.pendingBook[0],
    setPendingBook: bindings.pendingBook[1],
    getSearchQuery: bindings.searchQuery[0],
    setSearchQuery: bindings.searchQuery[1],
    getSearchError: bindings.searchError[0],
    setSearchError: bindings.searchError[1],
    getSearchResults: bindings.searchResults[0],
    setSearchResults: bindings.searchResults[1],
    getHasSearched: bindings.hasSearched[0],
    setHasSearched: bindings.hasSearched[1],
    getIsSearching: bindings.isSearching[0],
    setIsSearching: bindings.isSearching[1],
    getIsLoadingSavedWords: bindings.isLoadingSavedWords[0],
    setIsLoadingSavedWords: bindings.isLoadingSavedWords[1],
    getSavedWordsError: bindings.savedWordsError[0],
    setSavedWordsError: bindings.savedWordsError[1],
    getSavedWords: bindings.savedWords[0],
    setSavedWords: bindings.savedWords[1],
    getBookmarks: bindings.bookmarks[0],
    setBookmarks: bindings.bookmarks[1],
    getBookmarkTitle: bindings.bookmarkTitle[0],
    setBookmarkTitle: bindings.bookmarkTitle[1],
    getBookmarkError: bindings.bookmarkError[0],
    setBookmarkError: bindings.bookmarkError[1],
    getIsLoadingBookmarks: bindings.isLoadingBookmarks[0],
    setIsLoadingBookmarks: bindings.isLoadingBookmarks[1],
    getIsSavingBookmark: bindings.isSavingBookmark[0],
    setIsSavingBookmark: bindings.isSavingBookmark[1],
    getIsSavingSelection: bindings.isSavingSelection[0],
    setIsSavingSelection: bindings.isSavingSelection[1],
    getPendingSelectionParts: bindings.pendingSelectionParts[0],
    setPendingSelectionParts: bindings.pendingSelectionParts[1]
  };
}
