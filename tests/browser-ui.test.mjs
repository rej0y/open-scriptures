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
      { title: '1 Nephi', short_title: '1 Ne.', volume: 'Book of Mormon', chapter_count: 2 },
      { title: '2 Nephi', short_title: '2 Ne.', volume: 'Book of Mormon', chapter_count: 1 }
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
          {
            number: 1,
            text: 'I, Nephi, having been born of goodly parents.',
            topic_links: [
              { topic_id: 1, title: 'Nephi', start_offset: 3, end_offset: 8 },
              { topic_id: 2, title: 'Book of Mormon', start_offset: 37, end_offset: 44 }
            ]
          },
          { number: 2, text: 'And I make a record of my proceedings.', topic_links: [] }
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
          { number: 1, text: 'And it came to pass that the Lord spake unto me.', topic_links: [] }
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
          { number: 1, text: 'Behold, it came to pass that I, Nephi, did give.', topic_links: [] }
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
          case 'get_topical_guide_topic':
            return {
              id: Number(args.topicId),
              title: 'Nephi',
              related_topics: 'See also Book of Mormon; Mys- teries of Godliness; BD Missing',
              content:
                '1 Ne. 1:1 (2 Ne. 1:1;\\n2 Ne. 1:2) I, Nephi,\\nhaving been born of goodly parents.\\n1 Ne. 1:2 (2:1; 2:2, 3) Yea, I make a record; the record is true; 2:1 And I went forth.',
              source_page: 321
            };
          case 'get_topical_guide_topic_by_title':
            if (String(args.topicTitle) === 'BD Missing') {
              throw new Error('Topical Guide topic is not available');
            }
            return {
              id: 2,
              title: String(args.topicTitle),
              related_topics: 'See also Nephi',
              content: '1 Ne. 6:3 I should write of the things of God.',
              source_page: 322
            };
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

