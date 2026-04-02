import { execFileSync } from 'node:child_process';

const legacyNeedle = String.fromCharCode(101, 114, 100, 98);

const runGit = (args, { allowFailure = false } = {}) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' });
  } catch (error) {
    if (allowFailure && typeof error?.stdout === 'string') {
      return error.stdout;
    }
    throw error;
  }
};

const checks = [
  {
    label: 'working tree text',
    args: ['grep', '-n', '-I', '-i', '-e', legacyNeedle, '--', '.'],
  },
  {
    label: 'reachable commit subjects and bodies',
    args: ['log', '--all', '--format=%H%x09%s%n%b%x00'],
    test: (output) => output.toLowerCase().includes(legacyNeedle),
  },
  {
    label: 'reachable refs and tag messages',
    args: ['for-each-ref', '--format=%(refname)%09%(subject)%09%(contents)', 'refs/tags', 'refs/heads', 'refs/remotes'],
    test: (output) => output.toLowerCase().includes(legacyNeedle),
  },
  {
    label: 'reachable file contents across history',
    args: ['grep', '-n', '-I', '-i', '-e', legacyNeedle, ...runGit(['rev-list', '--all']).trim().split('\n').filter(Boolean)],
  },
  {
    label: 'reachable git object paths',
    args: ['rev-list', '--all', '--objects'],
    test: (output) => output.toLowerCase().includes(legacyNeedle),
  },
];

let failed = false;

for (const check of checks) {
  const output = runGit(check.args, { allowFailure: true });
  const matched = typeof check.test === 'function'
    ? check.test(output)
    : Boolean(String(output || '').trim());

  if (!matched) {
    continue;
  }

  failed = true;
  console.error(`Legacy pre-XRDB naming was found in ${check.label}.`);
  if (String(output || '').trim()) {
    console.error(output.trim());
  }
}

if (failed) {
  process.exit(1);
}

console.log('Verified that legacy pre-XRDB naming is absent from the reachable repository state.');
