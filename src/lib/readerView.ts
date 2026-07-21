import {
  groupSavedWords,
  groupSavedWordsByVerse,
  passageKey,
  textLength,
  textSlice,
  type SavedWord,
  type ScriptureBook,
  type ScriptureChapter,
  type ChapterVerse,
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
  verse: ChapterVerse,
  savedWordsByVerse: Record<string, SavedWord[]>
): VerseSegment[] {
  if (!chapter) return [{ text: verse.text }];

  const key = passageKey(chapter.book, chapter.chapter, verse.number);
  const savedRanges = (savedWordsByVerse[key] ?? [])
    .filter((word) => word.start_offset >= 0 && word.end_offset > word.start_offset)
    .sort((first, second) => first.start_offset - second.start_offset);
  const topicRanges = verse.topic_links ?? [];
  const verseLength = textLength(verse.text);
  const boundaries = new Set([0, verseLength]);

  for (const range of [...savedRanges, ...topicRanges]) {
    boundaries.add(Math.max(0, Math.min(range.start_offset, verseLength)));
    boundaries.add(Math.max(0, Math.min(range.end_offset, verseLength)));
  }

  const offsets = [...boundaries].sort((first, second) => first - second);
  return offsets.slice(0, -1).flatMap((start, index) => {
    const end = offsets[index + 1];
    if (end <= start) return [];

    const segment: VerseSegment = { text: textSlice(verse.text, start, end) };
    const savedWord = savedRanges.find(
      (range) => range.start_offset <= start && range.end_offset >= end
    );
    const topicLink = topicRanges.find(
      (range) => range.start_offset <= start && range.end_offset >= end
    );
    if (savedWord) segment.savedWord = savedWord;
    if (topicLink) segment.topicLink = topicLink;
    return [segment];
  });
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
