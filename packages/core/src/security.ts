import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep, dirname } from 'node:path';

/**
 * Security utilities for resource normalization and containment checks.
 *
 * Policy matching operates on normalized, workspace-relative paths so that
 * traversal tricks (`../`, encoded separators, backslashes, absolute paths)
 * cannot slip past glob-based rules.
 */

export class ResourceSecurityError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ResourceSecurityError';
  }
}

const FS_ACTION_PREFIXES = ['filesystem.', 'repository.'];

export function isFilesystemAction(action: string): boolean {
  return FS_ACTION_PREFIXES.some((p) => action === p.slice(0, -1) || action.startsWith(p));
}

function decodeEncoded(input: string): string {
  // Repeatedly decode percent-encoding to defeat double-encoding (%252e%252e)
  let prev = input;
  for (let i = 0; i < 3; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(prev);
    } catch {
      // Malformed encoding — treat as hostile
      throw new ResourceSecurityError(
        'MALFORMED_ENCODING',
        `Resource path contains malformed percent-encoding: ${input}`
      );
    }
    if (decoded === prev) return decoded;
    prev = decoded;
  }
  return prev;
}

/**
 * Normalize a filesystem resource string into canonical `./a/b/c` form.
 * Throws ResourceSecurityError if the path escapes the workspace root
 * (via `..`, absolute paths, drive letters, or null bytes).
 */
export function normalizeFsResource(resource: string): string {
  if (resource === '*' || resource === '**') return resource;

  let path = decodeEncoded(resource);

  if (path.includes('\0')) {
    throw new ResourceSecurityError('NULL_BYTE', 'Resource path contains a null byte');
  }

  // Unify separators
  path = path.replace(/\\/g, '/');

  // Absolute paths (POSIX or Windows drive / UNC) are not workspace-relative
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.startsWith('//')) {
    throw new ResourceSecurityError(
      'ABSOLUTE_PATH',
      `Absolute resource paths are not permitted in policy requests: ${resource}`
    );
  }

  // Resolve `.` and `..` segments logically
  const segments = path.split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) {
        throw new ResourceSecurityError(
          'PATH_TRAVERSAL',
          `Resource path escapes the workspace root: ${resource}`
        );
      }
      out.pop();
      continue;
    }
    out.push(seg);
  }

  return './' + out.join('/');
}

/**
 * Resolve a workspace-relative resource to an absolute path and verify it
 * stays inside the workspace, following symlinks on the deepest existing
 * ancestor so a symlinked directory cannot escape containment.
 */
export function resolveWithinWorkspace(cwd: string, resource: string): string {
  const normalized = normalizeFsResource(resource);
  if (normalized === '*' || normalized === '**') {
    throw new ResourceSecurityError('NOT_A_PATH', 'Wildcard is not a concrete filesystem path');
  }

  const workspaceRoot = realpathSync(cwd);
  const target = resolve(workspaceRoot, normalized.slice(2));

  // Follow symlinks on the deepest existing ancestor
  let probe = target;
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const realProbe = realpathSync(probe);
  const realTarget = target.replace(probe, realProbe);

  const rootWithSep = workspaceRoot.endsWith(sep) ? workspaceRoot : workspaceRoot + sep;
  if (realTarget !== workspaceRoot && !realTarget.startsWith(rootWithSep)) {
    throw new ResourceSecurityError(
      'PATH_ESCAPE',
      `Resolved path escapes the workspace: ${resource}`
    );
  }
  if (isAbsolute(target) && target !== workspaceRoot && !target.startsWith(rootWithSep)) {
    throw new ResourceSecurityError(
      'PATH_ESCAPE',
      `Resolved path escapes the workspace: ${resource}`
    );
  }
  return target;
}

/** Paths that agents must never write through the filesystem adapter. */
export const PROTECTED_PATH_PATTERNS = [
  './.agent/**',
  './.agent',
  './.env',
  './.env.*',
  './.git/**',
];

export function isProtectedPath(normalizedResource: string): boolean {
  const p = normalizedResource.toLowerCase();
  return (
    p === './.agent' ||
    p.startsWith('./.agent/') ||
    p === './.env' ||
    p.startsWith('./.env.') ||
    p === './.git' ||
    p.startsWith('./.git/')
  );
}
