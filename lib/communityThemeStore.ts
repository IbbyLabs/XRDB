import { randomUUID } from 'node:crypto';

import { dbQuery, ensureDbInitialized } from './sqliteStore.ts';
import { type XRDBPalette, validatePalette, PRESETS_V2 } from './theme.ts';

type MutationResult = { rows: never[]; info?: { changes: number } };

export type ThemeStatus = 'pending' | 'approved' | 'denied';

export type CommunityThemeRow = {
  id: string;
  name: string;
  author: string | null;
  palette: XRDBPalette;
  status: ThemeStatus;
  submitted_at: number;
  reviewed_at: number | null;
  admin_note: string | null;
};

type RawRow = {
  id: string;
  name: string;
  author: string | null;
  palette_json: string;
  status: string;
  submitted_at: number;
  reviewed_at: number | null;
  admin_note: string | null;
};

const parseRow = (row: RawRow): CommunityThemeRow => {
  let palette: XRDBPalette;
  try {
    const parsed: unknown = JSON.parse(row.palette_json);
    palette = validatePalette(parsed) ? parsed : PRESETS_V2[0].palette;
  } catch {
    palette = PRESETS_V2[0].palette;
  }
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    palette,
    status: row.status as ThemeStatus,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    admin_note: row.admin_note,
  };
};

const SELECT_COLS = 'id, name, author, palette_json, status, submitted_at, reviewed_at, admin_note';

export const listApprovedCommunityThemes = async (): Promise<CommunityThemeRow[]> => {
  ensureDbInitialized();
  const result = await dbQuery<RawRow>(
    `SELECT ${SELECT_COLS} FROM community_themes WHERE status = 'approved' ORDER BY submitted_at DESC`,
  );
  return result.rows.map(parseRow);
};

export const listAllCommunityThemes = async (): Promise<CommunityThemeRow[]> => {
  ensureDbInitialized();
  const result = await dbQuery<RawRow>(
    `SELECT ${SELECT_COLS} FROM community_themes ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, submitted_at DESC`,
  );
  return result.rows.map(parseRow);
};

export type SubmitThemeInput = {
  name: string;
  author?: string;
  palette: XRDBPalette;
};

export const submitCommunityTheme = async (input: SubmitThemeInput): Promise<string> => {
  ensureDbInitialized();
  const id = randomUUID();
  const now = Date.now();
  await dbQuery(
    `INSERT INTO community_themes (id, name, author, palette_json, status, submitted_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
    [id, input.name, input.author ?? null, JSON.stringify(input.palette), now],
  );
  return id;
};

export const reviewCommunityTheme = async (
  id: string,
  status: 'approved' | 'denied',
  opts?: { name?: string; admin_note?: string },
): Promise<boolean> => {
  ensureDbInitialized();
  const now = Date.now();
  const fields: string[] = ['status = ?', 'reviewed_at = ?'];
  const values: (string | number | null)[] = [status, now];
  if (opts?.name !== undefined) {
    fields.push('name = ?');
    values.push(opts.name);
  }
  if (opts?.admin_note !== undefined) {
    fields.push('admin_note = ?');
    values.push(opts.admin_note);
  }
  values.push(id);
  const result = await dbQuery(
    `UPDATE community_themes SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );
  return ((result as MutationResult).info?.changes ?? 0) > 0;
};
