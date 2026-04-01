import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDiscordReleasePayload,
  buildDiscordReleasePayloads,
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

test('buildDiscordReleasePayloads sends continuation messages without repeated mentions', () => {
  const longFixedSection = Array.from(
    { length: 18 },
    (_, index) => `- fix item ${index + 1} ${'x'.repeat(90)}`,
  );
  const body = [
    '## Fixed',
    ...longFixedSection,
    '',
    '## Added',
    '- add release automation guard',
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

  const fixedField = payloads[0].embeds[0].fields.find((field) => field.name === 'Fixed');
  assert.ok(fixedField);
  assert.match(fixedField.value, /\u2026$/);

  for (const payload of payloads.slice(1)) {
    assert.equal(payload.content, undefined);
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
  }

  assert.equal(payloads[1].embeds[0].title, 'v2.31.0 release notes continued');

  const continuationText = payloads
    .slice(1)
    .map((payload) => payload.embeds[0].description)
    .join('\n\n');

  assert.match(continuationText, /\*\*Security\*\*/);
  assert.match(continuationText, /fix item 18/);
  assert.doesNotMatch(continuationText, /<@&1486091164913238129>/);
});
