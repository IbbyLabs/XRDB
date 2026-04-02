import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDiscordReleasePayload,
  buildDiscordReleasePayloads,
  resolveDiscordWebhookPostUrl,
} from '../.github/scripts/post-discord-release.mjs';

test('buildDiscordReleasePayload creates a branded embed with release links and parsed sections', () => {
  const payload = buildDiscordReleasePayload({
    discordRoleId: '1486091164913238129',
    repository: 'IbbyLabs/xrdb',
    previousReleaseTag: 'v2.30.0',
    release: {
      tag_name: 'v2.31.0',
      name: 'v2.31.0',
      html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.31.0',
      published_at: '2026-03-25T01:05:37Z',
      body: [
        '[!TIP]',
        'Changelog: read the matching entry or browse the full compare.',
        '',
        '## Added',
        '- add optional XRDB request protection',
        '- add XRDB community Discord links',
        '',
        '## Reverted',
        '- revert release 1.0.4',
      ].join('\n'),
    },
  });

  assert.equal(payload.content, '<@&1486091164913238129>');
  assert.deepEqual(payload.allowed_mentions, {
    roles: ['1486091164913238129'],
  });
  assert.equal(payload.username, 'XRDB Releases');
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].color, 0x7c3aed);
  assert.equal(payload.embeds[0].author.name, 'XRDB, eXtended Ratings DataBase');
  assert.equal(payload.embeds[0].title, 'v2.31.0');
  assert.match(payload.embeds[0].description, /v2\.31\.0/);

  const fields = payload.embeds[0].fields;
  assert.equal(fields[0].name, 'Tag');
  assert.equal(fields[0].value, '`v2.31.0`');
  assert.equal(fields[2].name, 'Links');
  assert.match(fields[2].value, /Release notes/);
  assert.match(fields[2].value, /Full compare/);
  assert.match(fields[2].value, /Container package/);

  const addedField = fields.find((field) => field.name === 'Added');
  assert.ok(addedField);
  assert.match(addedField.value, /optional XRDB request protection/);

  const revertedField = fields.find((field) => field.name === 'Reverted');
  assert.ok(revertedField);
  assert.match(revertedField.value, /revert release 1\.0\.4/);
});

