import { execSync } from 'node:child_process';

export const DISPLAY_COMMIT_TYPES = new Set([
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'style',
  'revert',
]);

const CONVENTIONAL_SUBJECT_RE = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i;
const changedFilesCache = new Map();

const areaRule = (matcher, config) => ({
  matcher,
  ...config,
});

const AREA_RULES = [
  areaRule((file) => file === 'README.md', {
    label: 'README guide',
    type: 'docs',
    titles: {
      update: 'refresh README guide',
      add: 'add README guide',
      remove: 'remove README guide',
    },
  }),
  areaRule((file) => file === 'CHANGELOG.md', {
    label: 'changelog',
    type: 'docs',
    titles: {
      update: 'refresh changelog',
      add: 'add changelog',
      remove: 'remove changelog',
    },
  }),
  areaRule((file) => /^\.github\/workflows\//.test(file), {
    label: 'GitHub workflows',
    type: 'ci',
    titles: {
      update: 'update GitHub workflows',
      add: 'add GitHub workflows',
      remove: 'remove GitHub workflows',
    },
  }),
  areaRule((file) => /(?:^|\/)[^/]+\.mp4$/i.test(file), {
    label: 'demo videos',
    type: 'style',
    titles: {
      update: 'refresh demo videos',
      add: 'add demo videos',
      remove: 'remove demo videos',
    },
  }),
  areaRule((file) => /^(Dockerfile|compose\.yaml|local-compose\.yaml)$/.test(file), {
    label: 'deployment setup',
    type: 'build',
    titles: {
      update: 'update deployment setup',
      add: 'add deployment setup',
      remove: 'remove deployment setup',
    },
  }),
  areaRule(
    (file) =>
      file === 'app/page.tsx'
      || file === 'components/home-page-view.tsx'
      || file === 'app/layout.tsx',
    {
      label: 'homepage and configurator',
      type: 'feat',
      titles: {
        update: 'update homepage and configurator',
        add: 'add homepage and configurator support',
        remove: 'remove homepage and configurator support',
      },
    }
  ),
  areaRule((file) => /^app\/styles\/xrdb-.*\.css$/.test(file), {
    label: 'homepage and configurator',
    type: 'feat',
    titles: {
      update: 'update homepage and configurator',
      add: 'add homepage and configurator support',
      remove: 'remove homepage and configurator support',
    },
  }),
  areaRule(
    (file) =>
      file === 'app/proxy/[...path]/route.ts'
      || file === 'app/proxy/manifest.json/route.ts'
      || file === 'lib/proxyConfigBridge.ts'
      || file === 'lib/proxyMetaTranslation.ts',
    {
      label: 'addon proxy',
      type: 'fix',
      titles: {
        update: 'update addon proxy handling',
        add: 'add addon proxy support',
        remove: 'remove addon proxy handling',
      },
    }
  ),
  areaRule((file) => file === 'app/[type]/[id]/route.tsx', {
    label: 'image rendering route',
    type: 'fix',
    titles: {
      update: 'update image rendering route',
      add: 'add image rendering route',
      remove: 'remove image rendering route',
    },
  }),
  areaRule(
    (file) =>
      /^lib\/(imageObjectStorage|metadataStore|imdbDatasetScheduler|sqliteStore|ratingProviderCatalog|ratingAppearance|posterLayoutOptions|backdropLayoutOptions|metadataTranslation|uiConfig|imdbDatasetLookup|cacheControlTtl)\.ts$/.test(file)
      || /^scripts\/(imdb-dataset-import|verify-proxy-metadata-translation)\.mjs?$/.test(file),
    {
      label: 'rendering and data pipeline',
      type: 'fix',
      titles: {
        update: 'update rendering and data pipeline',
        add: 'add rendering and data pipeline support',
        remove: 'remove rendering and data pipeline support',
      },
    }
  ),
  areaRule((file) => /^tests?\//.test(file), {
    label: 'test coverage',
    type: 'test',
    titles: {
      update: 'update test coverage',
      add: 'add test coverage',
      remove: 'remove test coverage',
    },
  }),
  areaRule(
    (file) =>
      /^(next\.config\.ts|tsconfig\.json|eslint\.config\.mjs|package\.json|package-lock\.json|pnpm-lock\.yaml|next-env\.d\.ts|config\/env\.template)$/.test(file),
    {
      label: 'project tooling',
      type: 'build',
      titles: {
        update: 'update project tooling',
        add: 'add project tooling',
        remove: 'remove project tooling',
      },
    }
  ),
  areaRule((file) => /^public\//.test(file), {
    label: 'site assets',
    type: 'style',
    titles: {
      update: 'refresh site assets',
      add: 'add site assets',
      remove: 'remove site assets',
    },
  }),
];

