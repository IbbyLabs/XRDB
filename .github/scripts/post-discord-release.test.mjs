// Run with: node --test .github/scripts/
//
// These payloads are only ever built inside a workflow, so a mistake here
// surfaces as a release notice that is silently wrong rather than as a failure.
// Both shapes below have happened: a whole block of the changelog dropped
// because it was written into a field that no longer existed, and a payload
// over the components cap because the splitter was sized for an embed.

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDiscordReleasePayloads } from './post-discord-release.mjs';

// What a components message allows across every text display.
const PANEL_TEXT_CAP = 4000;
const ROLE_ID = '123456789012345678';

function changelog(count) {
  const entries = Array.from(
    { length: count },
    (_, i) =>
      `* **ratings:** change number ${i} that does a thing to the renderer ` +
      `(#${1000 + i}) ([abc${i}](https://github.com/IbbyLabs/xrdb/commit/abc${i}))`,
  );
  return `## Features\n\n${entries.join('\n')}\n`;
}

function payloadsFor(count, { discordRoleId = ROLE_ID } = {}) {
  return buildDiscordReleasePayloads({
    repository: 'IbbyLabs/xrdb',
    release: {
      tag_name: 'v3.68.0',
      name: 'v3.68.0',
      body: changelog(count),
      html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v3.68.0',
      published_at: '2026-08-06T01:25:44Z',
    },
    previousReleaseTag: 'v3.67.1',
    discordRoleId,
  });
}

function textLength(node) {
  if (Array.isArray(node)) {
    return node.reduce((total, child) => total + textLength(child), 0);
  }
  if (!node || typeof node !== 'object') {
    return 0;
  }
  let total = typeof node.content === 'string' ? node.content.length : 0;
  total += textLength(node.components);
  total += textLength(node.accessory);
  return total;
}

function walk(node, visit) {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (!node || typeof node !== 'object') {
    return;
  }
  visit(node);
  walk(node.components, visit);
  walk(node.accessory, visit);
}

const SIZES = [1, 5, 20, 60, 100, 160, 240, 400];

test('every changelog entry reaches a payload', () => {
  for (const size of SIZES) {
    const serialised = JSON.stringify(payloadsFor(size));
    const missing = [];
    for (let i = 0; i < size; i += 1) {
      if (!serialised.includes(`change number ${i} `)) {
        missing.push(i);
      }
    }
    assert.deepEqual(missing, [], `${size} entries: ${missing.length} never posted`);
  }
});

test('no payload exceeds the components text cap', () => {
  for (const size of SIZES) {
    payloadsFor(size).forEach((payload, index) => {
      const length = textLength(payload.components);
      assert.ok(
        length <= PANEL_TEXT_CAP,
        `${size} entries, payload ${index}: ${length} characters`,
      );
    });
  }
});

test('a components payload carries no content and no embeds', () => {
  for (const payload of payloadsFor(160)) {
    assert.ok(!('content' in payload), 'content is rejected alongside components');
    assert.ok(!('embeds' in payload), 'an embed survived the conversion');
    assert.equal(payload.flags, 32768);
    assert.equal(payload.components[0].type, 17, 'top level is a container');
  }
});

test('the role is pinged from inside the container and permitted', () => {
  const [summary, ...continuations] = payloadsFor(160);
  assert.match(JSON.stringify(summary.components), new RegExp(`<@&${ROLE_ID}>`));
  assert.deepEqual(summary.allowed_mentions.roles, [ROLE_ID]);
  for (const payload of continuations) {
    assert.ok(
      !JSON.stringify(payload).includes('<@&'),
      'only the first notice pings',
    );
  }
});

test('no release without a role id permits a mention', () => {
  const [summary] = payloadsFor(20, { discordRoleId: '' });
  assert.deepEqual(summary.allowed_mentions, { parse: [] });
  assert.ok(!JSON.stringify(summary).includes('<@&'));
});

test('no heading carries a markdown link', () => {
  // A link inside a heading renders as its literal brackets and URL.
  for (const payload of payloadsFor(160)) {
    walk(payload.components, (node) => {
      if (node.type !== 10) {
        return;
      }
      assert.ok(
        !/^#{1,3} .*\[.*\]\(/.test(String(node.content || '')),
        `heading contains a link: ${node.content}`,
      );
    });
  }
});

test('no text display is empty and no section is overfull', () => {
  for (const payload of payloadsFor(160)) {
    walk(payload.components, (node) => {
      if (node.type === 10) {
        assert.ok(String(node.content || '').trim(), 'empty text display');
      }
      if (node.type === 9) {
        assert.ok((node.components || []).length <= 3, 'section over three displays');
      }
    });
  }
});
