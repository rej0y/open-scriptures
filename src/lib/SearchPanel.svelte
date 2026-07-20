<script lang="ts">
  import type { ScriptureSearchResult } from '$lib/study';

  export let isSearching = false;
  export let searchQuery = '';
  export let searchError = '';
  export let searchResults: ScriptureSearchResult[] = [];
  export let hasSearched = false;
  export let onSearch = async () => {};
  export let onClearSearch = () => {};
  export let openSearchResult = async (_result: ScriptureSearchResult) => {};
</script>

<section class="search-panel" aria-label="Search scriptures">
  <form class="search-form" on:submit|preventDefault={onSearch}>
    <label>
      <span>Search</span>
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Find words or phrases"
        disabled={isSearching}
      />
    </label>

    <div class="search-actions">
      <button type="submit" disabled={isSearching}>
        {isSearching ? 'Searching' : 'Search'}
      </button>
      <button type="button" class="secondary-button" disabled={isSearching} on:click={onClearSearch}>
        Clear
      </button>
    </div>
  </form>

  {#if searchError}
    <p class="search-status" role="alert">{searchError}</p>
  {:else if isSearching}
    <p class="search-status">Searching...</p>
  {:else if hasSearched && searchResults.length === 0}
    <p class="search-status">No results found.</p>
  {:else if searchResults.length > 0}
    <ol class="search-results" aria-label="Search results">
      {#each searchResults as result}
        <li>
          <button type="button" on:click={() => openSearchResult(result)}>
            <span>{result.reference}</span>
            <small>{result.volume}</small>
            <p>{result.text}</p>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .search-panel {
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

  .search-form {
    display: grid;
    min-width: 0;
    gap: 0.75rem;
  }

  .search-form label {
    display: grid;
    min-width: 0;
    gap: 0.4rem;
    color: var(--panel-title-color);
    font-size: var(--panel-title-size);
    font-weight: var(--panel-title-weight);
    line-height: var(--panel-title-line-height);
    letter-spacing: var(--panel-title-letter-spacing);
    text-transform: var(--panel-title-transform);
  }

  .search-form input {
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
    text-transform: none;
  }

  .search-form input:focus-visible,
  .search-actions button:focus-visible,
  .search-results button:focus-visible {
    outline: 3px solid var(--accent-color-muted);
    outline-offset: 2px;
  }

  .search-actions {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto);
    gap: 0.45rem;
  }

  .search-actions button,
  .search-results button {
    border: 1px solid var(--control-border-color);
    border-radius: 6px;
    color: var(--panel-text-color);
    background: var(--control-surface);
    font: inherit;
    cursor: pointer;
  }

  .search-actions button {
    min-width: 0;
    min-height: 2.35rem;
    padding: 0 0.7rem;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .search-actions button[type='submit'] {
    color: #ffffff;
    border-color: var(--accent-color);
    background: linear-gradient(180deg, var(--accent-color), #276a62);
  }

  .search-actions button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  .secondary-button {
    color: var(--panel-text-color);
  }

  .search-status {
    margin: 0;
    color: var(--panel-muted-color);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .search-results {
    display: grid;
    gap: 0.55rem;
    max-height: min(42vh, 28rem);
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  }

  .search-results li {
    min-width: 0;
  }

  .search-results button {
    display: grid;
    gap: 0.18rem;
    width: 100%;
    padding: 0.65rem;
    text-align: left;
    transition:
      border-color 150ms ease,
      background 150ms ease;
  }

  .search-results button span {
    color: var(--panel-text-color);
    font-size: 0.88rem;
    font-weight: 800;
    line-height: 1.25;
  }

  .search-results button small {
    color: var(--panel-muted-color);
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1.25;
    text-transform: uppercase;
  }

  .search-results button p {
    margin: 0;
    color: var(--panel-muted-color);
    font-size: 0.82rem;
    line-height: 1.42;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    margin-top: 0.15rem;
  }

  .search-results button:hover {
    background: var(--accent-color-muted);
  }

  @media (max-width: 900px) {
    .search-panel {
      gap: 0.75rem;
      align-items: end;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: transparent;
    }

    .search-results {
      max-height: min(28vh, 14rem);
      margin-top: 0.75rem;
    }
  }

  @media (max-width: 500px) {
    .search-panel,
    .search-results {
      grid-template-columns: 1fr;
    }
  }
</style>
