import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const ROOT = process.cwd();
const APP_HOST = '127.0.0.1';
const APP_INDEX = '/';

function spawnTracked(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  return {
    child,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    }
  };
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, APP_HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;

      server.close(() => {
        if (port === null) {
          reject(new Error('Failed to allocate a free port.'));
          return;
        }

        resolve(port);
      });
    });
  });
}

async function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}. ${lastError ? String(lastError) : ''}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);

      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message || 'CDP command failed'));
          return;
        }

        pending.resolve(message.result);
        return;
      }

      const handlers = this.eventHandlers.get(message.method) ?? [];
      for (const handler of handlers) {
        handler(message.params);
      }
    });

    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
  }

  on(method, handler) {
    const handlers = this.eventHandlers.get(method) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(method, handlers);
  }

  send(method, params = {}) {
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    for (const { reject } of this.pending.values()) {
      reject(new Error('CDP client closed before receiving a response.'));
    }
    this.pending.clear();

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
      await new Promise((resolve) => this.socket.addEventListener('close', resolve, { once: true }));
    }
  }
}

async function launchDevServer(port) {
  const server = spawnTracked('npm', [
    'run',
    'dev',
    '--',
    '--host',
    APP_HOST,
    '--strictPort',
    '--port',
    String(port)
  ]);
  const exitPromise = new Promise((_, reject) => {
    server.child.once('exit', (code, signal) => {
      reject(new Error(`Dev server exited before becoming ready (${code ?? signal}).`));
    });
    server.child.once('error', reject);
  });

  try {
    await Promise.race([waitForHttp(`http://${APP_HOST}:${port}${APP_INDEX}`), exitPromise]);
    return server;
  } catch (error) {
    server.child.kill('SIGTERM');
    throw new Error(`${error.message}\n${server.stdout}\n${server.stderr}`);
  }
}

async function launchChrome(debugPort, appUrl) {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'open-scriptures-browser-'));
  const chromeProcess = spawnTracked('google-chrome-stable', [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ]);
  const exitPromise = new Promise((_, reject) => {
    chromeProcess.child.once('exit', (code, signal) => {
      reject(new Error(`Chrome exited before becoming ready (${code ?? signal}).`));
    });
    chromeProcess.child.once('error', reject);
  });

  try {
    await Promise.race([
      waitForHttp(`http://${APP_HOST}:${debugPort}/json/version`),
      exitPromise
    ]);
    const pagesResponse = await fetch(`http://${APP_HOST}:${debugPort}/json/list`);
    const pages = await pagesResponse.json();
    const page = pages.find((entry) => entry.type === 'page');
    if (!page) {
      throw new Error('No page target found in Chrome debugger list.');
    }

    const client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();

    return {
      chromeProcess,
      client,
      userDataDir
    };
  } catch (error) {
    chromeProcess.child.kill('SIGTERM');
    await rm(userDataDir, { recursive: true, force: true });
    throw new Error(`${error.message}\n${chromeProcess.stdout}\n${chromeProcess.stderr}`);
  }
}

