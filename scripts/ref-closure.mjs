/**
 * Transitive relative `$ref` closure for a radio config and the JSON it reaches.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * @param {string} moduleRoot
 * @param {string} startRelative Repo-relative JSON file to start from (included in the result)
 * @param {(moduleRoot: string, relativePath: string) => string | undefined} readText
 * @returns {string[]} Sorted repo-relative paths, including `startRelative`
 */
export function collectRefClosure(moduleRoot, startRelative, readText) {
  const included = new Set([startRelative]);
  const pending = [startRelative];

  while (pending.length > 0) {
    const current = pending.pop();
    const text = readText(moduleRoot, current);

    if (text === undefined) {
      continue;
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }

    const fromDirectory = dirname(join(moduleRoot, current));

    for (const refPath of localRefTargets(parsed)) {
      const absolutePath = resolve(fromDirectory, refPath);
      const relativePath = toRepoRelative(moduleRoot, absolutePath);

      if (relativePath === undefined) {
        throw new Error(`${current} $ref escapes the repository: ${refPath}`);
      }

      if (!included.has(relativePath)) {
        included.add(relativePath);
        pending.push(relativePath);
      }
    }
  }

  return [...included].sort();
}

/**
 * @param {string} moduleRoot
 * @param {string} relativePath
 * @returns {string | undefined}
 */
export function readWorkingTreeText(moduleRoot, relativePath) {
  const absolutePath = join(moduleRoot, relativePath);

  if (!existsSync(absolutePath)) {
    return undefined;
  }

  return readFileSync(absolutePath, 'utf8');
}

/**
 * @param {unknown} value
 * @param {string[]} [into]
 * @returns {string[]}
 */
export function localRefTargets(value, into = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      localRefTargets(item, into);
    }

    return into;
  }

  if (!value || typeof value !== 'object') {
    return into;
  }

  if (typeof value.$ref === 'string') {
    const refPath = filePathFromRef(value.$ref);

    if (refPath) {
      into.push(refPath);
    }
  }

  for (const child of Object.values(value)) {
    localRefTargets(child, into);
  }

  return into;
}

/**
 * @param {string} ref
 * @returns {string | undefined} Path portion of a relative file `$ref`, without a JSON pointer
 */
export function filePathFromRef(ref) {
  if (ref.length === 0 || ref.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    return undefined;
  }

  const hashIndex = ref.indexOf('#');
  const refPath = hashIndex === -1 ? ref : ref.slice(0, hashIndex);

  return refPath.length > 0 ? refPath : undefined;
}

function toRepoRelative(rootDirectory, absolutePath) {
  const relativePath = relative(rootDirectory, absolutePath);

  if (relativePath === '' || relativePath.startsWith('..') || relativePath.includes(`${sep}..`)) {
    return undefined;
  }

  return relativePath.split(sep).join('/');
}
