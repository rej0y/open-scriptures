# Open Scriptures

Open Scriptures is an open source scripture study app built first around long-term maintainability. The project aims to support powerful study workflows while keeping the interface clear, clean, and minimal.

The goal is to build a local-first desktop app that can eventually support advanced scripture study features without turning the UI into a crowded tool. The app should stay easy to read, easy to navigate, and pleasant for focused study while still making room for deeper tools such as notes, highlights, search, cross-references, collections, tags, and other advanced study workflows.

## Current Features

- Local desktop app built with Tauri, SvelteKit, Rust, and SQLite
- Scripture database bundled as a local read-only resource
- Book and chapter navigation
- Previous and next chapter controls
- Scripture search with clickable results
- Responsive reader layout with a minimal reading-focused design

## Project Goals

- Favor long-term maintainability over short-term cleverness.
- Keep the project open source and approachable for contributors.
- Build powerful study features without sacrificing a clean, minimal UI.
- Keep scripture content available locally where possible.
- Design features so they can grow over time: notes, highlighting, bookmarks, tags, cross-references, saved searches, study plans, and more.

## Development Setup

The preferred development environment is the included Nix shell:

```bash
nix develop
```

Then install JavaScript dependencies:

```bash
npm install
```

If you are not using Nix, install the equivalent local toolchain:

- Node.js 22 or newer
- Rust stable
- Tauri CLI and Linux desktop dependencies for Tauri 2
- SQLite tooling, useful for inspecting the bundled database

## Running the App

Start the Tauri development app:

```bash
cargo tauri dev
```

For frontend-only development:

```bash
npm run dev
```

The frontend dev server binds to `127.0.0.1`.

## Checks

Run Svelte and TypeScript checks:

```bash
npm run check
```

Build the frontend:

```bash
npm run build
```

Check the Rust/Tauri backend:

```bash
cargo check
```

## Project Structure

- `src/routes/+page.svelte` - main scripture reader UI
- `src-tauri/src/lib.rs` - Tauri commands for scripture data access
- `src-tauri/resources/scriptures/` - bundled SQLite scripture database
- `src-tauri/tauri.conf.json` - Tauri app configuration and bundled resources
- `flake.nix` - reproducible development shell

## Future Work

- [ ] Add note taking
- [ ] Add highlighting
- [ ] Add bookmarks and saved passages
- [ ] Add stronger search tools, including filters and phrase matching
- [ ] Add cross-references and study links
- [ ] Add user-owned local study data storage
- [ ] Add import/export or sync options for personal study data
- [ ] Add automated tests around scripture data access and UI behavior