async function swipeChapter(client, direction) {
  return await evaluate(
    client,
    `(async () => {
      const viewport = document.querySelector('.chapter-carousel-viewport');
      const carousel = document.querySelector('.chapter-carousel');
      if (!viewport || !carousel) throw new Error('Missing chapter carousel.');
      const pageWidth = carousel.clientWidth / 3;
      viewport.scrollTo({ left: ${direction === 'next' ? 'pageWidth * 2' : '0'}, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 250));
      return viewport.scrollLeft;
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

  await t.test('swiping loads adjacent chapters without arrow buttons', async (t) => {
    const harness = await createHarness();
    t.after(async () => {
      await harness.close();
    });

    assert.equal(
      await evaluate(harness.client, 'document.querySelectorAll(".chapter-nav").length'),
      0
    );

    await swipeChapter(harness.client, 'next');
    await waitFor(harness.client, async () =>
      (await getText(harness.client, '.chapter-slide:nth-child(2) h1')) === '1 Nephi 2'
    );

    await swipeChapter(harness.client, 'previous');
    await waitFor(harness.client, async () =>
      (await getText(harness.client, '.chapter-slide:nth-child(2) h1')) === '1 Nephi 1'
    );

    const commands = await getCallCommands(harness.client);
    assert(commands.filter((command) => command === 'get_chapter').length >= 3);
  });

  await t.test('chapter bookmarks save, reopen, and remove a chapter title', async (t) => {
    const harness = await createHarness();
    t.after(async () => {
      await harness.close();
    });

    await swipeChapter(harness.client, 'next');
    await waitFor(harness.client, async () =>
      (await getText(harness.client, '.chapter-slide:nth-child(2) h1')) === '1 Nephi 2'
    );

    await typeIntoInput(harness.client, '.bookmark-form input[type="text"]', 'Lehi leaves');
    await clickSelector(harness.client, '.bookmark-form button[type="submit"]');

    await waitFor(harness.client, async () =>
      (await getText(harness.client, '.bookmark-list .bookmark-link span')) === 'Lehi leaves'
    );

    await swipeChapter(harness.client, 'previous');
    await waitFor(harness.client, async () =>
      (await getText(harness.client, '.chapter-slide:nth-child(2) h1')) === '1 Nephi 1'
    );

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

test('carousel height follows the visible chapter', async (t) => {
  const harness = await createHarness();
  t.after(async () => {
    await harness.close();
  });

  await waitFor(
    harness.client,
    async () => (await getText(harness.client, '.chapter-slide:nth-child(3) h1')) === '1 Nephi 2'
  );
  await swipeChapter(harness.client, 'next');
  await waitFor(harness.client, async () =>
    (await getText(harness.client, '.chapter-slide:nth-child(2) h1')) === '1 Nephi 2'
  );

  const dimensions = await evaluate(
    harness.client,
    `(() => {
      const viewport = document.querySelector('.chapter-carousel-viewport').getBoundingClientRect();
      const chapter = document.querySelector('.chapter-slide:nth-child(2) .chapter-view').getBoundingClientRect();
      return { viewportHeight: viewport.height, chapterHeight: chapter.height };
    })()`
  );

  assert(Math.abs(dimensions.viewportHeight - dimensions.chapterHeight) < 1, JSON.stringify(dimensions));
});

test('topical guide words are underlined and open the side page', async (t) => {
  const harness = await createHarness();
  t.after(async () => {
    await harness.close();
  });

  const topicSelector = '.chapter-slide:nth-child(2) .topical-guide-link[data-topic-id="1"]';
  assert.equal(
    await evaluate(
      harness.client,
      `getComputedStyle(document.querySelector(${JSON.stringify(topicSelector)})).textDecorationLine`
    ),
    'underline'
  );
  assert.equal(
    await evaluate(
      harness.client,
      `(() => {
        const style = getComputedStyle(document.querySelector(${JSON.stringify(topicSelector)}));
        return style.textDecorationColor === style.color;
      })()`
    ),
    true
  );

  await clickSelector(harness.client, topicSelector);
  await waitFor(
    harness.client,
    async () => (await getText(harness.client, '.topical-guide-page h2')) === 'Nephi'
  );
  assert.match(await getText(harness.client, '.topical-guide-page .topic-content'), /1 Ne\. 1:1/);
  assert.equal(
    await evaluate(
      harness.client,
      'document.querySelectorAll(".topical-guide-page .related-topics li").length'
    ),
    3
  );
  assert.equal(
    await getText(harness.client, '.topical-guide-page .related-topics h3'),
    'See also'
  );
  assert.deepEqual(
    await evaluate(
      harness.client,
      `(() => {
        const panel = getComputedStyle(document.querySelector('.topical-guide-page'));
        const eyebrow = getComputedStyle(document.querySelector('.topical-guide-page .eyebrow'));
        const list = getComputedStyle(document.querySelector('.topical-guide-page .related-topics ul'));
        return {
          boxSizing: panel.boxSizing,
          textTransform: eyebrow.textTransform,
          listStyleType: list.listStyleType
        };
      })()`
    ),
    { boxSizing: 'border-box', textTransform: 'uppercase', listStyleType: 'none' }
  );
  assert.equal(
    await getText(harness.client, '.topical-guide-page .related-topic-label'),
    'BD Missing'
  );
  assert.deepEqual(
    await evaluate(
      harness.client,
      'Array.from(document.querySelectorAll(".topical-guide-page .related-topic-button"), (button) => button.textContent.trim())'
    ),
    ['Book of Mormon', 'Mysteries of Godliness']
  );
  assert.equal(
    await evaluate(harness.client, 'document.querySelectorAll(".reader-side-page").length'),
    1
  );
  assert.equal(
    await evaluate(
      harness.client,
      'document.body.textContent.toLocaleLowerCase().includes("is not available")'
    ),
    false
  );
  assert.equal(
    await getText(harness.client, '.topical-guide-page .topic-content h3'),
    'Scripture references'
  );
  assert.equal(
    await evaluate(
      harness.client,
      'document.querySelectorAll(".topical-guide-page .reference-list p").length'
    ),
    3
  );
  assert.match(
    await getText(harness.client, '.topical-guide-page .reference-list p'),
    /Nephi, having been born/
  );
  assert.match(
    await getText(harness.client, '.topical-guide-page .reference-list p:nth-child(2)'),
    /record; the record is true/
  );

  assert.equal(
    await evaluate(
      harness.client,
      `(() => {
        const panel = document.querySelector('.topical-guide-page');
        document.querySelector('.reference-list').style.minHeight = '1800px';
        panel.scrollTop = panel.scrollHeight;
        return panel.scrollTop > 0;
      })()`
    ),
    true
  );
  await clickSelector(harness.client, topicSelector);
  await waitFor(
    harness.client,
    async () => (await getText(harness.client, '.topical-guide-page h2')) === 'Nephi'
  );
  await delay(300);
  assert.deepEqual(
    await evaluate(
      harness.client,
      `(() => {
        const panel = document.querySelector('.topical-guide-page');
        return {
          hidden: panel.classList.contains('panel-hidden'),
          scrollTop: panel.scrollTop
        };
      })()`
    ),
    { hidden: false, scrollTop: 0 }
  );

  const paneLayout = await evaluate(
    harness.client,
    `(() => {
      const mainElement = document.querySelector('.reader-scroll-viewport');
      const main = mainElement.getBoundingClientRect();
      const panelElement = document.querySelector('.topical-guide-page');
      const panel = panelElement.getBoundingClientRect();
      const chapterElement = document.querySelector('.chapter-slide:nth-child(2) .chapter-view');
      const chapter = chapterElement.getBoundingClientRect();
      const chapterHeader = chapterElement.querySelector('.chapter-header').getBoundingClientRect();
      const chapterStyle = getComputedStyle(chapterElement);
      return {
        mainRight: main.right,
        panelLeft: panel.left,
        panelRight: panel.right,
        mainOverflowY: getComputedStyle(mainElement).overflowY,
        panelOverflowY: getComputedStyle(panelElement).overflowY,
        mainScrollbarWidth: getComputedStyle(
          mainElement,
          '::-webkit-scrollbar'
        ).width,
        panelScrollbarWidth: getComputedStyle(panelElement, '::-webkit-scrollbar').width,
        chapterBorderWidth: chapterStyle.borderWidth,
        chapterBoxShadow: chapterStyle.boxShadow,
        chapterCenterOffset: Math.abs(
          (chapterHeader.left + chapterHeader.right) / 2 - (main.left + main.right) / 2
        ),
        chapterInsideMain: chapter.left >= main.left && chapter.right <= main.right + 1,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight
      };
    })()`
  );
  assert(paneLayout.mainRight <= paneLayout.panelLeft + 1, JSON.stringify(paneLayout));
  assert(paneLayout.panelRight <= 800, JSON.stringify(paneLayout));
  assert.equal(paneLayout.mainOverflowY, 'auto');
  assert.equal(paneLayout.panelOverflowY, 'auto');
  assert.equal(paneLayout.panelScrollbarWidth, paneLayout.mainScrollbarWidth);
  assert.equal(paneLayout.chapterBorderWidth, '0px');
  assert.equal(paneLayout.chapterBoxShadow, 'none');
  assert(paneLayout.chapterCenterOffset <= 2, JSON.stringify(paneLayout));
  assert.equal(paneLayout.chapterInsideMain, true);
  assert(paneLayout.documentHeight <= paneLayout.viewportHeight + 1, JSON.stringify(paneLayout));
  assert.equal(
    await evaluate(harness.client, 'getComputedStyle(document.querySelector(".topical-guide-page")).boxShadow'),
    'none'
  );
  assert.equal(
    await evaluate(harness.client, 'document.querySelectorAll(".topical-guide-page .close-button").length'),
    0
  );

  await swipeChapter(harness.client, 'next');
  await delay(250);
  assert.equal(
    await getText(harness.client, '.chapter-slide:nth-child(2) h1'),
    '1 Nephi 1'
  );
  assert.equal(
    await getText(harness.client, '.topical-guide-page h2'),
    'Nephi'
  );
  assert.deepEqual(
    await evaluate(
      harness.client,
      'Array.from(document.querySelectorAll(".scripture-reference-button"), (button) => button.textContent)'
    ),
    ['1 Ne. 1:1', '2 Ne. 1:1', '2 Ne. 1:2', '1 Ne. 1:2', '2:1', '2:2, 3', '1 Ne. 2:1']
  );

  await clickSelector(
    harness.client,
    '.reference-list p:first-child .scripture-reference-button:nth-of-type(2)'
  );
  await waitFor(
    harness.client,
    async () => (await getText(harness.client, '.scripture-reference-page h2')) === '2 Nephi 1'
  );
  await clickSelector(harness.client, '.topical-guide-page.primary header');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(harness.client, 'document.querySelector(".scripture-reference-page")')) === null
  );

  await clickSelector(
    harness.client,
    '.reference-list p:nth-child(2) .scripture-reference-button'
  );
  await waitFor(
    harness.client,
    async () => (await getText(harness.client, '.scripture-reference-page h2')) === '1 Nephi 1'
  );
  assert.equal(
    await evaluate(
      harness.client,
      'document.querySelectorAll(".reader-side-page").length'
    ),
    2
  );
  assert.equal(await getText(harness.client, '.chapter-slide:nth-child(2) h1'), '1 Nephi 1');
  assert.equal(
    await getText(harness.client, '.scripture-reference-page .referenced-verse .verse-number'),
    '2'
  );
  const verseTypography = await evaluate(
    harness.client,
    `(() => {
      const properties = ['fontFamily'];
      const main = getComputedStyle(document.querySelector('.chapter-slide:nth-child(2) .verse-row p'));
      const side = getComputedStyle(document.querySelector('.scripture-reference-page .verse-row p'));
      return {
        main: Object.fromEntries(properties.map((property) => [property, main[property]])),
        side: Object.fromEntries(properties.map((property) => [property, side[property]]))
      };
    })()`
  );
  assert.deepEqual(verseTypography.side, verseTypography.main);
  assert.equal(
    await evaluate(
      harness.client,
      `(() => {
        const panel = document.querySelector('.scripture-reference-page').getBoundingClientRect();
        const heading = document.querySelector('.scripture-reference-page h2').getBoundingClientRect();
        return heading.left >= panel.left && heading.right <= panel.right;
      })()`
    ),
    true
  );
  assert.deepEqual(
    await evaluate(
      harness.client,
      `(() => {
        const style = getComputedStyle(document.querySelector('.scripture-reference-page .chapter-view'));
        return { borderWidth: style.borderWidth, boxShadow: style.boxShadow };
      })()`
    ),
    { borderWidth: '0px', boxShadow: 'none' }
  );
  assert.equal(
    await evaluate(
      harness.client,
      `(() => {
        return globalThis.__OPEN_SCRIPTURES_CALLS__.some(
          (entry) =>
            entry.command === 'get_chapter' &&
            entry.args.book === '1 Nephi' &&
            entry.args.chapterNumber === 1
        );
      })()`
    ),
    true
  );

  assert.equal(
    await getText(
      harness.client,
      '.scripture-reference-page .topical-guide-link[data-topic-id="2"]'
    ),
    'parents'
  );
  await clickSelector(
    harness.client,
    '.scripture-reference-page .topical-guide-link[data-topic-id="2"]'
  );
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(harness.client, 'document.querySelectorAll(".reader-side-page").length')) === 3
  );
  assert.equal(
    await getText(harness.client, '.reader-side-page:last-of-type h2'),
    'Book of Mormon'
  );
  await clickSelector(harness.client, '.scripture-reference-page header');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(harness.client, 'document.querySelectorAll(".reader-side-page").length')) === 2
  );
  await clickSelector(harness.client, '.topical-guide-page.primary header');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(harness.client, 'document.querySelector(".scripture-reference-page")')) === null
  );

  await clickSelector(harness.client, '.topical-guide-page .related-topics button');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(
        harness.client,
        'document.querySelectorAll(".topical-guide-page").length'
      )) === 2
  );
  assert.deepEqual(
    await evaluate(
      harness.client,
      'Array.from(document.querySelectorAll(".topical-guide-page h2"), (heading) => heading.textContent)'
    ),
    ['Nephi', 'Book of Mormon']
  );

  await clickSelector(
    harness.client,
    '.topical-guide-page[data-panel-index="1"] .related-topic-button'
  );
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(
        harness.client,
        'document.querySelectorAll(".topical-guide-page").length'
      )) === 3
  );
  assert.deepEqual(
    await evaluate(
      harness.client,
      'Array.from(document.querySelectorAll(".topical-guide-page h2"), (heading) => heading.textContent)'
    ),
    ['Nephi', 'Book of Mormon', 'Nephi']
  );
  assert.equal(
    await evaluate(
      harness.client,
      'document.querySelector(".reader-scroll-viewport").classList.contains("reader-page-hidden")'
    ),
    true
  );
  assert.notEqual(
    await evaluate(
      harness.client,
      'getComputedStyle(document.querySelector(".topical-guide-page")).transitionDuration'
    ),
    '0s'
  );

  await clickSelector(harness.client, '.topical-guide-page.primary header');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(
        harness.client,
        'document.querySelectorAll(".topical-guide-page").length'
      )) === 1
  );
  const restoredMainPage = await evaluate(
    harness.client,
    `(() => {
      const main = document.querySelector('.reader-scroll-viewport');
      return {
        width: main.getBoundingClientRect().width,
        opacity: getComputedStyle(main).opacity,
        heading: main.querySelector('.chapter-slide:nth-child(2) h1').textContent
      };
    })()`
  );
  assert(restoredMainPage.width > 0, JSON.stringify(restoredMainPage));
  assert.equal(restoredMainPage.opacity, '1');
  assert.equal(restoredMainPage.heading, '1 Nephi 1');

  await clickSelector(harness.client, '.topical-guide-page.primary .related-topic-button');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(
        harness.client,
        'document.querySelectorAll(".topical-guide-page").length'
      )) === 2
  );
  await clickSelector(
    harness.client,
    '.topical-guide-page[data-panel-index="1"] .related-topic-button'
  );
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(
        harness.client,
        'document.querySelectorAll(".topical-guide-page").length'
      )) === 3
  );

  assert.equal(
    await getText(
      harness.client,
      '.topical-guide-page[data-panel-index="2"] .related-topic-label'
    ),
    'Nephi'
  );
  assert.equal(
    await evaluate(
      harness.client,
      'document.querySelector(".topical-guide-page[data-panel-index=\\"2\\"] .related-topic-button")'
    ),
    null
  );

  await clickSelector(harness.client, '.topical-guide-page[data-panel-index="1"] header');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(
        harness.client,
        'document.querySelectorAll(".topical-guide-page").length'
      )) === 2
  );
  assert.equal(
    await evaluate(
      harness.client,
      'document.querySelector(".reader-scroll-viewport").classList.contains("reader-page-hidden")'
    ),
    false
  );
  assert(
    (await evaluate(
      harness.client,
      'document.querySelector(".reader-scroll-viewport").getBoundingClientRect().width'
    )) > 0
  );

  await clickSelector(harness.client, '.topical-guide-page.primary header');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(
        harness.client,
        'document.querySelectorAll(".topical-guide-page").length'
      )) === 1
  );
  assert.equal(
    await getText(harness.client, '.topical-guide-page h2'),
    'Nephi'
  );
  assert.equal(
    await evaluate(
      harness.client,
      'document.querySelector(".reader-scroll-viewport").classList.contains("reader-page-hidden")'
    ),
    false
  );

  await clickSelector(harness.client, '.chapter-slide:nth-child(2) .chapter-header');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(
        harness.client,
        `(() => {
          const panel = document.querySelector('.topical-guide-page');
          return Boolean(panel?.classList.contains('panel-hidden'));
        })()`
      )) === true
  );
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(harness.client, 'document.querySelector(".topical-guide-page") === null')) === true
  );

  const commands = await getCallCommands(harness.client);
  assert(commands.includes('get_topical_guide_topic'));
  assert(commands.includes('get_topical_guide_topic_by_title'));
});

test('side pages keep note top-left fixed and fit its box to the chapter page', async (t) => {
  const harness = await createHarness();
  t.after(async () => {
    await harness.close();
  });

  await evaluate(
    harness.client,
    `(async () => {
      const chapter = document.querySelector('.chapter-slide:nth-child(2) .chapter-view');
      const bounds = chapter.getBoundingClientRect();
      const verse = chapter.querySelector('.verse-row:nth-child(2)').getBoundingClientRect();
      chapter.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        clientX: bounds.right - 40,
        clientY: verse.bottom - 15
      }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const textarea = document.querySelector('.chapter-note textarea');
      textarea.value = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor';
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    })()`
  );

  const noteBeforeSidePage = await evaluate(
    harness.client,
    `(() => {
      const chapter = document.querySelector('.chapter-slide:nth-child(2) .chapter-view').getBoundingClientRect();
      const page = document.querySelector('.chapter-slide:nth-child(2) .verses').getBoundingClientRect();
      const verse = document.querySelector('.chapter-slide:nth-child(2) .verse-row:nth-child(2)').getBoundingClientRect();
      const note = document.querySelector('.chapter-note').getBoundingClientRect();
      return {
        left: note.left - chapter.left,
        pageLeft: page.left - chapter.left,
        pageOffsetX: note.left - page.left,
        top: note.top - chapter.top,
        verseOffsetY: note.top - verse.top,
        width: note.width,
        height: note.height
      };
    })()`
  );

  await clickSelector(
    harness.client,
    '.chapter-slide:nth-child(2) .topical-guide-link[data-topic-id="1"]'
  );
  await waitFor(
    harness.client,
    async () => (await getText(harness.client, '.topical-guide-page h2')) === 'Nephi'
  );
  const noteWithSidePage = await evaluate(
    harness.client,
    `(() => {
      const chapter = document.querySelector('.chapter-slide:nth-child(2) .chapter-view').getBoundingClientRect();
      const page = document.querySelector('.chapter-slide:nth-child(2) .verses').getBoundingClientRect();
      const verse = document.querySelector('.chapter-slide:nth-child(2) .verse-row:nth-child(2)').getBoundingClientRect();
      const noteElement = document.querySelector('.chapter-note');
      const note = noteElement.getBoundingClientRect();
      return {
        display: getComputedStyle(noteElement).display,
        left: note.left - chapter.left,
        pageLeft: page.left - chapter.left,
        pageOffsetX: note.left - page.left,
        top: note.top - chapter.top,
        verseOffsetY: note.top - verse.top,
        width: note.width,
        height: note.height,
        fontSize: Number.parseFloat(getComputedStyle(noteElement.querySelector('textarea')).fontSize),
        textFits: noteElement.querySelector('textarea').scrollHeight <= noteElement.querySelector('textarea').clientHeight + 1,
        overlapsText: Array.from(document.querySelectorAll('.chapter-slide:nth-child(2) .verse-text'))
          .flatMap((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return Array.from(range.getClientRects());
          })
          .some((bounds) =>
            note.left < bounds.right && note.right > bounds.left &&
            note.top < bounds.bottom && note.bottom > bounds.top
          )
      };
    })()`
  );
  assert.equal(noteWithSidePage.display, 'block');
  assert(Math.abs(noteWithSidePage.pageOffsetX - noteBeforeSidePage.pageOffsetX) < 0.1);
  assert(Math.abs(noteWithSidePage.verseOffsetY - noteBeforeSidePage.verseOffsetY) < 0.1);
  assert(noteWithSidePage.width <= noteBeforeSidePage.width);
  assert(noteWithSidePage.height >= 8);
  assert.equal(noteWithSidePage.textFits, true);
  assert.equal(noteWithSidePage.overlapsText, false);
  if (noteWithSidePage.height > noteBeforeSidePage.height) {
    assert.equal(noteWithSidePage.fontSize, 16);
  }

  await clickSelector(harness.client, '.topical-guide-page .related-topic-button');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(harness.client, 'document.querySelectorAll(".reader-side-page").length')) === 2
  );
  await delay(750);
  const noteWithTwoSidePages = await evaluate(
    harness.client,
    `(() => {
      const chapter = document.querySelector('.chapter-slide:nth-child(2) .chapter-view').getBoundingClientRect();
      const page = document.querySelector('.chapter-slide:nth-child(2) .verses').getBoundingClientRect();
      const verse = document.querySelector('.chapter-slide:nth-child(2) .verse-row:nth-child(2)').getBoundingClientRect();
      const anchoredRow = document.querySelectorAll('.chapter-slide:nth-child(2) .verse-row')[1];
      const anchoredVerse = anchoredRow.getBoundingClientRect();
      const anchoredTextElement = anchoredRow.querySelector('.verse-text');
      const anchoredText = anchoredTextElement.getBoundingClientRect();
      const anchoredRange = document.createRange();
      anchoredRange.selectNodeContents(anchoredTextElement);
      const anchoredLines = Array.from(anchoredRange.getClientRects());
      const anchoredLastLine = anchoredLines[anchoredLines.length - 1];
      const noteElement = document.querySelector('.chapter-note');
      const note = noteElement.getBoundingClientRect();
      const textarea = noteElement.querySelector('textarea');
      return {
        display: getComputedStyle(noteElement).display,
        left: note.left,
        right: note.right,
        top: note.top - chapter.top,
        verseOffsetY: note.top - verse.top,
        followsAnchoredText: note.left >= anchoredLastLine.right && note.left - anchoredLastLine.right <= 7,
        alignedWithAnchoredLine: Math.abs(note.top - anchoredLastLine.top) < 0.1,
        pageLeft: page.left,
        pageRight: page.right,
        pageOffsetX: note.left - page.left,
        textFits: textarea.scrollHeight <= textarea.clientHeight + 1
      };
    })()`
  );
  assert.equal(noteWithTwoSidePages.display, 'block');
  assert.equal(noteWithTwoSidePages.followsAnchoredText, true);
  assert.equal(noteWithTwoSidePages.alignedWithAnchoredLine, true);
  assert.equal(noteWithTwoSidePages.textFits, true);

  await clickSelector(harness.client, '.topical-guide-page.primary header');
  await waitFor(
    harness.client,
    async () =>
      (await evaluate(harness.client, 'document.querySelectorAll(".reader-side-page").length')) === 1
  );

  await clickSelector(harness.client, '.chapter-slide:nth-child(2) .chapter-header');
  await waitFor(
    harness.client,
    async () => (await evaluate(harness.client, 'document.querySelector(".reader-side-page")')) === null
  );
  const restoredNote = await evaluate(
    harness.client,
    `(() => {
      const chapter = document.querySelector('.chapter-slide:nth-child(2) .chapter-view').getBoundingClientRect();
      const page = document.querySelector('.chapter-slide:nth-child(2) .verses').getBoundingClientRect();
      const verse = document.querySelector('.chapter-slide:nth-child(2) .verse-row:nth-child(2)').getBoundingClientRect();
      const noteElement = document.querySelector('.chapter-note');
      const note = noteElement.getBoundingClientRect();
      return {
        display: getComputedStyle(noteElement).display,
        left: note.left - chapter.left,
        pageLeft: page.left - chapter.left,
        pageOffsetX: note.left - page.left,
        top: note.top - chapter.top,
        verseOffsetY: note.top - verse.top,
        width: note.width
      };
    })()`
  );
  assert.equal(restoredNote.display, 'block');
  assert(Math.abs(restoredNote.pageOffsetX - noteBeforeSidePage.pageOffsetX) < 0.1);
  assert(Math.abs(restoredNote.verseOffsetY - noteBeforeSidePage.verseOffsetY) < 0.1);
  assert(Math.abs(restoredNote.width - noteBeforeSidePage.width) <= 1);
});

test('chapter text enters inline editing and persists modified text', async (t) => {
  const harness = await createHarness();
  t.after(async () => {
    await harness.close();
  });

  await waitFor(harness.client, async () => (await getText(harness.client, 'h1')) === '1 Nephi 1');
  const editingState = await evaluate(
    harness.client,
    `(async () => {
      const verse = document.querySelector('.chapter-slide:nth-child(2) .verse-text');
      const bounds = verse.getBoundingClientRect();
      verse.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        clientX: bounds.left + Math.min(30, bounds.width / 2),
        clientY: bounds.top + bounds.height / 2
      }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const editingVerse = document.querySelector('.chapter-slide:nth-child(2) .verse-text');
      const selection = document.getSelection();
      return {
        contentEditable: editingVerse.getAttribute('contenteditable'),
        hasFocus: document.activeElement === editingVerse,
        hasCursor: Boolean(selection?.rangeCount && editingVerse.contains(selection.anchorNode))
      };
    })()`
  );

  assert.deepEqual(editingState, {
    contentEditable: 'true',
    hasFocus: true,
    hasCursor: true
  });

  await harness.client.send('Input.insertText', { text: 'changed ' });
  await delay(30);
  const liveTypingState = await evaluate(
    harness.client,
    `(() => {
      const verse = document.querySelector('.chapter-slide:nth-child(2) .verse-text');
      const selection = document.getSelection();
      return {
        text: verse.textContent,
        hasFocus: document.activeElement === verse,
        hasCursor: Boolean(selection?.rangeCount && verse.contains(selection.anchorNode)),
        hasModificationButton: Boolean(
          document.querySelector('.chapter-slide:nth-child(2) .verse-modification-button')
        )
      };
    })()`
  );

  assert.match(liveTypingState.text, /changed/);
  assert.equal(liveTypingState.hasFocus, true);
  assert.equal(liveTypingState.hasCursor, true);
  assert.equal(liveTypingState.hasModificationButton, false);

  const savedState = await evaluate(
    harness.client,
    `(async () => {
      const verses = document.querySelectorAll('.chapter-slide:nth-child(2) .verse-text');
      const verse = verses[0];
      verse.textContent = 'I changed this chapter text.';
      verse.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      verse.blur();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const saved = JSON.parse(localStorage.getItem('open-scriptures:chapter-text:1 Nephi:1') ?? '{}');
      const renderedVerses = document.querySelectorAll('.chapter-slide:nth-child(2) .verse-text');
      const renderedVerse = renderedVerses[0];
      const modificationButton = document.querySelector(
        '.chapter-slide:nth-child(2) .verse-modification-button'
      );
      const hasResetBeforeOpen = Boolean(
        document.querySelector('.chapter-slide:nth-child(2) .verse-reset-button')
      );
      modificationButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const modificationPanel = document.querySelector(
        '.chapter-slide:nth-child(2) .verse-modification-popover'
      );
      const verseContentBounds = renderedVerse.closest('.verse-content')?.getBoundingClientRect();
      const modificationButtonBounds = modificationButton?.getBoundingClientRect();
      const resetButtonBounds = document.querySelector(
        '.chapter-slide:nth-child(2) .verse-reset-button'
      )?.getBoundingClientRect();
      const modificationPanelBounds = modificationPanel?.getBoundingClientRect();
      return {
        text: renderedVerse.textContent,
        modified: renderedVerse.classList.contains('verse-text-modified'),
        color: getComputedStyle(renderedVerse).color,
        originalColor: getComputedStyle(renderedVerses[1]).color,
        hasModificationButton: Boolean(modificationButton),
        hasResetBeforeOpen,
        hasResetAfterOpen: Boolean(
          document.querySelector('.chapter-slide:nth-child(2) .verse-reset-button')
        ),
        modificationRightDelta: verseContentBounds && modificationButtonBounds
          ? modificationButtonBounds.left - verseContentBounds.right
          : -1,
        resetCenterDelta: modificationPanelBounds && resetButtonBounds
          ? Math.abs(
              modificationPanelBounds.top + modificationPanelBounds.height / 2 -
              (resetButtonBounds.top + resetButtonBounds.height / 2)
            )
          : 999,
        buttonBorderStyle: modificationButton
          ? getComputedStyle(modificationButton).borderStyle
          : '',
        panelText: modificationPanel?.textContent ?? '',
        removedText: Array.from(
          document.querySelectorAll('.chapter-slide:nth-child(2) .verse-modification-removed')
        ).map((part) => part.textContent).join(''),
        addedText: Array.from(
          document.querySelectorAll('.chapter-slide:nth-child(2) .verse-modification-added')
        ).map((part) => part.textContent).join(''),
        savedText: saved['1'] ?? ''
      };
    })()`
  );

  assert.equal(savedState.text, 'I changed this chapter text.');
  assert.equal(savedState.modified, true, JSON.stringify(savedState));
  assert.equal(savedState.color, savedState.originalColor);
  assert.equal(savedState.hasModificationButton, true, JSON.stringify(savedState));
  assert.equal(savedState.hasResetBeforeOpen, false);
  assert.equal(savedState.hasResetAfterOpen, true);
  assert.ok(savedState.modificationRightDelta > 0, JSON.stringify(savedState));
  assert.ok(savedState.resetCenterDelta < 1, JSON.stringify(savedState));
  assert.equal(savedState.buttonBorderStyle, 'none');
  assert.doesNotMatch(savedState.panelText, /Original|Modified/);
  assert.match(savedState.removedText, /Nephi/);
  assert.match(savedState.addedText, /changed/, JSON.stringify(savedState));
  assert.equal(savedState.savedText, 'I changed this chapter text.');

  await harness.client.send('Page.reload');
  await delay(100);
  await waitFor(harness.client, async () =>
    (await getText(
      harness.client,
      '.chapter-slide:nth-child(2) .verse-text-modified'
    )) === 'I changed this chapter text.'
  );

  const resetState = await evaluate(
    harness.client,
    `(async () => {
      const selector = '.chapter-slide:nth-child(2) .verse-reset-button';
      document.querySelector(
        '.chapter-slide:nth-child(2) .verse-modification-button'
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const resetButton = document.querySelector(selector);
      resetButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const confirmationLabel = document.querySelector(selector)?.getAttribute('aria-label') ?? '';
      const remainsModifiedAfterFirstClick = Boolean(
        document.querySelector('.chapter-slide:nth-child(2) .verse-text-modified')
      );
      document.querySelector(selector)?.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const saved = JSON.parse(localStorage.getItem('open-scriptures:chapter-text:1 Nephi:1') ?? '{}');
      return {
        confirmationLabel,
        remainsModifiedAfterFirstClick,
        remainsModifiedAfterSecondClick: Boolean(
          document.querySelector('.chapter-slide:nth-child(2) .verse-text-modified')
        ),
        restoredText: document.querySelector(
          '.chapter-slide:nth-child(2) .verse-text'
        )?.textContent ?? '',
        savedText: saved['1'] ?? ''
      };
    })()`
  );

  assert.match(resetState.confirmationLabel, /Confirm restoring original text/);
  assert.equal(resetState.remainsModifiedAfterFirstClick, true);
  assert.equal(resetState.remainsModifiedAfterSecondClick, false);
  assert.match(resetState.restoredText, /Nephi/);
  assert.equal(resetState.savedText, '');
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

test('narrowing a note wraps text and fits the resulting height', async (t) => {
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
      const handleBounds = document.querySelector('.note-handle-right').getBoundingClientRect();
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
      const handle = document.querySelector('.note-handle-right');
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
        clientX: ${start.x - 120},
        clientY: ${start.y}
      }));
      chapter.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: ${start.x - 120},
        clientY: ${start.y}
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

  assert(after.width <= start.before.width - 110, JSON.stringify({ start, after }));
  assert(after.height > start.before.height, JSON.stringify({ start, after }));
  assert(after.scrollHeight <= after.clientHeight, JSON.stringify(after));
});

test('note cannot grow wider than its text', async (t) => {
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
      textarea.value = 'wide';
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      textarea.focus();
      const noteBounds = document.querySelector('.chapter-note').getBoundingClientRect();
      const handleBounds = document.querySelector('.note-handle-right').getBoundingClientRect();
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
      const handle = document.querySelector('.note-handle-right');
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
        clientX: ${start.x + 100},
        clientY: ${start.y}
      }));
      chapter.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX: ${start.x + 100},
        clientY: ${start.y}
      }));
    })()`
  );
  await delay(30);

  const after = await evaluate(
    harness.client,
    `(() => {
      const note = document.querySelector('.chapter-note').getBoundingClientRect();
      const noteFont = getComputedStyle(document.querySelector('.chapter-note textarea'));
      return {
        width: note.width,
        height: note.height,
        fontFamily: noteFont.fontFamily,
        fontStyle: noteFont.fontStyle
      };
    })()`
  );

  assert(Math.abs(after.width - start.before.width) < 1, JSON.stringify({ start, after }));
  assert(Math.abs(after.height - start.before.height) < 1, JSON.stringify({ start, after }));
  assert.match(after.fontFamily, /Liberation Serif/);
  assert.equal(after.fontStyle, 'italic');
});

