<script lang="ts">
  import { tick } from 'svelte';
  import type {
    ChapterNote,
    ChapterVerse,
    SavedWord,
    ScriptureChapter,
    VerseSegment
  } from '$lib/study';

  export let chapter: ScriptureChapter | null = null;
  export let isLoading = false;
  export let errorMessage = '';
  export let totalVerses = 0;
  export let activeHighlightId = '';
  export let notes: ChapterNote[] = [];
  export let verseSegments = (_verse: ChapterVerse) => [] as VerseSegment[];
  export let highlightId = (_word: SavedWord) => '';
  export let highlightKey = (_word: SavedWord) => '';
  export let onRemoveHighlight = async (_word: SavedWord) => {};
  export let onCreateNote = (_note: ChapterNote) => {};
  export let onUpdateNote = (_id: string, _text: string) => {};
  export let onUpdateNoteLayout = (
    _id: string,
    _layout: Pick<ChapterNote, 'x' | 'y' | 'width' | 'height'>
  ) => {};
  export let onRemoveNotes = (_ids: string[]) => {};
  export let onPreviousChapter = () => {};
  export let onNextChapter = () => {};

  let chapterElement: HTMLElement;
  const noteInputs: Record<string, HTMLTextAreaElement> = {};
  const noteElements: Record<string, HTMLElement> = {};
  let noteSelection:
    | { startX: number; startY: number; left: number; top: number; width: number; height: number }
    | undefined;
  let noteInteraction:
    | { id: string; mode: 'move' | 'left' | 'right' | 'top' | 'bottom'; startX: number; startY: number; note: ChapterNote }
    | undefined;
  let pendingNoteMove:
    | { startX: number; startY: number; note: ChapterNote }
    | undefined;
  const minimumNoteWidth = 16;
  const minimumNoteHeight = 28;
  const noteInset = 16;

  function clampNotePosition(x: number, y: number, width: number) {
    return {
      x: Math.max(noteInset, Math.min(x, chapterElement.clientWidth - width - noteInset)),
      y: Math.max(noteInset, y)
    };
  }

  function readerTextRects() {
    return Array.from(
      chapterElement.querySelectorAll<HTMLElement>('.chapter-header, .verse-text, .chapter-footer')
    ).flatMap((element) => {
      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();

      while (node) {
        if (node.textContent?.trim()) {
          textNodes.push(node as Text);
        }
        node = walker.nextNode();
      }

      return textNodes.flatMap((textNode) => {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        return Array.from(range.getClientRects());
      });
    });
  }

  function pointIsOverReaderText(clientX: number, clientY: number) {
    return readerTextRects().some(
      (bounds) =>
        clientX >= bounds.left &&
        clientX <= bounds.left + bounds.width &&
        clientY >= bounds.top &&
        clientY <= bounds.top + bounds.height
    );
  }

  function noteOverlapsReaderText(x: number, y: number, width: number, height: number) {
    const chapterBounds = chapterElement.getBoundingClientRect();
    const textRects = readerTextRects();

    return textRects.some((bounds) => {
      const textLeft = bounds.left - chapterBounds.left;
      const textTop = bounds.top - chapterBounds.top;

      return (
        x < textLeft + bounds.width &&
        x + width > textLeft &&
        y < textTop + bounds.height &&
        y + height > textTop
      );
    });
  }

  function noteOverlapsAnotherNote(id: string, x: number, y: number, width: number, height: number) {
    const chapterBounds = chapterElement.getBoundingClientRect();
    return notes.some((note) => {
      if (note.id === id) return false;
      const bounds = noteElements[note.id]?.getBoundingClientRect();
      if (!bounds) return false;
      const otherX = bounds.left - chapterBounds.left;
      const otherY = bounds.top - chapterBounds.top;
      return x < otherX + bounds.width && x + width > otherX && y < otherY + bounds.height && y + height > otherY;
    });
  }

  function noteTextFits(id: string, width: number, height: number) {
    const textarea = noteInputs[id];
    if (!textarea) return true;
    return measuredTextHeight(textarea, textarea.value, width) <= height;
  }

  function minimumWidthForNoteText(id: string, height: number, maximumWidth: number) {
    const textarea = noteInputs[id];
    if (!textarea || !textarea.value) return minimumNoteWidth;
    if (!noteTextFits(id, maximumWidth, height)) return undefined;
    if (noteTextFits(id, minimumNoteWidth, height)) return minimumNoteWidth;

    let lower = minimumNoteWidth;
    let upper = maximumWidth;
    while (upper - lower > 1) {
      const middle = (lower + upper) / 2;
      if (noteTextFits(id, middle, height)) {
        upper = middle;
      } else {
        lower = middle;
      }
    }
    return upper;
  }

  function noteFits(id: string, x: number, y: number, width: number, height: number, checkText = false) {
    return (
      x >= noteInset &&
      y >= noteInset &&
      x + width <= chapterElement.clientWidth - noteInset &&
      !noteOverlapsReaderText(x, y, width, height) &&
      !noteOverlapsAnotherNote(id, x, y, width, height) &&
      (!checkText || noteTextFits(id, width, height))
    );
  }

  function limitAxis(start: number, target: number, isValid: (value: number) => boolean) {
    const step = target >= start ? 2 : -2;
    let value = start;
    while ((step > 0 && value + step <= target) || (step < 0 && value + step >= target)) {
      const next = value + step;
      if (!isValid(next)) break;
      value = next;
    }
    return isValid(target) ? target : value;
  }

  function closestValidAxis(start: number, target: number, isValid: (value: number) => boolean) {
    if (isValid(target)) return target;
    const step = target >= start ? -2 : 2;
    let value = target + step;
    while ((step < 0 && value > start) || (step > 0 && value < start)) {
      if (isValid(value)) return value;
      value += step;
    }
    return start;
  }

  function startNoteInteraction(
    event: PointerEvent,
    note: ChapterNote,
    mode: 'move' | 'left' | 'right' | 'top' | 'bottom'
  ) {
    event.preventDefault();
    event.stopPropagation();
    noteInteraction = { id: note.id, mode, startX: event.clientX, startY: event.clientY, note: { ...note } };
    chapterElement.setPointerCapture(event.pointerId);
  }

  function startNoteMouseMove(event: MouseEvent, note: ChapterNote) {
    if (event.target instanceof Element && event.target.closest('.note-handle')) return;
    pendingNoteMove = { startX: event.clientX, startY: event.clientY, note: { ...note } };
  }

  function handleWindowMouseMove(event: MouseEvent) {
    if (pendingNoteMove && event.buttons === 1) {
      const distance = Math.hypot(
        event.clientX - pendingNoteMove.startX,
        event.clientY - pendingNoteMove.startY
      );
      if (distance >= 4) {
        event.preventDefault();
        document.getSelection()?.removeAllRanges();
        noteInteraction = {
          id: pendingNoteMove.note.id,
          mode: 'move',
          startX: pendingNoteMove.startX,
          startY: pendingNoteMove.startY,
          note: pendingNoteMove.note
        };
        pendingNoteMove = undefined;
      }
    }
    if (noteInteraction) updateNoteInteraction(event);
  }

  function updateNoteInteraction(event: Pick<MouseEvent, 'clientX' | 'clientY' | 'buttons'>) {
    if (!noteInteraction) return;
    if (event.buttons === 0) {
      noteInteraction = undefined;
      return;
    }
    const { note, mode } = noteInteraction;
    const width = note.width ?? minimumNoteWidth;
    const height = note.height ?? minimumNoteHeight;
    const linkedSize = width + height;
    const dx = event.clientX - noteInteraction.startX;
    const dy = event.clientY - noteInteraction.startY;
    let x = note.x;
    let y = note.y;
    let nextWidth = width;
    let nextHeight = height;

    const heightForWidth = (candidateWidth: number) =>
      Math.max(
        minimumNoteHeight,
        linkedSize - candidateWidth,
        noteInputs[note.id]
          ? measuredTextHeight(noteInputs[note.id], noteInputs[note.id].value, candidateWidth)
          : minimumNoteHeight
      );

    const widthForHeight = (candidateHeight: number, candidateY: number) => {
      const centerX = note.x + width / 2;
      const maximumWidth = Math.max(
        minimumNoteWidth,
        2 * Math.min(centerX - noteInset, chapterElement.clientWidth - noteInset - centerX)
      );
      const requiredWidth = minimumWidthForNoteText(note.id, candidateHeight, maximumWidth);
      if (requiredWidth === undefined) return undefined;
      const desiredWidth = Math.min(
        maximumWidth,
        Math.max(minimumNoteWidth, linkedSize - candidateHeight, requiredWidth)
      );
      const fitsAtWidth = (candidateWidth: number) => {
        const candidateX = centerX - candidateWidth / 2;
        return noteFits(note.id, candidateX, candidateY, candidateWidth, candidateHeight);
      };

      if (fitsAtWidth(desiredWidth)) {
        return { width: desiredWidth, x: centerX - desiredWidth / 2 };
      }
      if (!fitsAtWidth(requiredWidth)) return undefined;

      let lower = requiredWidth;
      let upper = desiredWidth;
      while (upper - lower > 1) {
        const middle = (lower + upper) / 2;
        if (fitsAtWidth(middle)) {
          lower = middle;
        } else {
          upper = middle;
        }
      }
      return { width: lower, x: centerX - lower / 2 };
    };

    if (mode === 'move') {
      const targetX = note.x + dx;
      const targetY = note.y + dy;
      x = limitAxis(note.x, targetX, (candidate) => noteFits(note.id, candidate, note.y, width, height));
      y = limitAxis(note.y, targetY, (candidate) => noteFits(note.id, x, candidate, width, height));
      x = limitAxis(note.x, targetX, (candidate) => noteFits(note.id, candidate, y, width, height));
      y = limitAxis(note.y, targetY, (candidate) => noteFits(note.id, x, candidate, width, height));
    } else if (mode === 'left') {
      const targetWidth = Math.max(minimumNoteWidth, width - dx);
      nextWidth = limitAxis(width, targetWidth, (candidate) => {
        const candidateHeight = heightForWidth(candidate);
        const candidateX = note.x + width - candidate;
        return noteFits(note.id, candidateX, note.y, candidate, candidateHeight);
      });
      x = note.x + width - nextWidth;
      nextHeight = heightForWidth(nextWidth);
    } else if (mode === 'right') {
      const targetWidth = Math.max(minimumNoteWidth, width + dx);
      nextWidth = limitAxis(width, targetWidth, (candidate) => {
        const candidateHeight = heightForWidth(candidate);
        return noteFits(note.id, note.x, note.y, candidate, candidateHeight);
      });
      nextHeight = heightForWidth(nextWidth);
    } else if (mode === 'top') {
      const targetHeight = Math.max(minimumNoteHeight, height - dy);
      nextHeight = closestValidAxis(height, targetHeight, (candidate) => {
        const candidateY = note.y + height - candidate;
        return widthForHeight(candidate, candidateY) !== undefined;
      });
      y = note.y + height - nextHeight;
      const layout = widthForHeight(nextHeight, y);
      nextWidth = layout?.width ?? width;
      x = layout?.x ?? note.x;
    } else {
      const targetHeight = Math.max(minimumNoteHeight, height + dy);
      nextHeight = closestValidAxis(
        height,
        targetHeight,
        (candidate) => widthForHeight(candidate, note.y) !== undefined
      );
      const layout = widthForHeight(nextHeight, note.y);
      nextWidth = layout?.width ?? width;
      x = layout?.x ?? note.x;
    }

    onUpdateNoteLayout(note.id, { x, y, width: nextWidth, height: nextHeight });
  }

  function notePositionFor(x: number, y: number) {
    const noteSizes = [[minimumNoteWidth, minimumNoteHeight]];
    const requested = clampNotePosition(x, y, minimumNoteWidth);
    const belowChapter = clampNotePosition(noteInset, chapterElement.scrollHeight + noteInset, minimumNoteWidth);
    const candidates = [requested];

    for (let distance = 24; distance <= 480; distance += 24) {
      for (const [horizontal, vertical] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ]) {
        candidates.push(
          clampNotePosition(requested.x + horizontal * distance, requested.y + vertical * distance, minimumNoteWidth)
        );
      }
    }

    candidates.push(belowChapter);

    for (const candidate of candidates) {
      for (const [width, height] of noteSizes) {
        const position = clampNotePosition(candidate.x, candidate.y, width);
        if (noteFits('', position.x, position.y, width, height)) {
          return { ...position, width, height };
        }
      }
    }

    return { ...belowChapter, width: minimumNoteWidth, height: minimumNoteHeight };
  }

  function isReaderTextTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      Boolean(target.closest('button, textarea, input, .highlight-mark, .chapter-note'))
    );
  }

  function updateNoteSelection(clientX: number, clientY: number) {
    if (!noteSelection) return;

    const bounds = chapterElement.getBoundingClientRect();
    const endX = clientX - bounds.left;
    const endY = clientY - bounds.top;
    noteSelection = {
      ...noteSelection,
      left: Math.min(noteSelection.startX, endX),
      top: Math.min(noteSelection.startY, endY),
      width: Math.abs(endX - noteSelection.startX),
      height: Math.abs(endY - noteSelection.startY)
    };
  }

  function startNoteSelection(event: PointerEvent) {
    if (
      document.activeElement instanceof HTMLTextAreaElement &&
      document.activeElement !== event.target
    ) {
      document.activeElement.blur();
    }

    if (
      event.button !== 0 ||
      isReaderTextTarget(event.target) ||
      pointIsOverReaderText(event.clientX, event.clientY)
    ) {
      return;
    }

    event.preventDefault();
    const bounds = chapterElement.getBoundingClientRect();
    const startX = event.clientX - bounds.left;
    const startY = event.clientY - bounds.top;
    noteSelection = { startX, startY, left: startX, top: startY, width: 0, height: 0 };
    chapterElement.setPointerCapture(event.pointerId);
  }

  function blockDoubleClickTextDrag(event: MouseEvent) {
    if (event.detail < 2 || !pointIsOverReaderText(event.clientX, event.clientY)) {
      return;
    }

    event.preventDefault();
    document.getSelection()?.removeAllRanges();
  }

  function finishNoteSelection(event: PointerEvent) {
    updateNoteSelection(event.clientX, event.clientY);
    const selection = noteSelection;
    noteSelection = undefined;

    if (!selection || selection.width < 6 || selection.height < 6) {
      return;
    }

    const chapterBounds = chapterElement.getBoundingClientRect();
    const selectedNoteIds = notes
      .filter((note) => {
        const noteBounds = noteElements[note.id]?.getBoundingClientRect();
        if (!noteBounds) return false;

        const left = noteBounds.left - chapterBounds.left;
        const top = noteBounds.top - chapterBounds.top;
        return (
          left >= selection.left &&
          top >= selection.top &&
          left + noteBounds.width <= selection.left + selection.width &&
          top + noteBounds.height <= selection.top + selection.height
        );
      })
      .map((note) => note.id);

    if (selectedNoteIds.length > 0) {
      onRemoveNotes(selectedNoteIds);
    }
  }

  function handlePointerMove(event: PointerEvent) {
    updateNoteInteraction(event);
    updateNoteSelection(event.clientX, event.clientY);
  }

  function handlePointerUp(event: PointerEvent) {
    if (noteInteraction) {
      noteInteraction = undefined;
      return;
    }
    finishNoteSelection(event);
  }

  function finishMouseInteraction() {
    pendingNoteMove = undefined;
    noteInteraction = undefined;
  }

  async function createNoteAt(event: MouseEvent) {
    const target = event.target;

    if (
      !(target instanceof Element) ||
      isReaderTextTarget(target) ||
      pointIsOverReaderText(event.clientX, event.clientY) ||
      !chapter
    ) {
      return;
    }

    const bounds = chapterElement.getBoundingClientRect();
    const position = notePositionFor(event.clientX - bounds.left, event.clientY - bounds.top);
    const note: ChapterNote = {
      id: crypto.randomUUID(),
      book: chapter.book,
      chapter: chapter.chapter,
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      text: ''
    };

    onCreateNote(note);
    await tick();
    noteInputs[note.id]?.focus();
  }

  function measuredTextWidth(textarea: HTMLTextAreaElement, text: string) {
    const measure = document.createElement('span');
    measure.style.cssText = `position: fixed; visibility: hidden; white-space: pre; font: ${getComputedStyle(textarea).font};`;
    measure.textContent = (text.split('\n').sort((a, b) => b.length - a.length)[0] || ' ');
    document.body.append(measure);
    const width = Math.ceil(measure.getBoundingClientRect().width + 4);
    measure.remove();
    return width;
  }

  function measuredTextHeight(textarea: HTMLTextAreaElement, text: string, width: number) {
    const measure = textarea.cloneNode() as HTMLTextAreaElement;
    measure.value = text;
    const computed = getComputedStyle(textarea);
    measure.style.cssText = `position: fixed; visibility: hidden; box-sizing: border-box; overflow: hidden; resize: none; width: ${width}px; height: ${minimumNoteHeight}px; padding: 0; border: 0; font: ${computed.font}; line-height: ${computed.lineHeight}; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word;`;
    document.body.append(measure);
    const height = Math.max(minimumNoteHeight, measure.scrollHeight);
    measure.remove();
    return height;
  }

  function layoutForNoteText(note: ChapterNote, textarea: HTMLTextAreaElement, text: string) {
    const maximumWidth = Math.max(minimumNoteWidth, chapterElement.clientWidth - note.x - noteInset);
    const desiredWidth = Math.min(maximumWidth, Math.max(minimumNoteWidth, measuredTextWidth(textarea, text)));

    for (let width = desiredWidth; width >= minimumNoteWidth; width -= 2) {
      const height = measuredTextHeight(textarea, text, width);
      if (noteFits(note.id, note.x, note.y, width, height)) {
        return { x: note.x, y: note.y, width, height };
      }
    }
    return undefined;
  }

  async function updateNoteText(note: ChapterNote, textarea: HTMLTextAreaElement) {
    const text = textarea.value;
    const layout = layoutForNoteText(note, textarea, text);
    if (!layout) {
      textarea.value = note.text;
      return;
    }

    onUpdateNoteLayout(note.id, layout);
    onUpdateNote(note.id, text);
    await tick();
    const updatedTextarea = noteInputs[note.id];
    if (updatedTextarea && (updatedTextarea.scrollHeight > updatedTextarea.clientHeight || updatedTextarea.scrollWidth > updatedTextarea.clientWidth)) {
      const previousLayout = layoutForNoteText(note, updatedTextarea, note.text);
      updatedTextarea.value = note.text;
      if (previousLayout) {
        onUpdateNoteLayout(note.id, previousLayout);
      }
      onUpdateNote(note.id, note.text);
    }
  }
