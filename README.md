# Open Scriptures

Open Scriptures is prepared as a desktop app using Tauri, SvelteKit, and
TypeScript.

## Development

Enter the Nix shell first so Node, Rust, the Tauri CLI, and Linux native
dependencies are available:

```sh
nix develop
```

Install JavaScript dependencies:

```sh
npm install
```

Run the SvelteKit web app:

```sh
npm run dev
```

Run the Tauri desktop app:

```sh
npm run tauri dev
```

Check the TypeScript and Svelte sources:

```sh
npm run check
```

Build the SvelteKit frontend:

```sh
npm run build
```

## Project Layout

* `src/` contains the SvelteKit TypeScript frontend.
* `src-tauri/` contains the Tauri Rust application shell.
* `flake.nix` defines the local development environment.