function buildMockInvokeSource() {
  const mockState = {
    books: [
      { title: '1 Nephi', volume: 'Book of Mormon', chapter_count: 2 },
      { title: '2 Nephi', volume: 'Book of Mormon', chapter_count: 1 }
    ],
    chapters: {
      '1 Nephi:1': {
        volume: 'Book of Mormon',
        book: '1 Nephi',
        chapter: 1,
        previous_chapter: null,
        next_chapter: 2,
        reference: '1 Nephi 1',
        verses: [
          { number: 1, text: 'I, Nephi, having been born of goodly parents.' },
          { number: 2, text: 'And I make a record of my proceedings.' }
        ]
      },
      '1 Nephi:2': {
        volume: 'Book of Mormon',
        book: '1 Nephi',
        chapter: 2,
        previous_chapter: 1,
        next_chapter: null,
        reference: '1 Nephi 2',
        verses: [
          { number: 1, text: 'And it came to pass that the Lord spake unto me.' }
        ]
      },
      '2 Nephi:1': {
        volume: 'Book of Mormon',
        book: '2 Nephi',
        chapter: 1,
        previous_chapter: null,
        next_chapter: null,
        reference: '2 Nephi 1',
        verses: [
          { number: 1, text: 'Behold, it came to pass that I, Nephi, did give.' }
        ]
      }
    },
    savedWords: [
      {
        id: 1,
        selection_id: 'group-a',
        volume: 'Book of Mormon',
        book: '1 Nephi',
        chapter: 1,
        verse: 1,
        reference: '1 Nephi 1:1',
        selected_text: 'Nephi',
        verse_text: 'I, Nephi, having been born of goodly parents.',
        start_offset: 3,
        end_offset: 8,
        created_at: '2026-05-09T21:00:00.000Z'
      },
      {
        id: 2,
        selection_id: 'group-b',
        volume: 'Book of Mormon',
        book: '2 Nephi',
        chapter: 1,
        verse: 1,
        reference: '2 Nephi 1:1',
        selected_text: 'Behold',
        verse_text: 'Behold, it came to pass that I, Nephi, did give.',
        start_offset: 0,
        end_offset: 6,
        created_at: '2026-05-09T21:00:01.000Z'
      }
    ],
    bookmarks: [],
    calls: []
  };

  return `
    (() => {
      const state = ${JSON.stringify(mockState)};
      globalThis.__OPEN_SCRIPTURES_CALLS__ = state.calls;
      globalThis.__OPEN_SCRIPTURES_INVOKE__ = async (command, args = {}) => {
        state.calls.push({ command, args });

        switch (command) {
          case 'list_books':
            return structuredClone(state.books);
          case 'list_saved_words':
            return structuredClone(state.savedWords);
          case 'list_bookmarks':
            return structuredClone(state.bookmarks);
          case 'get_chapter': {
            const key = \`\${args.book}:\${args.chapterNumber}\`;
            const chapter = state.chapters[key];
            if (!chapter) throw new Error(\`Missing chapter for \${key}\`);
            return structuredClone(chapter);
          }
          case 'search_scriptures': {
            const query = String(args.query ?? '').toLowerCase();
            if (query.includes('nephi')) {
              return [
                {
                  volume: 'Book of Mormon',
                  book: '2 Nephi',
                  chapter: 1,
                  verse: 1,
                  reference: '2 Nephi 1:1',
                  text: 'Behold, it came to pass that I, Nephi, did give.'
                }
              ];
            }
            return [];
          }
          case 'save_word':
            return {
              id: 3,
              selection_id: args.selectionId ?? 'saved-selection',
              volume: 'Book of Mormon',
              book: args.book,
              chapter: args.chapter,
              verse: args.verse,
              reference: \`\${args.book} \${args.chapter}:\${args.verse}\`,
              selected_text: args.selectedText,
              verse_text: '',
              start_offset: args.startOffset,
              end_offset: args.endOffset,
              created_at: new Date().toISOString()
            };
          case 'save_bookmark': {
            const nextBookmark = {
              id: state.bookmarks.length + 1,
              title: String(args.title ?? '').trim(),
              volume: String(args.volume ?? ''),
              book: String(args.book ?? ''),
              chapter: Number(args.chapter ?? 0),
              reference: String(args.book ?? '') + ' ' + String(args.chapter ?? ''),
              created_at: new Date().toISOString()
            };
            state.bookmarks = [
              nextBookmark,
              ...state.bookmarks.filter(
                (bookmark) =>
                  !(
                    bookmark.title === nextBookmark.title &&
                    bookmark.book === nextBookmark.book &&
                    bookmark.chapter === nextBookmark.chapter
                  )
              )
            ];
            return structuredClone(nextBookmark);
          }
          case 'remove_bookmark':
            state.bookmarks = state.bookmarks.filter((bookmark) => bookmark.id !== args.id);
            return undefined;
          case 'remove_saved_word':
            state.savedWords = state.savedWords.filter((word) => word.id !== args.id);
            return undefined;
          default:
            throw new Error(\`Unhandled command: \${command}\`);
        }
      };
    })();
  `;
}

async function createHarness() {
  const appPort = await getFreePort();
  const devServer = await launchDevServer(appPort);
  const debugPort = await getFreePort();
  const appUrl = `http://${APP_HOST}:${appPort}${APP_INDEX}`;
  const browser = await launchChrome(debugPort, appUrl);
  const { client } = browser;

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: buildMockInvokeSource()
  });
  await client.send('Page.navigate', { url: appUrl });
  await waitFor(client, async () => (await getText(client, 'h1')) === '1 Nephi 1');

  return {
    appPort,
    debugPort,
    appUrl,
    devServer,
    browser,
    client,
    async close() {
      await client.close().catch(() => {});
      browser.chromeProcess.child.kill('SIGTERM');
      devServer.child.kill('SIGTERM');
      await rm(browser.userDataDir, { recursive: true, force: true }).catch(() => {});
    }
  };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  }

  return result.result.value;
}