</script>

<svelte:window
  on:mousemove={handleWindowMouseMove}
  on:mouseup={finishMouseInteraction}
/>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<article
  bind:this={chapterElement}
  class="chapter-view"
  aria-labelledby="chapter-title"
  on:dblclick={createNoteAt}
  on:mousedown|capture={blockDoubleClickTextDrag}
  on:dragstart|preventDefault
  on:pointerdown={startNoteSelection}
  on:pointermove={handlePointerMove}
  on:pointerup={handlePointerUp}
  on:pointercancel={() => { noteSelection = undefined; noteInteraction = undefined; }}
>
  {#if isLoading && !chapter}
    <p class="status">Loading chapter...</p>
  {:else if errorMessage}
    <div class="empty-state" role="alert">
      <p class="eyebrow">Database unavailable</p>
      <h1 id="chapter-title">Reader unavailable</h1>
      <p>{errorMessage}</p>
    </div>
  {:else if chapter}
    <header class="chapter-header">
      <div>
        <p class="eyebrow">{chapter.volume}</p>
        <h1 id="chapter-title">{chapter.reference}</h1>
        <p class="chapter-meta">
          <span>{chapter.book}</span>
          <span>Chapter {chapter.chapter}</span>
          <span>{totalVerses} verses</span>
        </p>
      </div>
    </header>

    <div class="verses" aria-label={`${chapter.reference} verses`}>
      {#each chapter.verses as verse}
        {@const verseKey = `${chapter.book}:${chapter.chapter}:${verse.number}`}
        <div class="verse-row">
          <p>
            <span class="verse-number">{verse.number}</span>
            <span class="verse-text" data-verse-key={verseKey}>
              {#each verseSegments(verse) as segment}
                {#if segment.savedWord}
                  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                  <mark
                    class="highlight-mark"
                    class:highlight-mark-active={activeHighlightId === highlightId(segment.savedWord)}
                    title="Double-click to remove highlight"
                    data-highlight-key={highlightKey(segment.savedWord)}
                    data-highlight-id={highlightId(segment.savedWord)}
                    on:pointerup|stopPropagation
                    on:mouseup|stopPropagation
                    on:touchend|stopPropagation
                    on:dblclick|preventDefault|stopPropagation={() => onRemoveHighlight(segment.savedWord!)}
                  >
                    {segment.text}
                  </mark>
                {:else}
                  {segment.text}
                {/if}
              {/each}
            </span>
          </p>
        </div>
      {/each}
    </div>

    <footer class="chapter-footer">
      <nav class="chapter-nav" aria-label="Chapter navigation">
        <button
          type="button"
          aria-label="Previous chapter"
          disabled={chapter.previous_chapter === null || isLoading}
          on:click={onPreviousChapter}
        >
          <span aria-hidden="true">&larr;</span>
        </button>
        <button
          type="button"
          aria-label="Next chapter"
          disabled={chapter.next_chapter === null || isLoading}
          on:click={onNextChapter}
        >
          <span aria-hidden="true">&rarr;</span>
        </button>
      </nav>
    </footer>

    {#each notes as note (note.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={noteElements[note.id]}
        class="chapter-note"
        style={`left: ${note.x}px; top: ${note.y}px; width: ${note.width ?? minimumNoteWidth}px; height: ${note.height ?? minimumNoteHeight}px;`}
        on:mousedown={(event) => startNoteMouseMove(event, note)}
      >
        <button class="note-handle note-handle-left" type="button" aria-label="Resize note from left" on:pointerdown={(event) => startNoteInteraction(event, note, 'left')}></button>
        <button class="note-handle note-handle-right" type="button" aria-label="Resize note from right" on:pointerdown={(event) => startNoteInteraction(event, note, 'right')}></button>
        <button class="note-handle note-handle-top" type="button" aria-label="Resize note from top" on:pointerdown={(event) => startNoteInteraction(event, note, 'top')}></button>
        <button class="note-handle note-handle-bottom" type="button" aria-label="Resize note from bottom" on:pointerdown={(event) => startNoteInteraction(event, note, 'bottom')}></button>
        <textarea
          bind:this={noteInputs[note.id]}
          aria-label="Chapter note"
          value={note.text}
          on:wheel|preventDefault
          on:input={(event) => updateNoteText(note, event.currentTarget as HTMLTextAreaElement)}
          on:blur={(event) =>
            !(event.currentTarget as HTMLTextAreaElement).value.trim() && onRemoveNotes([note.id])}
        ></textarea>
      </div>
    {/each}

    {#if noteSelection}
      <div
        class="note-selection-box"
        aria-hidden="true"
        style={`left: ${noteSelection.left}px; top: ${noteSelection.top}px; width: ${noteSelection.width}px; height: ${noteSelection.height}px;`}
      ></div>
    {/if}
  {/if}
</article>

<style>
  .chapter-view {
    grid-column: auto;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    overflow: visible;
    position: relative;
    min-height: calc(100vh - clamp(2rem, 8vw, 5rem));
    padding: clamp(1.4rem, 4vw, 3.5rem);
    border: 1px solid var(--panel-border-color);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 252, 251, 0.94));
    box-shadow: 0 24px 70px rgba(31, 46, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  :global(.reader-shell-highlights-open) .chapter-view {
    padding: clamp(1.25rem, 3vw, 2.75rem);
  }

  .chapter-header {
    max-width: 760px;
    margin: 0 auto clamp(2rem, 5vw, 3.25rem);
    padding-bottom: 1.2rem;
    border-bottom: 1px solid var(--panel-border-color);
  }

  .chapter-header h1 {
    margin: 0 0 0.65rem;
    color: var(--panel-text-color);
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(2.4rem, 7vw, 4.75rem);
    font-weight: 700;
    line-height: 0.98;
  }

  .eyebrow {
    margin: 0 0 0.55rem;
    color: var(--accent-color);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1,
  p {
    margin-top: 0;
  }

  .chapter-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.6rem;
    align-items: center;
    margin: 0;
  }

  .chapter-meta span {
    color: var(--panel-muted-color);
    font-size: 0.94rem;
    line-height: 1.35;
  }

  .chapter-meta span:not(:last-child)::after {
    content: "/";
    margin-left: 0.6rem;
    color: rgba(102, 117, 111, 0.58);
  }

  .chapter-header p:last-child,
  .empty-state p:last-child {
    margin-bottom: 0;
    color: var(--panel-muted-color);
    line-height: 1.65;
  }

  .empty-state {
    display: grid;
    gap: 0.7rem;
    padding: 1.3rem 0;
  }

  .verses {
    display: grid;
    gap: 0.9rem;
    max-width: 760px;
    min-width: 0;
    margin: 0 auto;
    font-family: Georgia, "Times New Roman", serif;
  }

  .verse-row {
    min-width: 0;
    padding: 0.25rem 0 0.25rem 0.75rem;
    border-left: 3px solid transparent;
  }

  .verse-row p {
    margin: 0;
    color: var(--panel-text-color);
    font-size: clamp(1.08rem, 2vw, 1.2rem);
    line-height: 1.86;
    overflow-wrap: anywhere;
  }

  .highlight-mark {
    appearance: none;
    border: 0;
    border-radius: 4px;
    display: inline;
    padding: 0;
    color: inherit;
    background: rgba(227, 178, 75, 0.34);
    box-decoration-break: clone;
    font: inherit;
    line-height: inherit;
    text-align: left;
    -webkit-box-decoration-break: clone;
  }

  .highlight-mark-active {
    background: rgba(227, 178, 75, 0.58);
  }

  .verse-number {
    display: inline-block;
    min-width: 1.7rem;
    margin-right: 0.38rem;
    color: var(--panel-muted-color);
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 0.72em;
    font-weight: 800;
    line-height: 1;
    transform: translateY(-0.08em);
  }

  .verse-text {
    display: inline;
  }

  .empty-state,
  .status {
    max-width: 620px;
  }

  .status {
    margin-bottom: 0;
    color: var(--panel-muted-color);
    line-height: 1.65;
  }

  .empty-state {
    display: grid;
    gap: 0.7rem;
    padding: 1.3rem 0;
  }

  .chapter-footer {
    max-width: 760px;
    margin: clamp(2.25rem, 5vw, 3.5rem) auto 0;
    padding-top: 1.15rem;
    border-top: 1px solid var(--panel-border-color);
  }

  .chapter-note {
    position: absolute;
    z-index: 2;
    outline: 1px solid transparent;
    outline-offset: 0;
  }

  .chapter-note:focus-within {
    outline-color: var(--accent-color);
    box-shadow: 0 0 0 1px rgba(47, 118, 109, 0.18);
  }

  .note-handle {
    position: absolute;
    z-index: 1;
    display: none;
    border: 0;
    padding: 0;
    background: transparent;
  }

  .chapter-note:focus-within .note-handle {
    display: block;
  }

  .note-handle-left,
  .note-handle-right { top: 0; width: 4px; height: 100%; }
  .note-handle-left { left: -5px; cursor: ew-resize; }
  .note-handle-right { right: -5px; cursor: ew-resize; }
  .note-handle-top,
  .note-handle-bottom { left: 0; width: 100%; height: 4px; }
  .note-handle-top { top: -5px; cursor: ns-resize; }
  .note-handle-bottom { bottom: -5px; cursor: ns-resize; }

  .chapter-note textarea {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    resize: none;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    padding: 0;
    color: var(--panel-text-color);
    background: transparent;
    caret-color: #0b5e55;
    cursor: text;
    box-shadow: none;
    font: inherit;
    font-style: italic;
    line-height: 1.45;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .chapter-note textarea:focus {
    outline: none;
  }

  .note-selection-box {
    position: absolute;
    z-index: 3;
    border: 1px dashed var(--accent-color);
    background: rgba(47, 118, 109, 0.06);
    pointer-events: none;
  }

  .chapter-nav {
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  .chapter-nav button {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    width: 2.85rem;
    height: 2.85rem;
    border: 1px solid var(--control-border-color);
    border-radius: 8px;
    color: var(--panel-text-color);
    background: var(--control-surface);
    font: inherit;
    font-size: 1.25rem;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      background 150ms ease,
      transform 150ms ease;
  }

  .chapter-nav button:focus-visible {
    outline: 3px solid var(--accent-color-muted);
    outline-offset: 2px;
  }

  .chapter-nav button:not(:disabled):hover {
    border-color: var(--accent-color);
    background: var(--accent-color-muted);
    transform: translateY(-1px);
  }

  .chapter-nav button:disabled {
    cursor: default;
    opacity: 0.35;
  }

  .chapter-nav span {
    font-size: 1.2rem;
    line-height: 0;
  }

  @media (max-width: 900px) {
    .chapter-view {
      min-height: 100vh;
      border-width: 0;
      border-radius: 0;
      box-shadow: none;
    }
  }

  @media (max-width: 500px) {
    .chapter-nav {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .chapter-nav button {
      width: 100%;
    }
  }
</style>