function normalizeType(type, fallback = 'chore') {
  const normalized = String(type || '').trim().toLowerCase();
  if (DISPLAY_COMMIT_TYPES.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeBody(body) {
  const normalized = normalizeLegacyProjectName(String(body || ''))
    .replace(/\\n/g, '\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n');
  return normalized || null;
}

const LEGACY_PROJECT_LOWER = ['e', 'r', 'd', 'b'].join('');
const LEGACY_PROJECT_MIXED = `${LEGACY_PROJECT_LOWER[0].toUpperCase()}${LEGACY_PROJECT_LOWER.slice(1)}`;
const LEGACY_PROJECT_UPPER = LEGACY_PROJECT_LOWER.toUpperCase();

function normalizeLegacyProjectName(text) {
  return String(text || '')
    .replace(new RegExp(LEGACY_PROJECT_UPPER, 'g'), 'XRDB')
    .replace(new RegExp(LEGACY_PROJECT_MIXED, 'g'), 'Xrdb')
    .replace(new RegExp(LEGACY_PROJECT_LOWER, 'g'), 'xrdb');
}

function removeUserFacingHyphens(text) {
  let normalized = String(text || '');
  if (!normalized) {
    return normalized;
  }

  const preservedTerms = [];
  normalized = normalized.replace(/\b(?:BUG|FR)-\d+\b/gi, (match) => {
    const token = `__XRDB_PRESERVE_${preservedTerms.length}__`;
    preservedTerms.push(match);
    return token;
  });

  normalized = normalized
    .replace(/^[ \t]*-\s+/gm, '• ')
    .replace(/\s-\s/g, ', ')
    .replace(/\s--\s/g, ' ')
    .replace(/\b(\d+)-(\d+)\b/g, '$1 to $2')
    .replace(/--([A-Za-z0-9][A-Za-z0-9-]*)/g, '$1');

  let previous = '';
  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(/([A-Za-z0-9])\-([A-Za-z0-9])/g, '$1 $2');
  }

  return normalized
    .replace(/__XRDB_PRESERVE_(\d+)__/g, (_, index) => preservedTerms[Number(index)] || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeDisplayBody(body) {
  const sanitized = removeUserFacingHyphens(body || '');
  return sanitized || null;
}

function parseConventionalSubject(subject) {
  const match = String(subject || '').trim().match(CONVENTIONAL_SUBJECT_RE);
  if (!match) {
    return null;
  }

  return {
    type: normalizeType(match[1]),
    title: match[4].trim(),
  };
}

function normalizeRevertTitle(title) {
  const normalized = String(title || '').trim();
  if (!normalized) {
    return 'revert project update';
  }

  const quotedMatch = normalized.match(/^["'](.+)["']$/);
  const innerTitle = quotedMatch ? quotedMatch[1].trim() : normalized;
  const parsedInner = parseConventionalSubject(innerTitle);
  const displayTitle = parsedInner?.title || innerTitle.replace(/^revert\s+/i, '').trim();

  return `revert ${displayTitle || 'project update'}`.trim();
}

function inferAreaFromFile(file) {
  for (const rule of AREA_RULES) {
    if (rule.matcher(file)) {
      return rule;
    }
  }

  return {
    label: 'project internals',
    type: 'chore',
    titles: {
      update: 'update project internals',
      add: 'add project internals',
      remove: 'remove project internals',
    },
  };
}

function buildAreaSummary(files) {
  const areaMap = new Map();

  for (const file of files) {
    const normalizedFile = String(file || '').trim();
    if (!normalizedFile) {
      continue;
    }

    const area = inferAreaFromFile(normalizedFile);
    const existing = areaMap.get(area.label);
    if (existing) {
      existing.count += 1;
      continue;
    }

    areaMap.set(area.label, {
      ...area,
      count: 1,
    });
  }

  const areas = [...areaMap.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });

  return {
    areas,
    labels: areas.map((area) => area.label),
    primary: areas[0] ?? null,
    secondary: areas[1] ?? null,
  };
}

function listLabels(labels) {
  if (labels.length === 0) {
    return 'project files';
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

function inferGenericAction(subject) {
  const normalized = String(subject || '').trim();

  if (!normalized || normalized === '.') {
    return 'update';
  }

  if (/^update\b/i.test(normalized)) {
    return 'update';
  }

  if (/^delete\b/i.test(normalized)) {
    return 'remove';
  }

  if (/^add files via upload$/i.test(normalized)) {
    return 'add';
  }

  return null;
}

function buildGenericTitle(action, summary) {
  if (summary.primary && (!summary.secondary || summary.primary.count > summary.secondary.count)) {
    return summary.primary.titles[action];
  }

  if (action === 'add') {
    return 'add project files';
  }

  if (action === 'remove') {
    return 'remove project files';
  }

  return 'update multiple project areas';
}

function buildGenericBody(action, summary) {
  if (summary.labels.length <= 1) {
    return null;
  }

  const listedAreas = listLabels(summary.labels.slice(0, 3));
  if (action === 'add') {
    return `Adds ${listedAreas}.`;
  }

  if (action === 'remove') {
    return `Removes ${listedAreas}.`;
  }

  return `Touches ${listedAreas}.`;
}

function isLowSignalTitle(title) {
  const normalized = String(title || '').trim();
  return /^(update|delete|remove)\s+[^ ]+(?:\s+\([^)]*\))?$/i.test(normalized)
    || /^add\s+[^ ]+\.[A-Za-z0-9]+(?:\s+\([^)]*\))?$/i.test(normalized);
}

export function listChangedFiles(hash) {
  const normalizedHash = String(hash || '').trim();
  if (!normalizedHash) {
    return [];
  }

  if (changedFilesCache.has(normalizedHash)) {
    return changedFilesCache.get(normalizedHash);
  }

  const output = execSync(`git show --pretty=format: --name-only --no-renames ${normalizedHash}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const files = output
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);

  changedFilesCache.set(normalizedHash, files);
  return files;
}

export function normalizeCommitForDisplay(commit) {
  const hash = String(commit.hash || '').trim();
  const subject = normalizeLegacyProjectName(String(commit.subject || '').trim());
  const body = normalizeBody(commit.body);
  const files = Array.isArray(commit.files) && commit.files.length > 0
    ? commit.files.map((file) => String(file || '').trim()).filter(Boolean)
    : listChangedFiles(hash);

  const conventional = parseConventionalSubject(subject);
  if (conventional) {
    const conventionalTitle = conventional.type === 'revert'
      ? normalizeRevertTitle(conventional.title)
      : isLowSignalTitle(conventional.title)
        ? buildGenericTitle(inferGenericAction(conventional.title) || 'update', buildAreaSummary(files))
        : conventional.title;

    if (/^(?:merge upstream\/main(?:.*)?|synchroni[sz]e with upstream\/main(?:.*)?)$/i.test(conventional.title)) {
      return {
        type: conventional.type,
        title: removeUserFacingHyphens('sync upstream changes'),
        body: sanitizeDisplayBody(body),
        files,
      };
    }

    if (/^merge pull request #\d+\s+from\s+/i.test(conventional.title)) {
      return {
        type: conventional.type,
        title: removeUserFacingHyphens('merge contributor changes'),
        body: sanitizeDisplayBody(body),
        files,
      };
    }

    return {
      type: conventional.type,
      title: removeUserFacingHyphens(conventionalTitle),
      body: sanitizeDisplayBody(body),
      files,
    };
  }

  if (/^initial commit$/i.test(subject)) {
    return {
      type: 'chore',
      title: removeUserFacingHyphens('bootstrap XRDB project'),
      body: sanitizeDisplayBody(body),
      files,
    };
  }

  const revertMatch = subject.match(/^revert\s+["'](.+)["']$/i);
  if (revertMatch) {
    return {
      type: 'revert',
      title: removeUserFacingHyphens(normalizeRevertTitle(revertMatch[1])),
      body: sanitizeDisplayBody(body),
      files,
    };
  }

  if (/^merge pull request #\d+\s+from\s+/i.test(subject)) {
    return {
      type: 'chore',
      title: removeUserFacingHyphens('merge contributor changes'),
      body: sanitizeDisplayBody(body),
      files,
    };
  }

  if (/^proxy any addon$/i.test(subject)) {
    return {
      type: 'feat',
      title: removeUserFacingHyphens('add addon proxy support'),
      body: sanitizeDisplayBody(body),
      files,
    };
  }

  const genericAction = inferGenericAction(subject);
  if (genericAction) {
    const summary = buildAreaSummary(files);
    const inferredType = summary.primary?.type || (genericAction === 'add' ? 'feat' : 'chore');

    return {
      type: normalizeType(inferredType),
      title: removeUserFacingHyphens(buildGenericTitle(genericAction, summary)),
      body: sanitizeDisplayBody(body || buildGenericBody(genericAction, summary)),
      files,
    };
  }

  return {
    type: 'chore',
    title: removeUserFacingHyphens(subject || 'project update'),
    body: sanitizeDisplayBody(body),
    files,
  };
}