test('buildDiscordReleasePayload keeps mentions disabled when no role id is configured', () => {
  const payload = buildDiscordReleasePayload({
    repository: 'IbbyLabs/xrdb',
    previousReleaseTag: 'v2.30.0',
    release: {
      tag_name: 'v2.31.0',
      name: 'v2.31.0',
      html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.31.0',
      published_at: '2026-03-25T01:05:37Z',
      body: '## Added\n- add XRDB community Discord links',
    },
  });

  assert.equal(payload.content, undefined);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test('resolveDiscordWebhookPostUrl preserves thread params and forces wait mode', () => {
  const resolved = resolveDiscordWebhookPostUrl(
    'https://discord.com/api/webhooks/123/token?thread_id=456&wait=false',
  );
  const url = new URL(resolved);

  assert.equal(url.searchParams.get('thread_id'), '456');
  assert.equal(url.searchParams.get('wait'), 'true');
});

test('buildDiscordReleasePayload orders sections and tracked items for Discord summaries', () => {
  const payload = buildDiscordReleasePayload({
    repository: 'IbbyLabs/xrdb',
    previousReleaseTag: 'v2.30.0',
    release: {
      tag_name: 'v2.31.0',
      name: 'v2.31.0',
      html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.31.0',
      published_at: '2026-03-25T01:05:37Z',
      body: [
        '## Documentation',
        '* FR 9 align docs',
        '  nested doc detail',
        '',
        '## Fixed',
        '* align episode provider rating inputs',
        '* FR 21 normalize Bottom Row copy',
        '  nested fix detail',
        '* BUG 32 use episode ratings for thumbnails',
        '  more nested fix detail',
        '',
        '## Added',
        '* add release automation guard',
        '* FR 19 add Allocine provider support',
        '  nested feature detail',
        '* FR 17 add OMDb poster source support',
      ].join('\n'),
    },
  });

  const sectionFields = payload.embeds[0].fields.slice(3);
  assert.deepEqual(sectionFields.map((field) => field.name), ['Added', 'Fixed', 'Documentation']);
  assert.equal(
    sectionFields[0].value,
    [
      '• FR 17 add OMDb poster source support',
      '• FR 19 add Allocine provider support',
      '• add release automation guard',
    ].join('\n'),
  );
  assert.equal(
    sectionFields[1].value,
    [
      '• BUG 32 use episode ratings for thumbnails',
      '• FR 21 normalize Bottom Row copy',
      '• align episode provider rating inputs',
    ].join('\n'),
  );
  assert.equal(sectionFields[2].value, '• FR 9 align docs');
  assert.doesNotMatch(sectionFields[0].value, /nested feature detail/);
  assert.doesNotMatch(sectionFields[1].value, /nested fix detail|more nested fix detail/);
});

test('buildDiscordReleasePayloads keeps detailed items grouped in ordered continuation embeds', () => {
  const payloads = buildDiscordReleasePayloads({
    repository: 'IbbyLabs/xrdb',
    previousReleaseTag: 'v2.30.0',
    release: {
      tag_name: 'v2.31.0',
      name: 'v2.31.0',
      html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.31.0',
      published_at: '2026-03-25T01:05:37Z',
      body: [
        '## Documentation',
        '* FR 9 align docs',
        '  update the public docs',
        '',
        '## Fixed',
        '* align episode provider rating inputs',
        '  add the missing episode field',
        '* FR 21 normalize Bottom Row copy',
        '  capitalize the Bottom Row label',
        '* BUG 32 use episode ratings for thumbnails',
        '  default thumbnails back to episode data',
        '  • add regression coverage',
        '',
        '## Added',
        '* add release automation guard',
        '  keep release notes generation stable',
        '* FR 19 add Allocine provider support',
        '  add provider metadata and brand assets',
        '* FR 17 add OMDb poster source support',
        '  add OMDb poster source handling',
        '  • wire OMDb through exports',
      ].join('\n'),
    },
  });

  assert.equal(payloads.length, 3);
  assert.ok(payloads[0].embeds[0].description.startsWith('**Added**'));
  assert.deepEqual(
    payloads[0].embeds[0].fields.map((field) => field.name),
    ['Tag', 'Published', 'Links'],
  );

  const orderedDescriptions = payloads.map((payload) => payload.embeds[0].description);
  assert.ok(orderedDescriptions[1].startsWith('**Fixed**'));
  assert.ok(orderedDescriptions[2].startsWith('**Documentation**'));

  assert.match(
    orderedDescriptions[0],
    /• FR 17 add OMDb poster source support[\s\S]*add OMDb poster source handling[\s\S]*wire OMDb through exports[\s\S]*• FR 19 add Allocine provider support[\s\S]*• add release automation guard/,
  );
  assert.match(
    orderedDescriptions[1],
    /• BUG 32 use episode ratings for thumbnails[\s\S]*default thumbnails back to episode data[\s\S]*add regression coverage[\s\S]*• FR 21 normalize Bottom Row copy[\s\S]*• align episode provider rating inputs/,
  );
  assert.match(orderedDescriptions[2], /• FR 9 align docs[\s\S]*update the public docs/);
});

test('buildDiscordReleasePayloads sends continuation messages without repeated mentions', () => {
  const longAddedSection = Array.from(
    { length: 18 },
    (_, index) => `- FR ${index + 1} add item ${index + 1} ${'x'.repeat(80)}`,
  );
  const longFixedSection = Array.from(
    { length: 18 },
    (_, index) => `- BUG ${index + 1} fix item ${index + 1} ${'x'.repeat(90)}`,
  );
  const body = [
    '## Added',
    ...longAddedSection,
    '',
    '## Fixed',
    ...longFixedSection,
    '',
    '## Changed',
    '- tune discord release summary packing',
    '',
    '## Security',
    '- tighten webhook follow up mention handling',
  ].join('\n');

  const payloads = buildDiscordReleasePayloads({
    discordRoleId: '1486091164913238129',
    repository: 'IbbyLabs/xrdb',
    previousReleaseTag: 'v2.30.0',
    release: {
      tag_name: 'v2.31.0',
      name: 'v2.31.0',
      html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.31.0',
      published_at: '2026-03-25T01:05:37Z',
      body,
    },
  });

  assert.ok(payloads.length > 1);
  assert.equal(payloads[0].content, '<@&1486091164913238129>');
  assert.deepEqual(payloads[0].allowed_mentions, {
    roles: ['1486091164913238129'],
  });

  assert.ok(payloads[0].embeds[0].description.startsWith('**Added**'));
  assert.match(payloads[0].embeds[0].description, /FR 1 add item 1/);

  for (const payload of payloads.slice(1)) {
    assert.equal(payload.content, undefined);
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
  }

  assert.match(payloads[1].embeds[0].title, /^v2\.31\.0 release notes continued/);

  const orderedDescriptions = payloads.map((payload) => payload.embeds[0].description);
  assert.match(orderedDescriptions.join('\n\n'), /\*\*Security\*\*/);
  assert.match(orderedDescriptions.join('\n\n'), /add item 18/);
  assert.match(orderedDescriptions.join('\n\n'), /fix item 18/);
  assert.doesNotMatch(orderedDescriptions.join('\n\n'), /<@&1486091164913238129>/);
  assert.ok(orderedDescriptions[0].startsWith('**Added**'));
  assert.ok(orderedDescriptions.some((description) => description.startsWith('**Fixed**')));
  assert.ok(orderedDescriptions.at(-1)?.startsWith('**Security**'));

  for (const description of orderedDescriptions) {
    const sectionHeadings = description.match(/\*\*[^*]+\*\*/g) || [];
    assert.equal(sectionHeadings.length, 1);
  }
});
