import { highlightKey, type SavedHighlight, type SavedWord } from '$lib/study';
import type { ReaderActionDeps, ReaderActionState } from '$lib/readerActionsTypes';

export function createReaderSavedWordActions(
  state: ReaderActionState,
  deps: ReaderActionDeps,
  reloadSavedWords: () => Promise<void>
) {
  async function removeSavedWord(savedWord: SavedWord) {
    state.setSavedWordsError('');
    state.setSavedWords(deps.removeSavedWordLocally(state.getSavedWords(), savedWord));

    if (savedWord.id < 0) return;

    try {
      await deps.removeSavedWordRemote(savedWord);
      await reloadSavedWords();
      deps.refreshVisibleChapter();
    } catch (error) {
      state.setSavedWordsError(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeSavedHighlight(savedHighlight: SavedHighlight) {
    state.setSavedWordsError('');
    state.setSavedWords(deps.removeSavedHighlightLocally(state.getSavedWords(), savedHighlight));

    try {
      await deps.removeSavedHighlightRemote(savedHighlight);
      await reloadSavedWords();
      deps.refreshVisibleChapter();
    } catch (error) {
      state.setSavedWordsError(error instanceof Error ? error.message : String(error));
    }
  }

  function highlightSelector(word: SavedWord) {
    return `[data-highlight-key="${CSS.escape(highlightKey(word))}"]`;
  }

  async function openSavedHighlight(savedHighlight: SavedHighlight) {
    const firstWord = savedHighlight.words[0];
    if (!firstWord) return;

    deps.scrollHighlightIntoView(highlightSelector(firstWord));
  }

  async function refreshSavedWords() {
    state.setIsLoadingSavedWords(true);
    state.setSavedWordsError('');

    try {
      state.setSavedWords(await deps.loadSavedWords());
    } catch (error) {
      state.setSavedWordsError(error instanceof Error ? error.message : String(error));
    } finally {
      state.setIsLoadingSavedWords(false);
    }
  }

  return {
    refreshSavedWords,
    removeSavedWord,
    removeSavedHighlight,
    openSavedHighlight
  };
}
