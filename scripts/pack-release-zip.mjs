#!/usr/bin/env node
/**
 * Build per-radio JSON zips and catalog entries for GitHub Releases (ADR 0009).
 *
 * Usage: node scripts/pack-release-zip.mjs [releaseVersion] [--all]
 *   releaseVersion — semantic-release tag version (v{releaseVersion} in download URLs).
 *   --all — emit a zip for every config (local/CI). Default: only configs whose
 *           driver version is newer than the highest per-radio asset already published.
 *           `radio-module-<manufacturer>-<semver>.zip` assets are ignored.
 *
 * Writes dist-release/radio-module-<modelId>-<config.version>.zip and
 * dist-release/catalog-entries.json (schema version 3 module objects).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compareDriverSemver } from './check-driver-versions.mjs';
import { collectRefClosure, readWorkingTreeText } from './ref-closure.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * Per-radio asset: `radio-module-<modelId>-<config.version>.zip`.
 * modelId has at least two hyphenated segments (`kenwood-th-d74`), so the retired
 * manufacturer zip `radio-module-kenwood-1.11.6.zip` does not match.
 */
export const PER_RADIO_ASSET_PATTERN = /^radio-module-([a-z0-9]+(?:-[a-z0-9]+)+)-(\d+\.\d+\.\d+)\.zip$/;

/**
 * @param {string} moduleRoot
 * @param {{ releaseVersion?: string, all?: boolean, publishedAssetNames?: string[] }} [options]
 */
export function packReleaseZips(moduleRoot, options = {}) {
  const packageJson = JSON.parse(readFileSync(join(moduleRoot, 'package.json'), 'utf8'));
  const releaseVersion = options.releaseVersion ?? packageJson.version;
  const packAll = Boolean(options.all);
  const outputDirectory = join(moduleRoot, 'dist-release');
  const slug = githubRepoSlug(packageJson);

  mkdirSync(outputDirectory, { recursive: true });
  clearPerRadioZips(outputDirectory);

  const publishedByModel = packAll ? new Map() : publishedConfigVersions(moduleRoot, options.publishedAssetNames);
  const configs = listConfigDescriptors(moduleRoot);
  const entries = [];
  const packed = [];

  for (const descriptor of configs) {
    if (!shouldPublishConfig(descriptor, publishedByModel)) {
      continue;
    }

    const zipName = expectedZipName(descriptor.modelId, descriptor.configVersion);
    const zipPath = join(outputDirectory, zipName);
    const pathsToZip = closurePathsForConfig(moduleRoot, descriptor);

    createZip(moduleRoot, zipPath, pathsToZip);
    const integrity = integrityFromFile(zipPath);
    const entry = buildCatalogEntry(packageJson, descriptor, releaseVersion, slug, zipName, integrity);
    entries.push(entry);
    packed.push({ zipName, zipPath, integrity, modelId: descriptor.modelId, configVersion: descriptor.configVersion });
  }

  const catalogEntriesPath = join(outputDirectory, 'catalog-entries.json');
  writeFileSync(catalogEntriesPath, `${JSON.stringify(entries, null, 2)}\n`);

  return { catalogEntriesPath, entries, packed, releaseVersion, packAll };
}

/**
 * Highest published driver version per model id.
 * Pass `assetNames` in tests. Otherwise list non-draft GitHub Release assets.
 *
 * @param {string} moduleRoot
 * @param {string[]} [assetNames]
 * @returns {Map<string, string>}
 */
export function publishedConfigVersions(moduleRoot, assetNames) {
  const names = assetNames ?? listReleaseAssetNames(moduleRoot);
  return highestPublishedConfigVersions(names);
}

/**
 * @param {string[]} assetNames
 * @returns {Map<string, string>}
 */
export function highestPublishedConfigVersions(assetNames) {
  const byModel = new Map();

  for (const name of assetNames) {
    const match = PER_RADIO_ASSET_PATTERN.exec(name);

    if (!match) {
      continue;
    }

    const [, modelId, version] = match;
    const previous = byModel.get(modelId);

    if (!previous || compareDriverSemver(version, previous) > 0) {
      byModel.set(modelId, version);
    }
  }

  return byModel;
}

/**
 * Asset names on non-draft releases. Fails when the release list cannot be read
 * so a lookup error is not treated as "nothing published yet".
 *
 * @param {string} moduleRoot
 * @returns {string[]}
 */
export function listReleaseAssetNames(moduleRoot) {
  const slug = githubRepoSlug(JSON.parse(readFileSync(join(moduleRoot, 'package.json'), 'utf8')));

  if (!slug) {
    throw new Error('package.json repository must be a GitHub URL to list release assets');
  }

  const result = spawnSync(
    'gh',
    [
      'api',
      '--paginate',
      `repos/${slug}/releases?per_page=100`,
      '--jq',
      '.[] | select(.draft | not) | .assets[].name',
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `failed to list releases for ${slug}`).trim());
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * @param {import('./pack-release-zip.mjs').ConfigDescriptor} descriptor
 * @param {Map<string, string>} publishedByModel
 */
export function shouldPublishConfig(descriptor, publishedByModel) {
  const published = publishedByModel.get(descriptor.modelId);

  if (!published) {
    return true;
  }

  return compareDriverSemver(descriptor.configVersion, published) > 0;
}

/**
 * @typedef {{ fileName: string, relativeConfig: string, modelId: string, name: string, configVersion: string, minApiVersion: string, description?: string, manufacturer: string, parsed: unknown }} ConfigDescriptor
 */

/**
 * @param {string} moduleRoot
 * @returns {ConfigDescriptor[]}
 */
export function listConfigDescriptors(moduleRoot) {
  const configDirectory = join(moduleRoot, 'configs');
  const manufacturerDefault = JSON.parse(readFileSync(join(moduleRoot, 'package.json'), 'utf8')).springfield?.manufacturer;

  return readdirSync(configDirectory)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => parseConfigDescriptor(moduleRoot, fileName, manufacturerDefault));
}

