import type { ReaderActionDeps, ReaderActionState } from '$lib/readerActionsTypes';

export function createReaderSelectionActions(
  state: ReaderActionState,
  deps: ReaderActionDeps,
  refreshSavedWords: () => Promise<void>
) {
  async function saveCurrentSelection() {
    const chapter = state.getChapter();
    if (!chapter || state.getIsSavingSelection()) return;

    const selection = deps.getSelection();
    const parts =
      state.getPendingSelectionParts().length > 0
        ? state.getPendingSelectionParts()
        : deps.getSelectedVerseParts(chapter, selection, deps.queryVerseElement);

    if (parts.length === 0) return;

    state.setIsSavingSelection(true);
    state.setSavedWordsError('');

    try {
      state.setSavedWords(
        await deps.persistSelection(deps.invoke, chapter, parts, state.getSavedWords())
      );
      deps.getSelection()?.removeAllRanges();
      await refreshSavedWords();
      deps.refreshVisibleChapter();
    } catch (error) {
      state.setSavedWordsError(error instanceof Error ? error.message : String(error));
    } finally {
      state.setIsSavingSelection(false);
      state.setPendingSelectionParts([]);
    }
  }

  function updatePendingSelection() {
    const chapter = state.getChapter();
    state.setPendingSelectionParts(
      chapter ? deps.getSelectedVerseParts(chapter, deps.getSelection(), deps.queryVerseElement) : []
    );
  }

  function saveCurrentSelectionSoon() {
    updatePendingSelection();
    setTimeout(saveCurrentSelection, 60);
  }

  return {
    saveCurrentSelection,
    updatePendingSelection,
    saveCurrentSelectionSoon
  };
}
