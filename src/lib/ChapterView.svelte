<script lang="ts">
  import type {
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
  export let verseSegments = (_verse: ChapterVerse) => [] as VerseSegment[];
  export let highlightId = (_word: SavedWord) => '';
  export let highlightKey = (_word: SavedWord) => '';
  export let onPreviousChapter = () => {};
  export let onNextChapter = () => {};
</script>

<article class="chapter-view" aria-labelledby="chapter-title">
  {#if isLoading}
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
                  <mark
                    class="highlight-mark"
                    class:highlight-mark-active={activeHighlightId === highlightId(segment.savedWord)}
                    title="Saved highlight"
                    role="mark"
                    data-highlight-key={highlightKey(segment.savedWord)}
                    data-highlight-id={highlightId(segment.savedWord)}
                    on:mouseenter={() => (activeHighlightId = highlightId(segment.savedWord!))}
                    on:mouseleave={() => (activeHighlightId = '')}
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
  {/if}
</article>

<style>
  .chapter-view {
    grid-column: 2;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
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
    margin-bottom: clamp(2rem, 5vw, 3.25rem);
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
    padding: 0.04em 0.12em;
    color: inherit;
    background: rgba(227, 178, 75, 0.34);
    box-decoration-break: clone;
    font: inherit;
    line-height: inherit;
    text-align: left;
    -webkit-box-decoration-break: clone;
  }

  .highlight-mark:hover,
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
    margin-top: clamp(2.25rem, 5vw, 3.5rem);
    padding-top: 1.15rem;
    border-top: 1px solid var(--panel-border-color);
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
