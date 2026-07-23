import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SYNCABLE_GLOBAL_KEYS } from '../lib/crossTypeSync.ts';

const MEDIA_TYPES = ['Poster', 'Backdrop', 'Thumbnail', 'Logo'];

const workspaceStateSource = await readFile(
  new URL('../lib/useConfiguratorWorkspaceState.ts', import.meta.url),
  'utf8',
);

const readSetterBody = (key) => {
  const setterName = `set${key[0].toUpperCase()}${key.slice(1)}`;
  const start = workspaceStateSource.indexOf(`const ${setterName} = useCallback(`);
  assert.notEqual(start, -1, `${setterName} is missing from the configurator workspace state`);
  const end = workspaceStateSource.indexOf('\n  }, [', start);
  assert.notEqual(end, -1, `${setterName} does not close with a dependency list`);
  return { setterName, body: workspaceStateSource.slice(start, end) };
};

// These options persist as one shared field but are stored per media type in the
// workspace. A setter that writes only the active type loses the saved value for
// every other type on the next load, which silently reverts the option.
test('shared option setters keep every media type in lockstep', () => {
  for (const key of SYNCABLE_GLOBAL_KEYS) {
    const { setterName, body } = readSetterBody(key);

    for (const mediaType of MEDIA_TYPES) {
      const perTypeSetter = `set${mediaType}${key[0].toUpperCase()}${key.slice(1)}`;
      assert.equal(
        body.includes(`${perTypeSetter}(`),
        true,
        `${setterName} must write ${perTypeSetter} so the shared value survives a reload`,
      );
    }

    assert.equal(
      body.includes('previewType'),
      false,
      `${setterName} must not scope writes to the active preview type`,
    );
  }
});
