/**
 * T034: package the Next.js standalone build for Lambda + the Lambda Web Adapter.
 *
 *   npm run build && npm run package:lambda
 *
 * Output:
 *   infra/.build/lambda/      the unpacked function (server.js, run.sh, .next/, node_modules/, public/)
 *   infra/.build/lambda.zip   the same tree, zipped with Unix file modes; this is what CDK deploys
 *
 * Why a hand-written zip: the Web Adapter's /opt/bootstrap runs `exec "$LAMBDA_TASK_ROOT/$_HANDLER"`,
 * so run.sh must be executable inside the zip. A zip made by CDK on Windows drops the execute bit and
 * the function would fail with "permission denied". Node's zlib is enough (no extra dependency).
 *
 * Analysis I2 (owner decision, 2026-11-14, option A): the standalone output omits `public/` and
 * `.next/static/`, so both are copied in and the function can serve any path. CloudFront still serves
 * `/_next/static/*` from S3.
 *
 * Never packaged: `private/` (the CV PDF) and `.env*` files. The script fails if either shows up.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const root = resolve(__dirname, '..');
const standalone = join(root, '.next', 'standalone');
const buildDir = join(root, 'infra', '.build');
const outDir = join(buildDir, 'lambda');
const zipPath = join(buildDir, 'lambda.zip');
const indexJson = join(root, 'content', '.generated', 'index.json');

function fail(message: string): never {
  console.error(`package-lambda: ${message}`);
  process.exit(1);
}

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile()) files.push(full);
    else fail(`unexpected non-regular file ${full}`);
  }
  return files;
}

// --- 1. Assemble the function directory ----------------------------------------------------------
if (!existsSync(join(standalone, 'server.js'))) {
  fail('.next/standalone/server.js not found. Run `npm run build` first (next.config.ts needs output: "standalone").');
}

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

// `dereference` resolves the absolute symlinks Next writes under .next/standalone/.next/node_modules.
cpSync(standalone, outDir, { recursive: true, dereference: true });
cpSync(join(root, '.next', 'static'), join(outDir, '.next', 'static'), { recursive: true, dereference: true });
if (existsSync(join(root, 'public'))) {
  cpSync(join(root, 'public'), join(outDir, 'public'), { recursive: true, dereference: true });
}

if (existsSync(indexJson)) {
  mkdirSync(join(outDir, 'content', '.generated'), { recursive: true });
  cpSync(indexJson, join(outDir, 'content', '.generated', 'index.json'));
} else {
  console.warn('package-lambda: content/.generated/index.json is missing; fine until US3 (release:check requires it).');
}

writeFileSync(join(outDir, 'run.sh'), '#!/bin/bash\nexec node server.js\n', { mode: 0o755 });

// --- 2. Guard against leaking private files ------------------------------------------------------
const files = listFiles(outDir).sort();
const rel = (file: string) => relative(outDir, file).split(sep).join('/');
const leaked = files.map(rel).filter((p) => p === 'private' || p.startsWith('private/') || /(^|\/)\.env(\.|$)/.test(p));
if (leaked.length > 0) fail(`refusing to package private files:\n  ${leaked.join('\n  ')}`);

for (const required of ['server.js', 'run.sh', '.next/BUILD_ID']) {
  if (!existsSync(join(outDir, required))) fail(`missing ${required} in ${outDir}`);
}

// --- 3. Zip with Unix modes ----------------------------------------------------------------------
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, so the zip is reproducible
const UNIX_FILE = 0o100000;

const chunks: Buffer[] = [];
const central: Buffer[] = [];
let offset = 0;

for (const file of files) {
  const name = Buffer.from(rel(file), 'utf8');
  const data = readFileSync(file);
  const compressed = deflateRawSync(data, { level: 9 });
  const useDeflate = compressed.length < data.length;
  const body = useDeflate ? compressed : data;
  const crc = crc32(data);
  const mode = rel(file) === 'run.sh' ? 0o755 : 0o644;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, name, body);

  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, so external attrs hold the mode
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(useDeflate ? 8 : 0, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(body.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(((UNIX_FILE | mode) << 16) >>> 0, 38);
  header.writeUInt32LE(offset, 42);
  central.push(header, name);

  offset += local.length + name.length + body.length;
  if (offset > 0xffffffff) fail('package exceeds 4 GB; zip64 is not supported');
}

if (files.length > 0xffff) fail(`too many files for a non-zip64 archive (${files.length})`);

const centralDir = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDir.length, 12);
end.writeUInt32LE(offset, 16);

writeFileSync(zipPath, Buffer.concat([...chunks, centralDir, end]));

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const unzipped = files.reduce((sum, f) => sum + statSync(f).size, 0);
console.log(
  `package-lambda: ${files.length} files, ${mb(unzipped)} MB unzipped -> ${relative(root, zipPath)} (${mb(statSync(zipPath).size)} MB)`,
);
if (unzipped > 250 * 1024 * 1024) fail('unzipped size exceeds the 250 MB Lambda limit');
