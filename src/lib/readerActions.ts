import type { ReaderActionDeps, ReaderActionState } from '$lib/readerActionsTypes';
import { createReaderBookmarkActions } from '$lib/readerActionsBookmarks';
import { createReaderNavigationActions } from '$lib/readerActionsNavigation';
import { createReaderSavedWordActions } from '$lib/readerActionsSavedWords';
import { createReaderSearchActions } from '$lib/readerActionsSearch';
import { createReaderSelectionActions } from '$lib/readerActionsSelection';

export function createReaderActions(state: ReaderActionState, deps: ReaderActionDeps) {
  const navigationActions = createReaderNavigationActions(state, deps);
  const bookmarkActions = createReaderBookmarkActions(
    state,
    deps,
    navigationActions.openChapter
  );
  const savedWordActions = createReaderSavedWordActions(
    state,
    deps,
    () => savedWordActions.refreshSavedWords()
  );
  const searchActions = createReaderSearchActions(
    state,
    deps,
    navigationActions.openChapter
  );
  const selectionActions = createReaderSelectionActions(
    state,
    deps,
    () => savedWordActions.refreshSavedWords()
  );

  async function bootstrap(bookTitle: string, chapterNumber: number) {
    state.setIsLoading(true);

    try {
      state.setBooks(await deps.loadBooks());
      await bookmarkActions.refreshBookmarks();
      await savedWordActions.refreshSavedWords();
      await navigationActions.openChapter(bookTitle, chapterNumber);
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : String(error));
      state.setIsLoading(false);
    }
  }

  return {
    bootstrap,
    ...navigationActions,
    ...bookmarkActions,
    ...searchActions,
    ...savedWordActions,
    ...selectionActions
  };
}
