import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeSavedWords,
  removeSavedHighlightLocally,
  removeSavedWordLocally
} from '$lib/readerSelection';
import type { SavedHighlight, SavedWord } from '$lib/study';

const firstWord: SavedWord = {
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
};

const secondWord: SavedWord = {
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
};

const duplicateWord: SavedWord = {
  ...firstWord,
  id: 99
};

test('removeSavedWordLocally removes the matching verse span', () => {
  const remaining = removeSavedWordLocally([firstWord, secondWord], firstWord);

  assert.deepStrictEqual(remaining, [secondWord]);
});

test('removeSavedHighlightLocally removes every word in the highlight', () => {
  const highlight: SavedHighlight = {
    id: 'group-a',
    text: 'beta epsilon',
    book: '1 Nephi',
    chapter: 2,
    volume: 'Book of Mormon',
    reference: '1 Nephi 2:1-2',
    created_at: '2026-05-09T21:00:01.000Z',
    words: [firstWord, secondWord]
  };

  const remaining = removeSavedHighlightLocally([firstWord, secondWord, duplicateWord], highlight);

  assert.deepStrictEqual(remaining, []);
});

test('mergeSavedWords keeps optimistic saves and de-dupes by highlight key', () => {
  const optimisticWord: SavedWord = {
    ...firstWord,
    id: -1,
    created_at: '2026-05-09T21:05:00.000Z'
  };

  const merged = mergeSavedWords(
    [optimisticWord, secondWord],
    [firstWord, secondWord]
  );

  assert.deepStrictEqual(merged, [secondWord, firstWord]);
});
