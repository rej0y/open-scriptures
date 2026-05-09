import type { ScriptureChapter } from '$lib/study';

export function cloneVisibleChapter(chapter: ScriptureChapter | null) {
  if (!chapter) return null;

  return {
    ...chapter,
    verses: [...chapter.verses]
  };
}
