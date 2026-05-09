<script lang="ts">
  import type { SavedHighlight } from '$lib/study';

  export let isOpen = false;
  export let savedHighlights: SavedHighlight[] = [];
  export let onClose = () => {};
  export let onOpenHighlight = async (_savedHighlight: SavedHighlight) => {};
  export let onRemoveHighlight = async (_savedHighlight: SavedHighlight) => {};
</script>

{#if isOpen}
  <aside class="highlights-drawer" aria-label="Saved highlights">
    <div class="drawer-heading">
      <div>
        <p class="eyebrow">Saved</p>
        <h2>Highlights</h2>
      </div>
      <button type="button" class="close-drawer-button" aria-label="Close highlights" on:click={onClose}>
        &times;
      </button>
    </div>

    {#if savedHighlights.length === 0}
      <p class="panel-status">No saved words yet.</p>
    {:else}
      <ol class="highlight-list" aria-label="Saved highlights">
        {#each savedHighlights as savedHighlight}
          <li>
            <button
              type="button"
              class="highlight-link"
              on:click={() => onOpenHighlight(savedHighlight)}
            >
              <span>{savedHighlight.reference}</span>
              {savedHighlight.text}
            </button>
            <button
              type="button"
              class="remove-highlight-button"
              aria-label="Remove highlight"
              on:click|stopPropagation={() => onRemoveHighlight(savedHighlight)}
            >
              Remove
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </aside>
{/if}

<style>
  .highlights-drawer {
    position: sticky;
    top: var(--sticky-inset);
    grid-column: 3;
    z-index: 30;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
    width: 100%;
    max-height: var(--sticky-panel-max-height);
    overflow: hidden;
    overscroll-behavior: contain;
    padding: 1rem;
    border: 1px solid rgba(29, 37, 45, 0.1);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 24px 80px rgba(29, 37, 45, 0.18);
  }

  .drawer-heading {
    display: flex;
    min-width: 0;
    gap: 0.85rem;
    align-items: start;
    justify-content: space-between;
    padding-bottom: 0.8rem;
    border-bottom: 1px solid rgba(29, 37, 45, 0.09);
  }

  .drawer-heading h2 {
    margin: 0;
    color: #111820;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.65rem;
    line-height: 1.05;
  }

  .eyebrow {
    margin: 0;
    color: #56615c;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .drawer-heading > div {
    min-width: 0;
  }

  .close-drawer-button {
    display: inline-grid;
    flex: 0 0 auto;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border: 1px solid rgba(29, 37, 45, 0.12);
    border-radius: 6px;
    color: #52605b;
    background: #ffffff;
    font: inherit;
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }

  .close-drawer-button:hover {
    border-color: rgba(47, 111, 104, 0.28);
    background: rgba(47, 111, 104, 0.08);
  }

  .close-drawer-button:focus-visible,
  .remove-highlight-button:focus-visible,
  .highlight-link:focus-visible {
    outline: 3px solid rgba(47, 111, 104, 0.2);
    outline-offset: 2px;
  }

  .remove-highlight-button {
    justify-self: start;
    border: 0;
    border-radius: 6px;
    padding: 0.3rem 0.45rem;
    color: #52605b;
    background: transparent;
    font: inherit;
    font-size: 0.74rem;
    font-weight: 850;
    line-height: 1;
    cursor: pointer;
  }

  .remove-highlight-button:hover {
    background: rgba(47, 111, 104, 0.08);
  }

  .panel-status {
    margin: 0;
    color: #56615c;
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .highlight-list {
    display: grid;
    align-content: start;
    gap: 0;
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    list-style: none;
  }

  .highlight-list li {
    display: grid;
    gap: 0.35rem;
    align-items: start;
    padding: 0.85rem 0;
    border-bottom: 1px solid rgba(29, 37, 45, 0.08);
  }

  .highlight-link {
    display: grid;
    gap: 0.35rem;
    width: 100%;
    min-width: 0;
    border: 0;
    border-radius: 6px;
    padding: 0.2rem 0.3rem;
    color: #252b31;
    background: transparent;
    font: inherit;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1rem;
    line-height: 1.55;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .highlight-link:hover {
    background: rgba(47, 111, 104, 0.07);
  }

  .highlight-link span {
    color: #6b756f;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 0.72rem;
    font-weight: 850;
    line-height: 1.2;
    text-transform: uppercase;
  }

  @media (max-width: 980px) {
    .highlights-drawer {
      position: fixed;
      top: var(--sticky-inset);
      right: var(--sticky-inset);
      bottom: var(--sticky-inset);
      width: min(24rem, calc(100vw - (var(--sticky-inset) * 2)));
      max-height: none;
    }
  }

  @media (max-width: 900px) {
    .highlights-drawer {
      inset: 0;
      z-index: 20;
      grid-template-rows: auto minmax(0, 1fr);
      width: 100%;
      max-width: none;
      max-height: none;
      margin: 0;
      border-width: 1px 0 0;
      border-radius: 0;
      box-shadow: none;
    }
  }
</style>
