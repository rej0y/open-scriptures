<script lang="ts">
  import type { TopicalGuideTopic } from '$lib/study';

  export let title = '';
  export let topic: TopicalGuideTopic | null = null;
  export let isLoading = false;
  export let errorMessage = '';

  function splitTopLevelEntries(value: string) {
    const entries: string[] = [];
    let entry = '';
    let parenthesisDepth = 0;

    function appendEntry() {
      const normalizedEntry = entry.replace(/\s+/g, ' ').trim();
      if (normalizedEntry) entries.push(normalizedEntry);
      entry = '';
    }

    for (const character of value) {
      if (character === '(') parenthesisDepth += 1;
      if (character === ')') parenthesisDepth = Math.max(0, parenthesisDepth - 1);

      if (character === ';' && parenthesisDepth === 0) {
        appendEntry();
      } else {
        entry += character;
      }
    }

    appendEntry();
    return entries;
  }

  $: relatedTopics = topic?.related_topics
    ? splitTopLevelEntries(topic.related_topics.replace(/^See also\s*/i, ''))
    : [];
  $: referenceEntries = topic?.content ? splitTopLevelEntries(topic.content) : [];
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
    {#if relatedTopics.length > 0}
      <section class="related-topics" aria-labelledby="related-topics-title">
        <h3 id="related-topics-title">See also</h3>
        <ul>
          {#each relatedTopics as relatedTopic}
            <li>{relatedTopic}</li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if referenceEntries.length > 0}
      <section class="topic-content" aria-labelledby="references-title">
        <h3 id="references-title">Scripture references</h3>
        <div class="reference-list">
          {#each referenceEntries as referenceEntry}
            <p>{referenceEntry}</p>
          {/each}
        </div>
      </section>
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
    background: transparent;
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
    margin: 0 0 1.75rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid rgba(52, 79, 72, 0.14);
  }

  h3 {
    margin: 0 0 0.75rem;
    color: #2f766d;
    font: 800 0.72rem/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .related-topics ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .related-topics li {
    color: #24332f;
    font: 400 0.98rem/1.45 Georgia, "Times New Roman", serif;
  }

  .topic-content {
    margin: 0;
  }

  .reference-list {
    color: #24332f;
    font: 400 1rem/1.62 Georgia, "Times New Roman", serif;
  }

  .reference-list p {
    margin: 0;
    padding: 0.72rem 0;
    border-bottom: 1px solid rgba(52, 79, 72, 0.1);
  }

  .reference-list p:first-child {
    padding-top: 0;
  }

  .reference-list p:last-child {
    padding-bottom: 0;
    border-bottom: 0;
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

    .related-topics ul {
      grid-template-columns: 1fr;
    }
  }
</style>
