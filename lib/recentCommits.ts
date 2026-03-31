export type RecentCommitType =
  | 'feat'
  | 'fix'
  | 'chore'
  | 'refactor'
  | 'perf'
  | 'test'
  | 'build'
  | 'ci'
  | 'style'
  | 'revert';

export type RecentCommit = {
  hash: string;
  shortHash: string;
  date: string;
  type: RecentCommitType;
  title: string;
  body: string | null;
  isImported: boolean;
};

export const COMMIT_FEED_URL = '/commits.json';
export const LATEST_RELEASE_FEED_URL = '/api/latest-release';
export const COMMIT_PAGE_SIZE = 5;

const PUBLIC_RECENT_COMMIT_TYPES = new Set<RecentCommitType>(['feat', 'fix', 'perf', 'build', 'revert']);

export function isPublicRecentCommit(commit: RecentCommit) {
  if (commit.type === 'chore') {
    return /^release\b/i.test(commit.title);
  }

  return PUBLIC_RECENT_COMMIT_TYPES.has(commit.type);
}
