import {
  highlightKey,
  passageKey,
  selectionPartForVerse,
  type ChapterVerse,
  type SavedHighlight,
  type SavedWord,
  type ScriptureChapter,
  type SelectionPart
} from '$lib/study';
import type { InvokeFunction } from '$lib/tauriBridge';

export function getSelectedVerseParts(
  chapter: ScriptureChapter | null,
  selection: Selection | null,
  queryVerseElement: (verseKey: string) => HTMLElement | null
): SelectionPart[] {
  if (!chapter || !selection || selection.rangeCount === 0 || selection.toString().trim().length === 0) {
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
    (verse) => passageKey(chapter.book, chapter.chapter, verse.number) === startKey
  );
  const endIndex = chapter.verses.findIndex(
    (verse) => passageKey(chapter.book, chapter.chapter, verse.number) === endKey
  );

  if (startIndex === -1 || endIndex === -1) {
    return [];
  }

  const firstIndex = Math.min(startIndex, endIndex);
  const lastIndex = Math.max(startIndex, endIndex);
  const parts: SelectionPart[] = [];

  for (const verse of chapter.verses.slice(firstIndex, lastIndex + 1)) {
    const key = passageKey(chapter.book, chapter.chapter, verse.number);
    const verseElement = queryVerseElement(key);
    const part = verseElement ? selectionPartForVerse(range, verse, verseElement) : null;

    if (part) {
      parts.push(part);
    }
  }

  return parts;
}

export function buildOptimisticSavedWords(
  chapter: ScriptureChapter,
  parts: SelectionPart[],
  selectionId: string,
  createdAt: string
) {
  return parts.map((part, index) => ({
    id: -Date.now() - index,
    selection_id: selectionId,
    volume: chapter.volume,
    book: chapter.book,
    chapter: chapter.chapter,
    verse: part.verse.number,
    reference: `${chapter.book} ${chapter.chapter}:${part.verse.number}`,
    selected_text: part.selectedText,
    verse_text: part.verse.text,
    start_offset: part.startOffset,
    end_offset: part.endOffset,
    created_at: createdAt
  }));
}

export function mergeSavedWords(existingWords: SavedWord[], nextWords: SavedWord[]) {
  const savedWordIds = new Set(nextWords.map((word) => word.id));
  const savedKeys = new Set(nextWords.map(highlightKey));

  return [
    ...nextWords,
    ...existingWords.filter(
      (word) => !savedWordIds.has(word.id) && word.id > 0 && !savedKeys.has(highlightKey(word))
    )
  ].sort((first, second) => second.created_at.localeCompare(first.created_at) || second.id - first.id);
}

export function removeSavedWordLocally(savedWords: SavedWord[], savedWord: SavedWord) {
  return savedWords.filter(
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
}

export function removeSavedHighlightLocally(
  savedWords: SavedWord[],
  savedHighlight: SavedHighlight
) {
  const removedKeys = new Set(savedHighlight.words.map(highlightKey));
  return savedWords.filter((word) => !removedKeys.has(highlightKey(word)));
}

export async function persistSelection(
  invoke: InvokeFunction,
  chapter: ScriptureChapter,
  parts: SelectionPart[],
  savedWords: SavedWord[]
) {
  if (parts.length === 0) {
    return savedWords;
  }

  const selectionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const optimisticWords = buildOptimisticSavedWords(chapter, parts, selectionId, createdAt);
  const optimisticKeys = new Set(optimisticWords.map(highlightKey));

  const optimisticSavedWords = [
    ...optimisticWords,
    ...savedWords.filter((word) => !optimisticKeys.has(highlightKey(word)))
  ];

  const savedSelection = await Promise.all(
    parts.map((part) =>
      invoke<SavedWord>('save_word', {
        book: chapter.book,
        chapter: chapter.chapter,
        verse: part.verse.number,
        selectionId,
        selectedText: part.selectedText,
        startOffset: part.startOffset,
        endOffset: part.endOffset
      })
    )
  );

  return mergeSavedWords(optimisticSavedWords, savedSelection);
}

function selectionNodeElement(node: Node) {
  return node instanceof Element ? node : node.parentElement;
}
