import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, renderRich, DICTIONARIES } from '../../lib/i18n.ts';

test('returns the English text unchanged when no dictionary entry exists', () => {
  assert.equal(translate('en', 'Open Configurator'), 'Open Configurator');
  assert.equal(translate('xx', 'Open Configurator'), 'Open Configurator');
});

test('fills {name} placeholders from vars', () => {
  assert.equal(translate('en', '{n} options for {name}', { n: 3, name: 'poster' }), '3 options for poster');
  assert.equal(translate('en', '{n} and {n}', { n: 0 }), '0 and 0');
});

test('leaves unknown placeholders in place', () => {
  assert.equal(translate('en', 'Hello {who}', {}), 'Hello {who}');
  assert.equal(translate('en', 'Hello {who}', { other: 1 }), 'Hello {who}');
});

test('uses the dictionary entry and still fills placeholders', () => {
  DICTIONARIES.test = { 'Save {n}': 'Guardar {n}' };
  try {
    assert.equal(translate('test', 'Save {n}', { n: 2 }), 'Guardar 2');
    assert.equal(translate('test', 'Missing {n}', { n: 2 }), 'Missing 2');
  } finally {
    delete DICTIONARIES.test;
  }
});

test('renderRich swaps tagged spans and keeps the text around them', () => {
  const out = renderRich('Use <b>this</b> or <x>that</x>.', { b: c => `[${c}]` });
  assert.equal(out.length, 5);
  assert.equal(out[0], 'Use ');
  assert.equal(out[1].props.children, '[this]');
  assert.equal(out[3].props.children, '<x>that</x>');
  assert.equal(out[4], '.');
});

test('does not treat vars values as templates', () => {
  assert.equal(translate('en', 'A {x}', { x: '{y}' }), 'A {y}');
});
