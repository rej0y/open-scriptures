export type ChapterVerse = {
  number: number;
  text: string;
  topic_links: TopicalGuideLink[];
};

export type TopicalGuideLink = {
  topic_id: number;
  title: string;
  start_offset: number;
  end_offset: number;
};

export type TopicalGuideTopic = {
  id: number;
  title: string;
  related_topics: string;
  content: string;
  source_page: number;
};

export type ScriptureChapter = {
  volume: string;
  book: string;
  chapter: number;
  previous_chapter: number | null;
  next_chapter: number | null;
  reference: string;
  verses: ChapterVerse[];
};

export type ScriptureBook = {
  title: string;
  short_title: string;
  volume: string;
  chapter_count: number;
};

export type ScriptureSearchResult = {
  volume: string;
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  text: string;
};

export type SavedWord = {
  id: number;
  selection_id: string;
  volume: string;
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  selected_text: string;
  verse_text: string;
  start_offset: number;
  end_offset: number;
  created_at: string;
};

export type SavedHighlight = {
  id: string;
  text: string;
  book: string;
  chapter: number;
  volume: string;
  reference: string;
  created_at: string;
  words: SavedWord[];
};

export type ChapterBookmark = {
  id: number;
  title: string;
  volume: string;
  book: string;
  chapter: number;
  reference: string;
  created_at: string;
};

export type ChapterNote = {
  id: string;
  book: string;
  chapter: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  manualWidth?: boolean;
  text: string;
};

export type VerseSegment = {
  text: string;
  savedWord?: SavedWord;
  topicLink?: TopicalGuideLink;
};

export type SelectionPart = {
  verse: ChapterVerse;
  selectedText: string;
  startOffset: number;
  endOffset: number;
};

export function passageKey(book: string, chapterNumber: number, verseNumber: number) {
  return `${book}:${chapterNumber}:${verseNumber}`;
}

export function textLength(value: string) {
  return Array.from(value).length;
}

export function textSlice(value: string, start: number, end?: number) {
  return Array.from(value).slice(start, end).join('');
}

export function highlightId(word: SavedWord) {
  return word.selection_id || String(word.id);
}

export function highlightKey(word: SavedWord) {
  return [
    word.book,
    word.chapter,
    word.verse,
    word.start_offset,
    word.end_offset,
    word.selected_text
  ].join(':');
}

export function wordSort(first: SavedWord, second: SavedWord) {
  return (
    first.chapter - second.chapter ||
    first.verse - second.verse ||
    first.start_offset - second.start_offset ||
    first.id - second.id
  );
}

export function highlightReference(words: SavedWord[]) {
  const sortedWords = [...words].sort(wordSort);
  const first = sortedWords[0];
  const last = sortedWords[sortedWords.length - 1];

  if (!first || !last) return '';
  if (first.verse === last.verse) return `${first.book} ${first.chapter}:${first.verse}`;
  return `${first.book} ${first.chapter}:${first.verse}-${last.verse}`;
}

export function highlightGroupKey(word: SavedWord) {
  return [word.book, word.chapter, word.selection_id || String(word.id)].join(':');
}

export function groupSavedWords(words: SavedWord[]) {
  const uniqueWords = words.reduce<SavedWord[]>((dedupedWords, word) => {
    const alreadyIncluded = dedupedWords.some(
      (existingWord) =>
        existingWord.book === word.book &&
        existingWord.chapter === word.chapter &&
        existingWord.verse === word.verse &&
        existingWord.start_offset === word.start_offset &&
        existingWord.end_offset === word.end_offset &&
        existingWord.selected_text === word.selected_text
    );

    return alreadyIncluded ? dedupedWords : [...dedupedWords, word];
  }, []);

  const groups = uniqueWords.reduce<Record<string, SavedWord[]>>((savedGroups, word) => {
    const key = highlightGroupKey(word);
    savedGroups[key] = [...(savedGroups[key] ?? []), word];
    return savedGroups;
  }, {});

  return Object.entries(groups)
    .map(([id, groupWords]) => {
      const sortedWords = [...groupWords].sort(wordSort);
      const firstWord = sortedWords[0];

      return {
        id,
        text: sortedWords.map((word) => word.selected_text).join(' '),
        book: firstWord?.book ?? '',
        chapter: firstWord?.chapter ?? 0,
        volume: firstWord?.volume ?? '',
        reference: highlightReference(sortedWords),
        created_at: sortedWords.reduce(
          (latest, word) => (word.created_at > latest ? word.created_at : latest),
          sortedWords[0]?.created_at ?? ''
        ),
        words: sortedWords
      };
    })
    .sort((first, second) => second.created_at.localeCompare(first.created_at));
}

export function groupSavedWordsByVerse(words: SavedWord[]) {
  return words.reduce<Record<string, SavedWord[]>>((groups, savedWord) => {
    const key = passageKey(savedWord.book, savedWord.chapter, savedWord.verse);
    const existingWords = groups[key] ?? [];
    const alreadyGrouped = existingWords.some(
      (word) =>
        word.start_offset === savedWord.start_offset &&
        word.end_offset === savedWord.end_offset &&
        word.selected_text === savedWord.selected_text
    );

    groups[key] = alreadyGrouped ? existingWords : [...existingWords, savedWord];
    return groups;
  }, {});
}

export function selectionPartForVerse(
  range: Range,
  verse: ChapterVerse,
  verseElement: HTMLElement
): SelectionPart | null {
  const selectedRange = document.createRange();
  selectedRange.selectNodeContents(verseElement);

  if (verseElement.contains(range.startContainer)) {
    selectedRange.setStart(range.startContainer, range.startOffset);
  }

  if (verseElement.contains(range.endContainer)) {
    selectedRange.setEnd(range.endContainer, range.endOffset);
  }

  const rawText = selectedRange.toString();
  const selectedText = rawText.trim();

  if (!selectedText) return null;

  const offsetRange = document.createRange();
  offsetRange.selectNodeContents(verseElement);
  offsetRange.setEnd(selectedRange.startContainer, selectedRange.startOffset);

  const startOffset = textLength(offsetRange.toString()) + textLength(rawText) - textLength(rawText.trimStart());
  const endOffset = startOffset + textLength(selectedText);

  return {
    verse,
    selectedText,
    startOffset,
    endOffset
  };
}

export function verseSegmentsForVerse(
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
  const boundaries = new Set([0, textLength(verse.text)]);

  for (const range of [...savedRanges, ...topicRanges]) {
    boundaries.add(Math.max(0, Math.min(range.start_offset, textLength(verse.text))));
    boundaries.add(Math.max(0, Math.min(range.end_offset, textLength(verse.text))));
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
