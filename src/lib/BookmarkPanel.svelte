<script lang="ts">
  import type { ChapterBookmark } from '$lib/study';

  export let bookmarks: ChapterBookmark[] = [];
  export let bookmarkTitle = '';
  export let bookmarkError = '';
  export let isLoadingBookmarks = false;
  export let isSavingBookmark = false;
  export let onSaveBookmark = async () => {};
  export let onOpenBookmark = async (_bookmark: ChapterBookmark) => {};
  export let onRemoveBookmark = async (_bookmark: ChapterBookmark) => {};
</script>

<section class="bookmark-panel" aria-label="Chapter bookmarks">
  <div class="panel-heading">
    <h2>Bookmarks</h2>
    <span>{bookmarks.length}</span>
  </div>

  <form class="bookmark-form" on:submit|preventDefault={onSaveBookmark}>
    <label>
      <span>Title</span>
      <input
        type="text"
        bind:value={bookmarkTitle}
        placeholder="Name this chapter"
        disabled={isSavingBookmark}
      />
    </label>

    <button type="submit" disabled={isSavingBookmark || bookmarkTitle.trim().length === 0}>
      {isSavingBookmark ? 'Saving' : 'Save chapter'}
    </button>
  </form>

  {#if bookmarkError}
    <p class="panel-status" role="alert">{bookmarkError}</p>
  {:else if isLoadingBookmarks}
    <p class="panel-status">Loading bookmarks...</p>
  {:else if bookmarks.length === 0}
    <p class="panel-status">No chapter bookmarks yet.</p>
  {:else}
    <ol class="bookmark-list" aria-label="Chapter bookmarks">
      {#each bookmarks as bookmark}
        <li>
          <button type="button" class="bookmark-link" on:click={() => onOpenBookmark(bookmark)}>
            <span>{bookmark.title}</span>
            <small>{bookmark.reference}</small>
          </button>
          <button
            type="button"
            class="remove-bookmark-button"
            aria-label="Remove bookmark"
            on:click|stopPropagation={() => onRemoveBookmark(bookmark)}
          >
            Remove
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .bookmark-panel {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    width: 100%;
    padding: 0.95rem;
    border: 1px solid var(--panel-border-color);
    border-radius: 8px;
    background: var(--panel-surface);
    box-shadow: var(--panel-shadow);
  }

  .panel-heading {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    justify-content: space-between;
  }

  .panel-heading h2 {
    margin: 0;
    color: var(--panel-title-color);
    font-size: var(--panel-title-size);
    font-weight: var(--panel-title-weight);
    line-height: var(--panel-title-line-height);
    letter-spacing: var(--panel-title-letter-spacing);
    text-transform: var(--panel-title-transform);
  }

  .panel-heading span {
    display: inline-grid;
    min-width: 1.65rem;
    min-height: 1.65rem;
    place-items: center;
    border-radius: 999px;
    color: #ffffff;
    background: var(--accent-color);
    font-size: 0.72rem;
    font-weight: 850;
    line-height: 1;
  }

  .bookmark-form {
    display: grid;
    gap: 0.55rem;
  }

  .bookmark-form label {
    display: grid;
    gap: 0.4rem;
    color: var(--panel-title-color);
    font-size: var(--panel-title-size);
    font-weight: var(--panel-title-weight);
    line-height: var(--panel-title-line-height);
    letter-spacing: var(--panel-title-letter-spacing);
    text-transform: var(--panel-title-transform);
  }

  .bookmark-form input {
    min-width: 0;
    min-height: 2.55rem;
    width: 100%;
    border: 1px solid var(--control-border-color);
    border-radius: 6px;
    padding: 0 0.75rem;
    color: var(--panel-text-color);
    background: var(--control-surface);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 750;
  }

  .bookmark-form button,
  .bookmark-link,
  .remove-bookmark-button {
    font: inherit;
  }

  .bookmark-form input:focus-visible,
  .bookmark-form button:focus-visible,
  .bookmark-link:focus-visible,
  .remove-bookmark-button:focus-visible {
    outline: 3px solid var(--accent-color-muted);
    outline-offset: 2px;
  }

  .bookmark-form button {
    min-width: 0;
    min-height: 2.35rem;
    padding: 0 0.7rem;
    border: 1px solid var(--accent-color);
    border-radius: 6px;
    color: #ffffff;
    background: linear-gradient(180deg, var(--accent-color), #276a62);
    font-size: 0.82rem;
    font-weight: 800;
    cursor: pointer;
  }

  .bookmark-form button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .panel-status {
    margin: 0;
    color: var(--panel-muted-color);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .bookmark-list {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bookmark-list li {
    display: grid;
    gap: 0.35rem;
    padding: 0.65rem 0;
    border-top: 1px solid var(--panel-border-color);
  }

  .bookmark-link {
    display: grid;
    gap: 0.18rem;
    width: 100%;
    min-width: 0;
    border: 0;
    border-radius: 6px;
    padding: 0.2rem 0.3rem;
    color: var(--panel-text-color);
    background: transparent;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .bookmark-link:hover {
    background: var(--accent-color-muted);
  }

  .bookmark-link span {
    color: var(--panel-text-color);
    font-size: 0.88rem;
    font-weight: 800;
    line-height: 1.25;
  }

  .bookmark-link {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1rem;
    line-height: 1.45;
  }

  .bookmark-link small {
    color: var(--panel-muted-color);
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 0.72rem;
    font-weight: 850;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .remove-bookmark-button {
    justify-self: start;
    border: 0;
    border-radius: 6px;
    padding: 0.3rem 0.45rem;
    color: var(--panel-title-color);
    background: transparent;
    font-size: 0.74rem;
    font-weight: 850;
    line-height: 1;
    cursor: pointer;
  }

  .remove-bookmark-button:hover {
    background: var(--accent-color-muted);
  }
</style>
