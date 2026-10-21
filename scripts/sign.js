// Builds the Firefox extension and has Mozilla sign it (unlisted, so nothing goes on the store).
// The signed .xpi lands in dist/signed/. Credentials come from .env (never printed):
//   WEB_EXT_API_KEY=<AMO JWT issuer>   WEB_EXT_API_SECRET=<AMO JWT secret>
// Mozilla signs each version once, so bump "version" in manifest.json first.
// Usage: node scripts/sign.js [--dry-run]   (dry run builds and checks, but uploads nothing)
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

function fail(message) {
  console.error(message);
  process.exit(1);
}

// KEY=value lines, with an optional `export` and optional quotes.
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;
    const [, key, raw] = match;
    process.env[key] ??= raw.replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnv(join(root, '.env'));
const missing = ['WEB_EXT_API_KEY', 'WEB_EXT_API_SECRET'].filter((name) => !process.env[name]);
if (missing.length) fail(`Missing ${missing.join(' and ')}. Put them in .env (AMO key page: https://addons.mozilla.org/developers/addon/api/key/).`);

const { version } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const signedDir = join(root, 'dist', 'signed');
const already = existsSync(signedDir) && readdirSync(signedDir).find((name) => name.endsWith(`-${version}.xpi`));
if (already) fail(`Version ${version} is already signed (dist/signed/${already}). Bump "version" in manifest.json and package.json; Mozilla signs each version once.`);

const run = (command, args) => {
  const { status } = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (status !== 0) process.exit(status ?? 1);
};

run('node', ['scripts/build.js', 'firefox']);
if (dryRun) {
  console.log(`Dry run: ${version} is unsigned and credentials are set; nothing uploaded.`);
  process.exit(0);
}
console.log(`Signing ${version} with Mozilla (unlisted)…`);
run('npx', ['--yes', 'web-ext', 'sign', '--source-dir', 'dist/firefox', '--channel', 'unlisted', '--artifacts-dir', 'dist/signed']);
const signed = readdirSync(signedDir).find((name) => name.endsWith(`-${version}.xpi`));
console.log(signed ? `Signed: dist/signed/${signed}` : 'web-ext finished, but no .xpi for this version is in dist/signed.');
