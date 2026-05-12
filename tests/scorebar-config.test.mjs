import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SCOREBAR_HIGH_COLOR,
  DEFAULT_SCOREBAR_HIGH_THRESHOLD,
  DEFAULT_SCOREBAR_LOW_COLOR,
  DEFAULT_SCOREBAR_LOW_THRESHOLD,
  DEFAULT_SCOREBAR_MID_COLOR,
  DEFAULT_SCOREBAR_STYLE,
  getScorebarThresholdColor,
  normalizeScorebarColor,
  normalizeScorebarStyle,
  normalizeScorebarThreshold,
  parseScorebarProgressPercent,
} from '../lib/scorebarConfig.ts';

test('normalizeScorebarStyle returns valid style values', () => {
  assert.equal(normalizeScorebarStyle('solid'), 'solid');
  assert.equal(normalizeScorebarStyle('gradient'), 'gradient');
  assert.equal(normalizeScorebarStyle('progress'), 'progress');
  assert.equal(normalizeScorebarStyle('GRADIENT'), 'gradient');
  assert.equal(normalizeScorebarStyle(' solid '), 'solid');
});

test('normalizeScorebarStyle falls back to default for invalid values', () => {
  assert.equal(normalizeScorebarStyle('unknown'), DEFAULT_SCOREBAR_STYLE);
  assert.equal(normalizeScorebarStyle(null), DEFAULT_SCOREBAR_STYLE);
  assert.equal(normalizeScorebarStyle(undefined), DEFAULT_SCOREBAR_STYLE);
  assert.equal(normalizeScorebarStyle(42), DEFAULT_SCOREBAR_STYLE);
  assert.equal(normalizeScorebarStyle(''), DEFAULT_SCOREBAR_STYLE);
});

test('normalizeScorebarStyle accepts an explicit fallback', () => {
  assert.equal(normalizeScorebarStyle('bad', 'solid'), 'solid');
  assert.equal(normalizeScorebarStyle(null, 'gradient'), 'gradient');
});

test('normalizeScorebarColor accepts valid hex strings', () => {
  assert.equal(normalizeScorebarColor('#e05252', DEFAULT_SCOREBAR_LOW_COLOR), '#e05252');
  assert.equal(normalizeScorebarColor('#fff', DEFAULT_SCOREBAR_MID_COLOR), '#fff');
  assert.equal(normalizeScorebarColor('#aabbcc', DEFAULT_SCOREBAR_HIGH_COLOR), '#aabbcc');
  assert.equal(normalizeScorebarColor('e05252', DEFAULT_SCOREBAR_LOW_COLOR), '#e05252');
});

test('normalizeScorebarColor falls back for invalid values', () => {
  assert.equal(normalizeScorebarColor('not-a-color', DEFAULT_SCOREBAR_LOW_COLOR), DEFAULT_SCOREBAR_LOW_COLOR);
  assert.equal(normalizeScorebarColor(null, DEFAULT_SCOREBAR_MID_COLOR), DEFAULT_SCOREBAR_MID_COLOR);
  assert.equal(normalizeScorebarColor(undefined, DEFAULT_SCOREBAR_HIGH_COLOR), DEFAULT_SCOREBAR_HIGH_COLOR);
  assert.equal(normalizeScorebarColor('', DEFAULT_SCOREBAR_LOW_COLOR), DEFAULT_SCOREBAR_LOW_COLOR);
});

test('normalizeScorebarThreshold clamps to 0–100', () => {
  assert.equal(normalizeScorebarThreshold(50, DEFAULT_SCOREBAR_LOW_THRESHOLD), 50);
  assert.equal(normalizeScorebarThreshold(0, DEFAULT_SCOREBAR_LOW_THRESHOLD), 0);
  assert.equal(normalizeScorebarThreshold(100, DEFAULT_SCOREBAR_HIGH_THRESHOLD), 100);
  assert.equal(normalizeScorebarThreshold(-5, DEFAULT_SCOREBAR_LOW_THRESHOLD), 0);
  assert.equal(normalizeScorebarThreshold(150, DEFAULT_SCOREBAR_HIGH_THRESHOLD), 100);
  assert.equal(normalizeScorebarThreshold(50.7, DEFAULT_SCOREBAR_LOW_THRESHOLD), 51);
  assert.equal(normalizeScorebarThreshold('75', DEFAULT_SCOREBAR_LOW_THRESHOLD), 75);
});

test('normalizeScorebarThreshold falls back for invalid values', () => {
  assert.equal(normalizeScorebarThreshold(null, DEFAULT_SCOREBAR_LOW_THRESHOLD), DEFAULT_SCOREBAR_LOW_THRESHOLD);
  assert.equal(normalizeScorebarThreshold(undefined, DEFAULT_SCOREBAR_HIGH_THRESHOLD), DEFAULT_SCOREBAR_HIGH_THRESHOLD);
  assert.equal(normalizeScorebarThreshold('bad', 42), 42);
  assert.equal(normalizeScorebarThreshold(NaN, 10), 10);
  assert.equal(normalizeScorebarThreshold(Infinity, 10), 10);
});

test('getScorebarThresholdColor resolves low mid and high bands correctly', () => {
  const config = {
    style: /** @type {const} */ ('progress'),
    lowColor: '#ff0000',
    midColor: '#ffaa00',
    highColor: '#00ff00',
    lowThreshold: 50,
    highThreshold: 75,
  };

  assert.equal(getScorebarThresholdColor(0, config), '#ff0000');
  assert.equal(getScorebarThresholdColor(49, config), '#ff0000');
  assert.equal(getScorebarThresholdColor(50, config), '#ffaa00');
  assert.equal(getScorebarThresholdColor(74, config), '#ffaa00');
  assert.equal(getScorebarThresholdColor(75, config), '#00ff00');
  assert.equal(getScorebarThresholdColor(100, config), '#00ff00');
});

test('getScorebarThresholdColor returns mid color for null score', () => {
  const config = {
    style: /** @type {const} */ ('solid'),
    lowColor: '#ff0000',
    midColor: '#ffaa00',
    highColor: '#00ff00',
    lowThreshold: 50,
    highThreshold: 75,
  };

  assert.equal(getScorebarThresholdColor(null, config), '#ffaa00');
});

test('parseScorebarProgressPercent parses percent strings', () => {
  assert.equal(parseScorebarProgressPercent('80%'), 80);
  assert.equal(parseScorebarProgressPercent('100%'), 100);
  assert.equal(parseScorebarProgressPercent('0%'), 0);
  assert.equal(parseScorebarProgressPercent('120%'), 100);
});

test('parseScorebarProgressPercent scales 0–10 values to 0–100', () => {
  assert.equal(parseScorebarProgressPercent('7.5'), 75);
  assert.equal(parseScorebarProgressPercent('10'), 100);
  assert.equal(parseScorebarProgressPercent('0'), 0);
});

test('parseScorebarProgressPercent handles values above 10 as raw percent', () => {
  assert.equal(parseScorebarProgressPercent('85'), 85);
  assert.equal(parseScorebarProgressPercent('150'), 100);
});

test('parseScorebarProgressPercent returns null for invalid input', () => {
  assert.equal(parseScorebarProgressPercent('bad'), null);
  assert.equal(parseScorebarProgressPercent('-5'), null);
});
