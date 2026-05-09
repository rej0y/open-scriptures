import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chapterOptionsFor,
  deriveReaderViewState,
  savedWordsForChapter,
  verseSegmentsForChapter
} from '$lib/readerView';
import type { SavedWord, ScriptureBook, ScriptureChapter } from '$lib/study';

const books: ScriptureBook[] = [
  { title: '1 Nephi', volume: 'Book of Mormon', chapter_count: 22 },
  { title: '2 Nephi', volume: 'Book of Mormon', chapter_count: 33 }
];

const chapter: ScriptureChapter = {
  volume: 'Book of Mormon',
  book: '1 Nephi',
  chapter: 2,
  previous_chapter: 1,
  next_chapter: 3,
  reference: '1 Nephi 2',
  verses: [
    { number: 1, text: 'Alpha beta gamma.' },
    { number: 2, text: 'Delta epsilon zeta.' }
  ]
};

const savedWords: SavedWord[] = [
  {
    id: 1,
    selection_id: 'group-a',
    volume: 'Book of Mormon',
    book: '1 Nephi',
    chapter: 2,
    verse: 1,
    reference: '1 Nephi 2:1',
    selected_text: 'beta',
    verse_text: 'Alpha beta gamma.',
    start_offset: 6,
    end_offset: 10,
    created_at: '2026-05-09T21:00:00.000Z'
  },
  {
    id: 2,
    selection_id: 'group-a',
    volume: 'Book of Mormon',
    book: '1 Nephi',
    chapter: 2,
    verse: 2,
    reference: '1 Nephi 2:2',
    selected_text: 'epsilon',
    verse_text: 'Delta epsilon zeta.',
    start_offset: 6,
    end_offset: 13,
    created_at: '2026-05-09T21:00:01.000Z'
  },
  {
    id: 3,
    selection_id: 'other',
    volume: 'Book of Mormon',
    book: '2 Nephi',
    chapter: 1,
    verse: 1,
    reference: '2 Nephi 1:1',
    selected_text: 'other',
    verse_text: 'Other text.',
    start_offset: 0,
    end_offset: 5,
    created_at: '2026-05-09T21:00:02.000Z'
  }
];

test('savedWordsForChapter keeps only words from the active chapter', () => {
  assert.deepStrictEqual(savedWordsForChapter(savedWords, chapter), savedWords.slice(0, 2));
});

test('chapterOptionsFor uses the pending book chapter count', () => {
  assert.deepStrictEqual(chapterOptionsFor(books, '1 Nephi', chapter), [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22
  ]);
});

test('verseSegmentsForChapter splits and annotates highlighted text', () => {
  const segments = verseSegmentsForChapter(chapter, chapter.verses[0], {
    '1 Nephi:2:1': [savedWords[0]]
  });

  assert.deepStrictEqual(segments, [
    { text: 'Alpha ' },
    { text: 'beta', savedWord: savedWords[0] },
    { text: ' gamma.' }
  ]);
});

test('deriveReaderViewState computes the current chapter view model', () => {
  const viewState = deriveReaderViewState(books, '1 Nephi', chapter, savedWords);

  assert.equal(viewState.totalVerses, 2);
  assert.deepStrictEqual(viewState.chapterOptions, [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22
  ]);
  assert.equal(viewState.savedHighlights.length, 1);
  assert.deepStrictEqual(viewState.savedWordsByVerse['1 Nephi:2:1'], [savedWords[0]]);
});
