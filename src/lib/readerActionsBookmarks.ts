import type { ReaderActionDeps, ReaderActionState } from '$lib/readerActionsTypes';
import type { ChapterBookmark } from '$lib/study';

export function createReaderBookmarkActions(
  state: ReaderActionState,
  deps: ReaderActionDeps,
  openChapter: (bookTitle: string, chapterNumber: number) => Promise<void>
) {
  async function refreshBookmarks() {
    state.setIsLoadingBookmarks(true);
    state.setBookmarkError('');

    try {
      state.setBookmarks(await deps.loadBookmarks());
    } catch (error) {
      state.setBookmarkError(error instanceof Error ? error.message : String(error));
    } finally {
      state.setIsLoadingBookmarks(false);
    }
  }

  async function saveCurrentBookmark() {
    const chapter = state.getChapter();
    const title = state.getBookmarkTitle().trim();

    if (!chapter) return;
    if (!title) {
      state.setBookmarkError('Enter a bookmark title before saving.');
      return;
    }

    state.setIsSavingBookmark(true);
    state.setBookmarkError('');

    try {
      await deps.saveBookmarkRemote(title, chapter.volume, chapter.book, chapter.chapter);
      state.setBookmarkTitle('');
      await refreshBookmarks();
    } catch (error) {
      state.setBookmarkError(error instanceof Error ? error.message : String(error));
    } finally {
      state.setIsSavingBookmark(false);
    }
  }

  async function openBookmark(bookmark: ChapterBookmark) {
    await openChapter(bookmark.book, bookmark.chapter);
  }

  async function removeBookmark(bookmark: ChapterBookmark) {
    state.setBookmarkError('');

    try {
      await deps.removeBookmarkRemote(bookmark);
      await refreshBookmarks();
    } catch (error) {
      state.setBookmarkError(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    refreshBookmarks,
    saveCurrentBookmark,
    openBookmark,
    removeBookmark
  };
}
