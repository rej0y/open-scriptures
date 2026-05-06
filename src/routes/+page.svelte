<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  let name = 'reader';
  let greeting = 'Run the Tauri app to call the Rust command layer.';
  let isCalling = false;

  async function greet() {
    isCalling = true;

    try {
      greeting = await invoke<string>('greet', { name });
    } catch (error) {
      greeting =
        error instanceof Error
          ? error.message
          : 'Tauri command unavailable. Start the desktop shell with npm run tauri dev.';
    } finally {
      isCalling = false;
    }
  }
</script>

<svelte:head>
  <title>Open Scriptures</title>
  <meta
    name="description"
    content="A Tauri, SvelteKit, and TypeScript desktop workspace for Open Scriptures."
  />
</svelte:head>

<main class="workspace">
  <section class="intro">
    <p class="eyebrow">Desktop study workspace</p>
    <h1>Open Scriptures</h1>
    <p class="lede">
      A local-first app shell prepared with Tauri, SvelteKit, and TypeScript.
    </p>
  </section>

  <section class="panel" aria-labelledby="bridge-title">
    <div>
      <p class="eyebrow">Rust bridge</p>
      <h2 id="bridge-title">Command check</h2>
      <p>{greeting}</p>
    </div>

    <form on:submit|preventDefault={greet}>
      <label for="name">Name</label>
      <div class="command-row">
        <input id="name" bind:value={name} autocomplete="off" />
        <button type="submit" disabled={isCalling}>
          {isCalling ? 'Calling...' : 'Invoke'}
        </button>
      </div>
    </form>
  </section>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
    color: #172033;
    background:
      linear-gradient(135deg, rgba(70, 110, 98, 0.14), transparent 38%),
      linear-gradient(225deg, rgba(178, 88, 64, 0.14), transparent 44%),
      #f7f7f2;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .workspace {
    display: grid;
    min-height: 100vh;
    align-content: center;
    gap: 2rem;
    width: min(960px, calc(100% - 2rem));
    margin: 0 auto;
    padding: 4rem 0;
  }

  .intro {
    max-width: 680px;
  }

  .eyebrow {
    margin: 0 0 0.5rem;
    color: #5f6d52;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 1rem;
    font-size: clamp(2.5rem, 8vw, 5.8rem);
    line-height: 0.95;
  }

  h2 {
    margin-bottom: 0.75rem;
    font-size: 1.35rem;
  }

  .lede {
    max-width: 42rem;
    margin-bottom: 0;
    color: #40506a;
    font-size: 1.15rem;
    line-height: 1.7;
  }

  .panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
    gap: 2rem;
    align-items: end;
    padding: 1.25rem;
    border: 1px solid rgba(23, 32, 51, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 18px 48px rgba(23, 32, 51, 0.08);
  }

  .panel p {
    margin-bottom: 0;
    color: #40506a;
    line-height: 1.6;
  }

  form {
    display: grid;
    gap: 0.5rem;
  }

  label {
    color: #40506a;
    font-size: 0.875rem;
    font-weight: 700;
  }

  .command-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
  }

  input,
  button {
    min-height: 2.75rem;
    border-radius: 6px;
    font: inherit;
  }

  input {
    width: 100%;
    border: 1px solid rgba(23, 32, 51, 0.18);
    padding: 0 0.85rem;
    color: #172033;
    background: #ffffff;
  }

  button {
    border: 0;
    padding: 0 1rem;
    color: #ffffff;
    background: #2e5f55;
    font-weight: 800;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.68;
  }

  @media (max-width: 720px) {
    .workspace {
      align-content: start;
      padding-top: 2rem;
    }

    .panel {
      grid-template-columns: 1fr;
    }
  }
</style>