test('rapid note edits are persisted in one batch', async (t) => {
  const harness = await createHarness();
  t.after(async () => {
    await harness.close();
  });

  await waitFor(harness.client, async () => (await getText(harness.client, 'h1')) === '1 Nephi 1');
  const result = await evaluate(
    harness.client,
    `(async () => {
      const chapter = document.querySelector('.chapter-slide:nth-child(2) .chapter-view');
      const bounds = chapter.getBoundingClientRect();
      chapter.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        clientX: bounds.left + 40,
        clientY: bounds.top + chapter.scrollHeight + 80
      }));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const storageKey = 'open-scriptures:notes:1 Nephi:1';
      const originalSetItem = Storage.prototype.setItem;
      let writes = 0;
      Storage.prototype.setItem = function (key, value) {
        if (key === storageKey) writes += 1;
        return originalSetItem.call(this, key, value);
      };

      const textarea = document.querySelector('.chapter-note textarea');
      for (const text of ['f', 'fa', 'fast', 'fast note']) {
        textarea.value = text;
        textarea.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: text
        }));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const immediateWrites = writes;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const savedNotes = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      Storage.prototype.setItem = originalSetItem;
      return {
        immediateWrites,
        settledWrites: writes,
        savedText: savedNotes[0]?.text ?? ''
      };
    })()`
  );

  assert.equal(result.immediateWrites, 0);
  assert.equal(result.settledWrites, 1);
  assert.equal(result.savedText, 'fast note');
});
