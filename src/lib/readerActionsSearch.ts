import type { ReaderActionDeps, ReaderActionState } from '$lib/readerActionsTypes';

export function createReaderSearchActions(
  state: ReaderActionState,
  deps: ReaderActionDeps,
  openChapter: (bookTitle: string, chapterNumber: number) => Promise<void>
) {
  async function handleSearch() {
    const query = state.getSearchQuery().trim();
    state.setSearchError('');
    state.setHasSearched(true);

    if (query.length < 2) {
      state.setSearchResults([]);
      state.setSearchError('Enter at least 2 characters.');
      return;
    }

    state.setIsSearching(true);

    try {
      state.setSearchResults(await deps.searchScriptures(query));
    } catch (error) {
      state.setSearchResults([]);
      state.setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      state.setIsSearching(false);
    }
  }

  function clearSearch() {
    state.setSearchQuery('');
    state.setSearchError('');
    state.setSearchResults([]);
    state.setHasSearched(false);
  }

  async function openSearchResult(result: { book: string; chapter: number }) {
    await openChapter(result.book, result.chapter);
  }

  return {
    handleSearch,
    clearSearch,
    openSearchResult
  };
}