async function waitFor(client, predicate, timeoutMs = 15000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;

  while (Date.now() < deadline) {
    try {
      lastValue = await predicate();
      if (lastValue) return lastValue;
    } catch (error) {
      lastValue = error;
    }

    await delay(intervalMs);
  }

  throw new Error(`Timed out waiting for browser condition. Last value: ${String(lastValue)}`);
}

async function getText(client, selector) {
  return await evaluate(
    client,
    `(() => document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? '')()`
  );
}

async function getValue(client, selector) {
  return await evaluate(
    client,
    `(() => document.querySelector(${JSON.stringify(selector)})?.value ?? '')()`
  );
}

async function setInputValue(client, selector, value) {
  return await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing input: ${selector}');
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          composed: true,
          data: ${JSON.stringify(value)},
          inputType: 'insertText'
        })
      );
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return element.value;
    })()`
  );
}

async function typeIntoInput(client, selector, value) {
  await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing input: ${selector}');
      element.focus();
      return true;
    })()`
  );

  await client.send('Input.insertText', { text: value });
}

async function clickSelector(client, selector) {
  return await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing element: ${selector}');
      element.click();
      return true;
    })()`
  );
}

async function submitForm(client, selector) {
  return await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing form: ${selector}');
      element.requestSubmit();
      return true;
    })()`
  );
}

async function getCallCommands(client) {
  return await evaluate(client, 'globalThis.__OPEN_SCRIPTURES_CALLS__.map((call) => call.command)');
}

test('browser UI integration', async (t) => {
  await t.test('renders the initial chapter and chapter-local highlights', async (t) => {
    const harness = await createHarness();
    t.after(async () => {
      await harness.close();
    });

    await waitFor(harness.client, async () => (await getText(harness.client, 'h1')) === '1 Nephi 1');
    await waitFor(harness.client, async () => (await getText(harness.client, '.saved-panel .panel-heading span')) === '1');

    const commands = await getCallCommands(harness.client);
    assert(commands.includes('list_books'));
    assert(commands.includes('list_saved_words'));
    assert(commands.includes('get_chapter'));

    await clickSelector(harness.client, '.open-highlights-button');
    await waitFor(harness.client, async () => {
      return (await evaluate(
        harness.client,
        'document.querySelectorAll(".highlights-drawer .highlight-list li").length'
      )) === 1;
    });

    assert.equal(await getText(harness.client, '.highlights-drawer .highlight-link span'), '1 Nephi 1:1');
    assert.equal(await getText(harness.client, 'h1'), '1 Nephi 1');
  });

  await t.test('chapter navigation buttons load adjacent chapters', async (t) => {
    const harness = await createHarness();
    t.after(async () => {
      await harness.close();
    });

    await clickSelector(harness.client, '.chapter-nav button[aria-label="Next chapter"]');
    await waitFor(harness.client, async () => (await getText(harness.client, 'h1')) === '1 Nephi 2');

    await clickSelector(harness.client, '.chapter-nav button[aria-label="Previous chapter"]');
    await waitFor(harness.client, async () => (await getText(harness.client, 'h1')) === '1 Nephi 1');

    const commands = await getCallCommands(harness.client);
    assert(commands.filter((command) => command === 'get_chapter').length >= 3);
  });

  await t.test('chapter bookmarks save, reopen, and remove a chapter title', async (t) => {
    const harness = await createHarness();
    t.after(async () => {
      await harness.close();
    });

    await clickSelector(harness.client, '.chapter-nav button[aria-label="Next chapter"]');
    await waitFor(harness.client, async () => (await getText(harness.client, 'h1')) === '1 Nephi 2');

    await typeIntoInput(harness.client, '.bookmark-form input[type="text"]', 'Lehi leaves');
    await clickSelector(harness.client, '.bookmark-form button[type="submit"]');

    await waitFor(harness.client, async () =>
      (await getText(harness.client, '.bookmark-list .bookmark-link span')) === 'Lehi leaves'
    );

    await clickSelector(harness.client, '.chapter-nav button[aria-label="Previous chapter"]');
    await waitFor(harness.client, async () => (await getText(harness.client, 'h1')) === '1 Nephi 1');

    await clickSelector(harness.client, '.bookmark-list .bookmark-link');
    await waitFor(harness.client, async () => (await getText(harness.client, 'h1')) === '1 Nephi 2');

    await clickSelector(harness.client, '.remove-bookmark-button');
    await waitFor(harness.client, async () =>
      (await evaluate(
        harness.client,
        'document.querySelectorAll(".bookmark-list li").length'
      )) === 0
    );

    const commands = await getCallCommands(harness.client);
    assert(commands.includes('save_bookmark'));
    assert(commands.includes('remove_bookmark'));
  });
});

