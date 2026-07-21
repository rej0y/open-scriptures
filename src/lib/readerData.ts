import type {
  ChapterBookmark,
  SavedHighlight,
  SavedWord,
  ScriptureBook,
  ScriptureChapter,
  ScriptureSearchResult,
  TopicalGuideTopic
} from '$lib/study';
import { invoke } from '$lib/tauriBridge';

export function loadBooks() {
  return invoke<ScriptureBook[]>('list_books');
}

export function loadChapter(bookTitle: string, chapterNumber: number) {
  return invoke<ScriptureChapter>('get_chapter', {
    book: bookTitle,
    chapterNumber
  });
}

export function searchScriptures(query: string) {
  return invoke<ScriptureSearchResult[]>('search_scriptures', { query });
}

export function loadTopicalGuideTopic(topicId: number) {
  return invoke<TopicalGuideTopic>('get_topical_guide_topic', { topicId });
}

export function loadSavedWords() {
  return invoke<SavedWord[]>('list_saved_words');
}

export function loadBookmarks() {
  return invoke<ChapterBookmark[]>('list_bookmarks');
}

export function removeSavedWord(savedWord: SavedWord) {
  return invoke('remove_saved_word', { id: savedWord.id });
}

export function removeSavedHighlight(savedHighlight: SavedHighlight) {
  return Promise.all(
    savedHighlight.words
      .filter((word) => word.id > 0)
      .map((word) => invoke('remove_saved_word', { id: word.id }))
  );
}

export function saveBookmark(title: string, volume: string, book: string, chapter: number) {
  return invoke<ChapterBookmark>('save_bookmark', {
    title,
    volume,
    book,
    chapter
  });
}

export function removeBookmark(bookmark: ChapterBookmark) {
  return invoke('remove_bookmark', { id: bookmark.id });
}
