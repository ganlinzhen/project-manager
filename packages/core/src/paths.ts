import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { WorkManagerError } from './errors.js';

export function assertWithinRoots(candidate: string, roots: string[]): string {
  const resolved = path.resolve(candidate);
  const allowed = roots.some((root) => {
    const relative = path.relative(path.resolve(root), resolved);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  });
  if (!allowed) {
    throw new WorkManagerError('PATH_OUTSIDE_ALLOWED_ROOT', `路径不在允许范围内：${resolved}`);
  }
  return resolved;
}

export function defaultDatabasePath(): string {
  const appData = process.env.WM_APP_DATA_DIR
    ?? path.join(process.env.HOME ?? process.cwd(), 'Library', 'Application Support', 'work-manager');
  return path.join(appData, 'work-manager.db');
}

export async function assertRealPathWithinRoots(candidate: string, roots: string[]): Promise<string> {
  const [resolved, ...canonicalRoots] = await Promise.all([realpath(candidate), ...roots.map((root) => realpath(root))]);
  return assertWithinRoots(resolved, canonicalRoots);
}