test('note moves when the second click is held and dragged', async (t) => {
  const harness = await createHarness();
  t.after(async () => {
    await harness.close();
  });

  await waitFor(harness.client, async () => (await getText(harness.client, 'h1')) === '1 Nephi 1');
  const start = await evaluate(
    harness.client,
    `(async () => {
      const chapter = document.querySelector('.chapter-view');
      const chapterBounds = chapter.getBoundingClientRect();
      chapter.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        clientX: Math.min(chapterBounds.right - 40, window.innerWidth - 40),
        clientY: chapterBounds.top + 40
      }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const textarea = document.querySelector('.chapter-note textarea');
      textarea.value = 'move me';
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'move me' }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const note = document.querySelector('.chapter-note');
      note.scrollIntoView({ block: 'center' });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const before = note.getBoundingClientRect();
      const x = before.left + before.width / 2;
      const y = before.top + before.height / 2;
      return { x, y, target: document.elementFromPoint(x, y)?.className ?? null, before: { left: before.left, top: before.top } };
    })()`
  );

  await harness.client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 });
  await harness.client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x, y: start.y, button: 'left', buttons: 0, clickCount: 1 });
  await harness.client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 2 });
  await harness.client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + 80, y: start.y + 80, button: 'left', buttons: 1 });
  await harness.client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x + 80, y: start.y + 80, button: 'left', buttons: 0, clickCount: 2 });
  await delay(30);
  const after = await evaluate(harness.client, `(() => { const bounds = document.querySelector('.chapter-note').getBoundingClientRect(); return { left: bounds.left, top: bounds.top }; })()`);

  assert.notEqual(after.left, start.before.left, JSON.stringify({ start, after }));
});

test('note bottom edge reaches the dragged height without clipping text', async (t) => {
  const harness = await createHarness();
  t.after(async () => {
    await harness.close();
  });

  const start = await evaluate(
    harness.client,
    `(async () => {
      const chapter = document.querySelector('.chapter-view');
      const chapterBounds = chapter.getBoundingClientRect();
      chapter.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        clientX: chapterBounds.left + 40,
        clientY: chapterBounds.top + chapter.scrollHeight + 80
      }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const textarea = document.querySelector('.chapter-note textarea');
      textarea.value = 'A note with enough words to wrap across several lines.';
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      textarea.focus();
      const note = document.querySelector('.chapter-note');
      const noteBounds = note.getBoundingClientRect();
      const handleBounds = document.querySelector('.note-handle-bottom').getBoundingClientRect();
      return {
        x: handleBounds.left + handleBounds.width / 2,
        y: handleBounds.top + handleBounds.height / 2,
        before: { width: noteBounds.width, height: noteBounds.height }
      };
    })()`
  );

  await evaluate(
    harness.client,
    `(() => {
      const chapter = document.querySelector('.chapter-view');
      const handle = document.querySelector('.note-handle-bottom');
      chapter.setPointerCapture = () => {};
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: ${start.x},
        clientY: ${start.y}
      }));
      chapter.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: ${start.x},
        clientY: ${start.y + 120}
      }));
      chapter.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: ${start.x},
        clientY: ${start.y + 120}
      }));
    })()`
  );
  await delay(30);

  const after = await evaluate(
    harness.client,
    `(() => {
      const note = document.querySelector('.chapter-note').getBoundingClientRect();
      const textarea = document.querySelector('.chapter-note textarea');
      return {
        width: note.width,
        height: note.height,
        scrollHeight: textarea.scrollHeight,
        clientHeight: textarea.clientHeight
      };
    })()`
  );

  assert(after.height >= start.before.height + 110, JSON.stringify({ start, after }));
  assert(after.width < start.before.width, JSON.stringify({ start, after }));
  assert(after.scrollHeight <= after.clientHeight, JSON.stringify(after));
});
