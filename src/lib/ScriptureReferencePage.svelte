<script lang="ts">
  import type { ScriptureChapter } from '$lib/study';

  export let title = '';
  export let chapter: ScriptureChapter | null = null;
  export let verse = 1;
  export let isLoading = false;
  export let errorMessage = '';
  export let compact = false;
  export let threeColumn = false;
  export let hidden = false;
  export let panelIndex = 0;

  function revealVerse(node: HTMLElement, isReferenced: boolean) {
    if (isReferenced) {
      requestAnimationFrame(() =>
        node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      );
    }
  }
</script>

<aside
  class="scripture-reference-page reader-side-page"
  class:compact
  class:three-column={threeColumn}
  class:panel-hidden={hidden}
  data-panel-index={panelIndex}
  aria-label={`Scripture reference: ${title}`}
  aria-hidden={hidden}
  aria-live="polite"
  inert={hidden}
>
  <article class="chapter-view">
    <header class="chapter-header">
      <div>
        <p class="eyebrow">{chapter?.volume ?? 'Scripture Reference'}</p>
        <h2>{chapter?.reference ?? title}</h2>
        {#if chapter}
          <p class="chapter-meta">
            <span>{chapter.book}</span>
            <span>Chapter {chapter.chapter}</span>
            <span>{chapter.verses.length} verses</span>
          </p>
        {/if}
      </div>
    </header>

    {#if isLoading}
      <p class="status">Loading scripture…</p>
    {:else if errorMessage}
      <p class="status error" role="alert">{errorMessage}</p>
    {:else if chapter}
      <div class="verses" aria-label={`${chapter.reference} verses`}>
        {#each chapter.verses as chapterVerse}
          <div
            class="verse-row"
            class:referenced-verse={chapterVerse.number === verse}
            use:revealVerse={chapterVerse.number === verse}
          >
            <p>
              <span class="verse-number">{chapterVerse.number}</span>
              <span class="verse-text">{chapterVerse.text}</span>
            </p>
          </div>
        {/each}
      </div>
    {/if}
  </article>
</aside>

<style>
  .scripture-reference-page {
    position: sticky;
    z-index: 30;
    top: 0;
    flex: 0 0 min(31rem, 42vw);
    width: min(31rem, 42vw);
    height: 100dvh;
    container-type: inline-size;
    overflow-y: auto;
    border-left: 1px solid rgba(52, 79, 72, 0.2);
    padding: clamp(1.25rem, 3vw, 2rem);
    color: #1c2a2e;
    background: transparent;
    animation: scripture-reference-enter 260ms ease backwards;
    opacity: 1;
    transform: translateX(0);
    transition:
      flex-basis 260ms ease,
      width 260ms ease,
      padding 260ms ease,
      opacity 180ms ease,
      transform 260ms ease;
  }

  .scripture-reference-page.compact {
    flex-basis: min(26rem, 32vw);
    width: min(26rem, 32vw);
  }

  .scripture-reference-page.three-column {
    flex-basis: 33.333333vw;
    width: 33.333333vw;
  }

  .scripture-reference-page.panel-hidden {
    flex-basis: 0;
    width: 0;
    overflow: hidden;
    border-left-width: 0;
    padding-right: 0;
    padding-left: 0;
    opacity: 0;
    pointer-events: none;
    transform: translateX(-1.25rem);
  }

  @keyframes scripture-reference-enter {
    from {
      opacity: 0;
      transform: translateX(1.25rem);
    }
  }

  .chapter-view {
    position: relative;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow: visible;
    border: 0;
    border-radius: 0;
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  .chapter-header {
    max-width: none;
    margin: 0 0 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(52, 79, 72, 0.16);
  }

  .eyebrow {
    margin: 0 0 0.55rem;
    color: #2f766d;
    font: 800 0.78rem/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h2 {
    margin: 0 0 0.65rem;
    color: #1c2a2e;
    font: 700 clamp(1.75rem, 10cqw, 3rem)/1 Georgia, "Times New Roman", serif;
    overflow-wrap: anywhere;
  }

  .chapter-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.6rem;
    align-items: center;
    margin: 0;
  }

  .chapter-meta span {
    color: #66756f;
    font: 400 0.86rem/1.35 Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .chapter-meta span:not(:last-child)::after {
    content: "/";
    margin-left: 0.6rem;
    color: rgba(102, 117, 111, 0.58);
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
    position: relative;
    min-width: 0;
    padding: 0.25rem 0 0.25rem 0.75rem;
    border-left: 3px solid transparent;
  }

  .verse-row p {
    margin: 0;
    color: #1c2a2e;
    font-size: clamp(0.96rem, 4cqw, 1.08rem);
    line-height: 1.78;
    overflow-wrap: anywhere;
  }

  .verse-row.referenced-verse {
    border-left-color: #2f766d;
    border-radius: 0 0.35rem 0.35rem 0;
    background: rgba(47, 118, 109, 0.1);
  }

  .verse-number {
    display: inline-block;
    min-width: 1.7rem;
    margin-right: 0.38rem;
    color: #66756f;
    font: 800 0.72em/1 Inter, ui-sans-serif, system-ui, sans-serif;
    transform: translateY(-0.08em);
  }

  .verse-text {
    display: inline;
    min-width: 0.5ch;
    border-radius: 3px;
  }

  .status {
    color: #66756f;
    font: 600 0.95rem/1.5 Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .status.error {
    color: #8a3d38;
  }

  @media (prefers-reduced-motion: reduce) {
    .scripture-reference-page {
      animation: none;
      transition: none;
    }
  }
</style>
