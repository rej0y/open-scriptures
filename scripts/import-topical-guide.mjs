import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const pdfPath = path.resolve(projectRoot, process.argv[2] ?? 'study_helps_topical_guide.pdf');
const databasePath = path.resolve(
  projectRoot,
  process.argv[3] ?? 'src-tauri/resources/scriptures/church-of-jesus-christ-scriptures.db'
);
const pdfToHtml = process.env.PDFTOHTML ?? 'pdftohtml';
const sqlite = process.env.SQLITE3 ?? 'sqlite3';

readFileSync(pdfPath);
readFileSync(databasePath);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    ...options
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}):\n${result.stderr || result.stdout}`);
  }

  return result.stdout;
}

function decodeXml(value) {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&#160;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCodePoint(Number(codePoint)));
}

function textFromXml(value) {
  return decodeXml(value.replace(/<[^>]+>/g, ''));
}

function normalizeInlineText(value) {
  return value
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function normalizeTopicTerm(value) {
  return value
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function normalizeTopicMatchTerm(value) {
  return value
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseTopics(xml) {
  const topics = [];
  let currentTopic;
  const pagePattern = /<page\s+number="(\d+)"[^>]*>([\s\S]*?)<\/page>/g;

  for (const pageMatch of xml.matchAll(pagePattern)) {
    const page = Number(pageMatch[1]);
    const tokens = [];
    const textPattern = /<text\s+top="([\d.]+)"\s+left="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;

    for (const textMatch of pageMatch[2].matchAll(textPattern)) {
      const raw = textMatch[3];
      tokens.push({
        top: Number(textMatch[1]),
        left: Number(textMatch[2]),
        text: textFromXml(raw),
        bold: /<b(?:\s[^>]*)?>/.test(raw)
      });
    }

    for (const column of [0, 1]) {
      const columnTokens = tokens
        .filter((token) => (token.left < 324 ? 0 : 1) === column && token.top > 50)
        .sort((first, second) => first.top - second.top || first.left - second.left);
      const lines = [];

      for (const token of columnTokens) {
        const line = lines.at(-1);
        if (!line || Math.abs(line.top - token.top) > 2) {
          lines.push({ top: token.top, tokens: [token] });
        } else {
          line.tokens.push(token);
          line.tokens.sort((first, second) => first.left - second.left);
        }
      }

      const topicLeft = column === 0 ? 54 : 335;
      for (const line of lines) {
        const headingIndex = line.tokens.findIndex(
          (token) => token.bold && Math.abs(token.left - topicLeft) <= 3
        );

        if (headingIndex >= 0) {
          const headingToken = line.tokens[headingIndex];
          const title = normalizeInlineText(headingToken.text);
          if (!title || title === 'TOPICAL GUIDE') continue;

          const remainder = normalizeInlineText(
            line.tokens
              .slice(headingIndex + 1)
              .map((token) => token.text)
              .join('')
              .replace(/^\.\s*/, '')
          );
          currentTopic = {
            id: topics.length + 1,
            title,
            normalizedTitle: normalizeTopicTerm(title),
            relatedTopics: /^(?:See|See also)\s+/i.test(remainder) ? remainder : '',
            collectingRelatedTopics: /^(?:See|See also)\s+/i.test(remainder),
            sourcePage: page,
            contentLines: []
          };
          topics.push(currentTopic);

          if (remainder && !currentTopic.relatedTopics) {
            currentTopic.contentLines.push(remainder);
          }
          continue;
        }

        if (!currentTopic) continue;
        const text = normalizeInlineText(line.tokens.map((token) => token.text).join(''));
        if (!text) continue;

        const beginsScriptureEntry = line.tokens.some(
          (token) => token.bold && token.left >= topicLeft + 15
        );
        if (currentTopic.collectingRelatedTopics && !beginsScriptureEntry) {
          currentTopic.relatedTopics = normalizeInlineText(
            `${currentTopic.relatedTopics} ${text}`
          );
          continue;
        }

        currentTopic.collectingRelatedTopics = false;
        currentTopic.contentLines.push(text);
      }
    }
  }

  const seenTitles = new Set();
  return topics
    .filter((topic) => {
      const exactTitle = normalizeTopicMatchTerm(topic.title);
      if (seenTitles.has(exactTitle)) return false;
      seenTitles.add(exactTitle);
      return true;
    })
    .map((topic, index) => ({
      ...topic,
      id: index + 1,
      content: topic.contentLines
        .join('\n')
        .replace(/([\p{L}])-\n(?=[\p{Ll}])/gu, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }));
}

function trieForTopicTitles(topics) {
  const matchableTopics = topics
    .filter((topic) => /^[\p{L}\p{N}'’ -]+$/u.test(topic.title) && topic.title.length >= 3)
    .sort((first, second) => second.title.length - first.title.length);
  const root = { children: new Map(), topics: [] };

  for (const topic of matchableTopics) {
    let node = root;
    for (const character of Array.from(topic.normalizedTitle)) {
      let child = node.children.get(character);
      if (!child) {
        child = { children: new Map(), topics: [] };
        node.children.set(character, child);
      }
      node = child;
    }
    node.topics.push(topic);
  }

  return { root, matchableTopics };
}

function normalizedCharacter(value) {
  return value.normalize('NFKC').replace(/[’‘]/g, "'").toLocaleLowerCase('en-US');
}

function isWordCharacter(value) {
  return value !== undefined && /[\p{L}\p{N}]/u.test(value);
}

function createSchemaAndTopics(topics) {
  const statements = [
    'pragma foreign_keys = on;',
    'begin immediate;',
    'drop table if exists verse_topical_guide_links;',
    'drop table if exists topical_guide_terms;',
    'drop table if exists topical_guide_topics;',
    `create table topical_guide_topics (
      id integer primary key,
      title text not null unique,
      normalized_title text not null,
      related_topics text not null default '',
      content text not null default '',
      source_page integer not null
    );`,
    `create table topical_guide_terms (
      id integer primary key,
      topic_id integer not null references topical_guide_topics(id) on delete cascade,
      term text not null,
      normalized_term text not null,
      unique(topic_id, normalized_term)
    );`,
    `create table verse_topical_guide_links (
      verse_id integer not null references verses(id) on delete cascade,
      topic_id integer not null references topical_guide_topics(id) on delete cascade,
      start_offset integer not null,
      end_offset integer not null,
      matched_text text not null,
      primary key (verse_id, topic_id, start_offset, end_offset)
    );`,
    'create index topical_guide_topics_normalized_idx on topical_guide_topics(normalized_title);',
    'create index topical_guide_terms_normalized_idx on topical_guide_terms(normalized_term);',
    'create index verse_topical_guide_links_verse_idx on verse_topical_guide_links(verse_id, start_offset);'
  ];

  for (const topic of topics) {
    statements.push(
      `insert into topical_guide_topics (
        id, title, normalized_title, related_topics, content, source_page
      ) values (
        ${topic.id}, ${sqlString(topic.title)}, ${sqlString(topic.normalizedTitle)},
        ${sqlString(topic.relatedTopics)}, ${sqlString(topic.content)}, ${topic.sourcePage}
      );`,
      `insert into topical_guide_terms (id, topic_id, term, normalized_term)
       values (${topic.id}, ${topic.id}, ${sqlString(topic.title)}, ${sqlString(topic.normalizedTitle)});`
    );
  }

  statements.push('commit;');
  run(sqlite, [databasePath], { input: statements.join('\n') });
}

function createVerseLinks(topics) {
  const verseJson = run(sqlite, [
    '-json',
    databasePath,
    'select id, scripture_text as text from verses order by id'
  ]);
  const verses = JSON.parse(verseJson || '[]');
  const { root, matchableTopics } = trieForTopicTitles(topics);
  let statements = ['pragma foreign_keys = on;', 'begin immediate;'];
  let linkCount = 0;

  function flushLinks() {
    if (statements.length <= 2) return;
    statements.push('commit;');
    run(sqlite, [databasePath], { input: statements.join('\n') });
    statements = ['pragma foreign_keys = on;', 'begin immediate;'];
  }

  for (const verse of verses) {
    const characters = Array.from(verse.text);
    const normalizedCharacters = characters.map(normalizedCharacter);

    for (let startOffset = 0; startOffset < characters.length; startOffset += 1) {
      if (isWordCharacter(normalizedCharacters[startOffset - 1])) continue;

      let node = root;
      let matchedTopic;
      let matchedEndOffset = startOffset;
      for (let endOffset = startOffset; endOffset < characters.length; endOffset += 1) {
        node = node.children.get(normalizedCharacters[endOffset]);
        if (!node) break;

        if (node.topics.length > 0 && !isWordCharacter(normalizedCharacters[endOffset + 1])) {
          const matchedText = characters.slice(startOffset, endOffset + 1).join('');
          const exactTopic = node.topics.find(
            (topic) => normalizeTopicMatchTerm(topic.title) === normalizeTopicMatchTerm(matchedText)
          );
          matchedTopic = exactTopic ?? node.topics[0];
          matchedEndOffset = endOffset + 1;
        }
      }

      if (!matchedTopic) continue;
      const matchedText = characters.slice(startOffset, matchedEndOffset).join('');
      statements.push(
        `insert or ignore into verse_topical_guide_links (
          verse_id, topic_id, start_offset, end_offset, matched_text
        ) values (
          ${verse.id}, ${matchedTopic.id}, ${startOffset}, ${matchedEndOffset}, ${sqlString(matchedText)}
        );`
      );
      linkCount += 1;
      startOffset = matchedEndOffset - 1;

      if (statements.length >= 10_000) flushLinks();
    }
  }

  flushLinks();
  return { linkCount, matchableTopicCount: matchableTopics.length, verseCount: verses.length };
}

let xml = run(pdfToHtml, ['-xml', '-hidden', '-stdout', pdfPath]);
const topics = parseTopics(xml);
xml = '';

if (topics.length < 1000) {
  throw new Error(`Only ${topics.length} topical-guide headings were parsed; refusing to replace database data.`);
}

createSchemaAndTopics(topics);
const result = createVerseLinks(topics);

console.log(
  `Imported ${topics.length} topics (${result.matchableTopicCount} matchable) and ` +
    `${result.linkCount} verse links across ${result.verseCount} verses.`
);
