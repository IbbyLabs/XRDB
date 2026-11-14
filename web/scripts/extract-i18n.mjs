import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['app', 'components', 'lib'];
const OUT = join(root, 'lib', 'i18n-strings.json');
const CALL = /(?<![\w.$])(?:t|msg|rich)\(\s*/g;
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
  });
}

function readLiteral(src, start) {
  const quote = src[start];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let out = '';
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (c === quote) return { value: out, end: i + 1 };
    if (quote === '`' && c === '$' && src[i + 1] === '{') return null;
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = src[++i];
    if (n === 'u' && src[i + 1] === '{') {
      const close = src.indexOf('}', i);
      out += String.fromCodePoint(parseInt(src.slice(i + 2, close), 16));
      i = close;
    } else if (n === 'u') {
      out += String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16));
      i += 4;
    } else if (n === 'x') {
      out += String.fromCharCode(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (n === '\n') {
      continue;
    } else {
      out += ESCAPES[n] ?? n;
    }
  }
  return null;
}

const strings = new Set();
const dynamic = [];

for (const dir of SOURCE_DIRS) {
  for (const file of walk(join(root, dir))) {
    if (file === join(root, 'lib', 'i18n.ts')) continue;
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(CALL)) {
      const start = match.index + match[0].length;
      const lit = readLiteral(src, start);
      if (lit) {
        strings.add(lit.value);
      } else {
        const line = src.slice(0, start).split('\n').length;
        const arg = src.slice(start, src.indexOf('\n', start)).slice(0, 60);
        dynamic.push(`${relative(root, file)}:${line}  ${arg}`);
      }
    }
  }
}

const sorted = [...strings].sort();
writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${sorted.length} strings to ${relative(root, OUT)}`);
if (dynamic.length > 0) {
  console.log(`${dynamic.length} calls pass a non-literal argument (their text is marked with msg() elsewhere)`);
  if (process.argv.includes('--verbose')) for (const where of dynamic) console.log(`  ${where}`);
}
