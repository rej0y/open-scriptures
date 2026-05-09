import type { ReaderActionDeps, ReaderActionState } from '$lib/readerActionsTypes';

export function createReaderNavigationActions(state: ReaderActionState, deps: ReaderActionDeps) {
  async function openChapter(
    bookTitle = state.getSelectedBook(),
    chapterNumber = state.getSelectedChapter()
  ) {
    state.setIsLoading(true);
    state.setErrorMessage('');
    state.setSelectedBook(bookTitle);
    state.setPendingBook(bookTitle);
    state.setSelectedChapter(chapterNumber);

    try {
      const loadedChapter = await deps.loadChapter(bookTitle, chapterNumber);
      state.setChapter(loadedChapter);
      state.setSelectedBook(loadedChapter.book);
      state.setSelectedChapter(loadedChapter.chapter);
    } catch (error) {
      state.setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      state.setIsLoading(false);
    }
  }

  async function handleBookChange(event: Event) {
    const nextBook = (event.currentTarget as HTMLSelectElement).value;
    await openChapter(nextBook, 1);
  }

  async function handleChapterChange(event: Event) {
    const nextChapter = Number((event.currentTarget as HTMLSelectElement).value);
    await openChapter(state.getPendingBook(), nextChapter);
  }

  return {
    openChapter,
    handleBookChange,
    handleChapterChange
  };
}
