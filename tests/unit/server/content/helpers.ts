import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

export const REPO_CONTENT = path.join(process.cwd(), 'content');

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Copies the seeded content to a temp dir and applies edits, so each test breaks one rule.
 * An edit that returns null deletes the file.
 */
export function contentWith(edits: Record<string, (text: string) => string | null>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'content-'));
  tempDirs.push(dir);
  cpSync(REPO_CONTENT, dir, { recursive: true });
  for (const [file, edit] of Object.entries(edits)) {
    const full = path.join(dir, file);
    const next = edit(readFileSync(full, 'utf8'));
    if (next === null) rmSync(full);
    else writeFileSync(full, next);
  }
  return dir;
}
