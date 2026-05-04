import { randomUUID } from 'node:crypto';

import { dbQuery, ensureDbInitialized } from './sqliteStore.ts';

type MutationResult = { rows: never[]; info?: { changes: number } };

export type CommunityTemplateRow = {
  id: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
  config: Record<string, unknown>;
  approved: boolean;
  created_at: number;
  updated_at: number;
};

type RawRow = {
  id: string;
  name: string;
  description: string;
  author: string;
  tags: string;
  config: string;
  approved: number;
  created_at: number;
  updated_at: number;
};

const parseRow = (row: RawRow): CommunityTemplateRow => ({
  id: row.id,
  name: row.name,
  description: row.description,
  author: row.author,
  tags: JSON.parse(row.tags) as string[],
  config: JSON.parse(row.config) as Record<string, unknown>,
  approved: row.approved === 1,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const listApprovedCommunityTemplates = async (): Promise<CommunityTemplateRow[]> => {
  ensureDbInitialized();
  const result = await dbQuery<RawRow>(
    `SELECT id, name, description, author, tags, config, approved, created_at, updated_at
     FROM community_templates
     WHERE approved = 1
     ORDER BY created_at DESC`,
  );
  return result.rows.map(parseRow);
};

export const listAllCommunityTemplates = async (): Promise<CommunityTemplateRow[]> => {
  ensureDbInitialized();
  const result = await dbQuery<RawRow>(
    `SELECT id, name, description, author, tags, config, approved, created_at, updated_at
     FROM community_templates
     ORDER BY approved DESC, created_at DESC`,
  );
  return result.rows.map(parseRow);
};

type SubmitInput = {
  name: string;
  description: string;
  author: string;
  tags: string[];
  config: Record<string, unknown>;
};

export const submitCommunityTemplate = async (input: SubmitInput): Promise<string> => {
  ensureDbInitialized();
  const id = randomUUID();
  const now = Date.now();
  await dbQuery(
    `INSERT INTO community_templates (id, name, description, author, tags, config, approved, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id,
      input.name,
      input.description,
      input.author,
      JSON.stringify(input.tags),
      JSON.stringify(input.config),
      now,
      now,
    ],
  );
  return id;
};

export const approveCommunityTemplate = async (id: string): Promise<boolean> => {
  ensureDbInitialized();
  const result = await dbQuery(
    `UPDATE community_templates SET approved = 1, updated_at = ? WHERE id = ?`,
    [Date.now(), id],
  );
  return ((result as MutationResult).info?.changes ?? 0) > 0;
};

export const deleteCommunityTemplate = async (id: string): Promise<boolean> => {
  ensureDbInitialized();
  const result = await dbQuery(
    `DELETE FROM community_templates WHERE id = ?`,
    [id],
  );
  return ((result as MutationResult).info?.changes ?? 0) > 0;
};
