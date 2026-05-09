import type {
  SavedHighlight,
  SavedWord,
  ScriptureBook,
  ScriptureChapter,
  ScriptureSearchResult
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

export function loadSavedWords() {
  return invoke<SavedWord[]>('list_saved_words');
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