/**
 * @param {string} moduleRoot
 * @param {string} fileName
 * @param {string} [manufacturerDefault]
 * @returns {ConfigDescriptor}
 */
export function parseConfigDescriptor(moduleRoot, fileName, manufacturerDefault) {
  const relativeConfig = `configs/${fileName}`;
  const absoluteConfig = join(moduleRoot, relativeConfig);
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
  } catch {
    throw new Error(`${relativeConfig} is not valid JSON`);
  }

  const modelId = parsed?.id?.model;
  const name = parsed?.id?.name;
  const configVersion = parsed?.version;
  const minApiVersion = parsed?.minApiVersion;
  const manufacturer =
    typeof parsed?.id?.manufacturer === 'string' && parsed.id.manufacturer.length > 0
      ? parsed.id.manufacturer
      : manufacturerDefault;

  if (typeof modelId !== 'string' || modelId.length === 0) {
    throw new Error(`${relativeConfig} is missing id.model`);
  }

  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`${relativeConfig} is missing id.name`);
  }

  if (typeof configVersion !== 'string' || !/^\d+\.\d+\.\d+/.test(configVersion)) {
    throw new Error(`${relativeConfig} is missing a major.minor.patch version`);
  }

  if (typeof minApiVersion !== 'string' || minApiVersion.length === 0) {
    throw new Error(`${relativeConfig} is missing minApiVersion`);
  }

  if (typeof manufacturer !== 'string' || manufacturer.length === 0) {
    throw new Error(`${relativeConfig} is missing id.manufacturer`);
  }

  const expectedFile = `configs/${modelId}.json`;

  if (relativeConfig !== expectedFile) {
    throw new Error(`${relativeConfig} must be named ${expectedFile} (id.model ${modelId})`);
  }

  return {
    fileName,
    relativeConfig,
    modelId,
    name,
    configVersion,
    minApiVersion,
    ...(typeof parsed.description === 'string' ? { description: parsed.description } : {}),
    manufacturer,
    parsed,
  };
}

/**
 * @param {string} moduleRoot
 * @param {ConfigDescriptor} descriptor
 * @returns {string[]} repo-relative paths to include in the zip
 */
export function closurePathsForConfig(moduleRoot, descriptor) {
  const paths = collectRefClosure(moduleRoot, descriptor.relativeConfig, readWorkingTreeText);

  for (const relativePath of paths) {
    if (!existsSync(join(moduleRoot, relativePath))) {
      throw new Error(`${descriptor.relativeConfig} $ref target is missing: ${relativePath}`);
    }
  }

  return paths;
}

export function expectedZipName(modelId, configVersion) {
  return `radio-module-${modelId}-${configVersion}.zip`;
}

export function expectedPackageId(modelId) {
  return `@springfield/radio-module-${modelId}`;
}

/**
 * @param {Record<string, unknown>} pkg
 * @param {ConfigDescriptor} descriptor
 * @param {string} releaseVersion
 * @param {string | undefined} slug
 * @param {string} zipName
 * @param {string} integrity
 */
export function buildCatalogEntry(pkg, descriptor, releaseVersion, slug, zipName, integrity) {
  if (!slug) {
    throw new Error('package.json repository must be a GitHub URL for catalog downloadUrl');
  }

  const downloadUrl = `https://github.com/${slug}/releases/download/v${releaseVersion}/${zipName}`;

  return {
    id: descriptor.modelId,
    package: expectedPackageId(descriptor.modelId),
    manufacturer: descriptor.manufacturer,
    name: descriptor.name,
    ...(descriptor.description ? { description: descriptor.description } : {}),
    version: descriptor.configVersion,
    config: descriptor.relativeConfig,
    minApiVersion: descriptor.minApiVersion,
    downloadUrl,
    integrity,
  };
}

function githubRepoSlug(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const match = String(url || '').match(/github\.com\/([^/]+\/[^/.]+)/);
  return match?.[1];
}

function clearPerRadioZips(outputDirectory) {
  if (!existsSync(outputDirectory)) {
    return;
  }

  for (const entry of readdirSync(outputDirectory)) {
    if (entry.startsWith('radio-module-') && entry.endsWith('.zip')) {
      unlinkSync(join(outputDirectory, entry));
    }
  }
}

function createZip(moduleRoot, zipPath, relativePaths) {
  if (existsSync(zipPath)) {
    unlinkSync(zipPath);
  }

  const zipResult = spawnSync('zip', ['-q', zipPath, ...relativePaths, '-x', '*.DS_Store'], {
    cwd: moduleRoot,
    encoding: 'utf8',
  });

  if (zipResult.status !== 0) {
    throw new Error(zipResult.stderr || zipResult.stdout || 'zip failed');
  }
}

function integrityFromFile(filePath) {
  const hash = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  return `sha256:${hash}`;
}

function isCli() {
  const entry = process.argv[1];
  return Boolean(entry) && fileURLToPath(import.meta.url) === resolve(entry);
}

if (isCli()) {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const releaseVersion = args.find((arg) => arg !== '--all');

  try {
    const result = packReleaseZips(rootDirectory, { releaseVersion, all });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
