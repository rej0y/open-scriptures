<script lang="ts">
  import type { TopicalGuideTopic } from '$lib/study';

  export let title = '';
  export let topic: TopicalGuideTopic | null = null;
  export let isLoading = false;
  export let errorMessage = '';
</script>

<aside class="topical-guide-page" aria-label="Topical Guide" aria-live="polite">
  <header>
    <p class="eyebrow">Topical Guide</p>
    <h2>{topic?.title ?? title}</h2>
  </header>

  {#if isLoading}
    <p class="status">Loading topic…</p>
  {:else if errorMessage}
    <p class="status error" role="alert">{errorMessage}</p>
  {:else if topic}
    {#if topic.related_topics}
      <p class="related-topics">{topic.related_topics}</p>
    {/if}
    {#if topic.content}
      <p class="topic-content">{topic.content}</p>
    {:else}
      <p class="status">This entry points to the related study resources above.</p>
    {/if}
    <p class="source">Source: Topical Guide, page {topic.source_page}</p>
  {/if}
</aside>

<style>
  .topical-guide-page {
    position: sticky;
    z-index: 30;
    top: 0;
    flex: 0 0 min(31rem, 42vw);
    width: min(31rem, 42vw);
    height: 100dvh;
    overflow-y: auto;
    border-left: 1px solid rgba(52, 79, 72, 0.2);
    padding: clamp(1.25rem, 3vw, 2rem);
    color: #1c2a2e;
    background: #fbfdfc;
  }

  header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(52, 79, 72, 0.16);
  }

  .eyebrow {
    margin: 0 0 0.35rem;
    color: #2f766d;
    font: 800 0.76rem/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font: 700 clamp(1.8rem, 5vw, 2.7rem)/1.05 Georgia, "Times New Roman", serif;
  }

  .related-topics {
    margin: 0 0 1.25rem;
    border-radius: 6px;
    padding: 0.8rem 0.9rem;
    color: #425b55;
    background: rgba(47, 118, 109, 0.08);
    font: 600 0.94rem/1.55 Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .topic-content {
    margin: 0;
    color: #24332f;
    font: 400 1rem/1.68 Georgia, "Times New Roman", serif;
    white-space: pre-line;
  }

  .status {
    margin: 0;
    color: #66756f;
    line-height: 1.6;
  }

  .error {
    color: #8d3e3e;
  }

  .source {
    margin: 1.75rem 0 0;
    padding-top: 1rem;
    border-top: 1px solid rgba(52, 79, 72, 0.14);
    color: #74817c;
    font: 500 0.78rem/1.4 Inter, ui-sans-serif, system-ui, sans-serif;
  }

  @media (max-width: 600px) {
    .topical-guide-page {
      flex-basis: 50vw;
      width: 50vw;
      padding: 0.85rem;
    }

    h2 {
      font-size: 1.45rem;
    }
  }
</style>
