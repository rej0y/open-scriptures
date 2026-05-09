import {
  groupSavedWords,
  groupSavedWordsByVerse,
  passageKey,
  textLength,
  textSlice,
  type SavedWord,
  type ScriptureBook,
  type ScriptureChapter,
  type VerseSegment
} from '$lib/study';

export function savedWordsForChapter(
  savedWords: SavedWord[],
  chapter: ScriptureChapter | null
) {
  if (!chapter) return [];

  return savedWords.filter(
    (word) => word.book === chapter.book && word.chapter === chapter.chapter
  );
}

export function chapterOptionsFor(
  books: ScriptureBook[],
  pendingBook: string,
  chapter: ScriptureChapter | null
) {
  const pendingBookInfo = books.find((book) => book.title === pendingBook);
  const chapterCount = pendingBookInfo?.chapter_count ?? chapter?.chapter ?? 1;

  return Array.from({ length: chapterCount }, (_, index) => index + 1);
}

export function cloneChapter(chapter: ScriptureChapter | null) {
  if (!chapter) return null;

  return {
    ...chapter,
    verses: [...chapter.verses]
  };
}

export function verseSegmentsForChapter(
  chapter: ScriptureChapter | null,
  verse: { number: number; text: string },
  savedWordsByVerse: Record<string, SavedWord[]>
): VerseSegment[] {
  if (!chapter) return [{ text: verse.text }];

  const key = passageKey(chapter.book, chapter.chapter, verse.number);
  const ranges = (savedWordsByVerse[key] ?? [])
    .filter((word) => word.start_offset >= 0 && word.end_offset > word.start_offset)
    .sort((first, second) => first.start_offset - second.start_offset);

  if (ranges.length === 0) {
    return [{ text: verse.text }];
  }

  const segments: VerseSegment[] = [];
  let lastIndex = 0;

  for (const range of ranges) {
    const start = Math.max(range.start_offset, lastIndex);
    const end = Math.min(range.end_offset, textLength(verse.text));

    if (end <= start) {
      continue;
    }

    if (start > lastIndex) {
      segments.push({ text: textSlice(verse.text, lastIndex, start) });
    }

    segments.push({ text: textSlice(verse.text, start, end), savedWord: range });
    lastIndex = end;
  }

  if (lastIndex < textLength(verse.text)) {
    segments.push({ text: textSlice(verse.text, lastIndex) });
  }

  return segments;
}

export function deriveReaderViewState(
  books: ScriptureBook[],
  pendingBook: string,
  chapter: ScriptureChapter | null,
  savedWords: SavedWord[]
) {
  const totalVerses = chapter?.verses.length ?? 0;
  const currentChapterSavedWords = savedWordsForChapter(savedWords, chapter);
  const savedWordsByVerse = groupSavedWordsByVerse(currentChapterSavedWords);
  const savedHighlights = groupSavedWords(currentChapterSavedWords);
  const chapterOptions = chapterOptionsFor(books, pendingBook, chapter);

  return {
    totalVerses,
    savedWordsByVerse,
    savedHighlights,
    chapterOptions
  };
}
