// Builds the extension into dist/<target> for Firefox and Chrome/Brave. Each build is
// upstream's manifest (plus Gecko settings for Firefox) and a copy of src/.
// Nothing upstream is edited, so merges stay clean.
// Usage: node scripts/build.js [firefox|chrome|all]   (default: all)
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// "world": "MAIN" content scripts need Firefox 128; data_collection_permissions needs 140 (142 on Android).
const firefox = (manifest) => ({
  ...manifest,
  browser_specific_settings: {
    gecko: {
      id: process.env.FIREFOX_EXTENSION_ID || '{3f5e93c0-af9a-4f05-9a86-14b35a9ed2b4}',
      strict_min_version: '140.0',
      // The extension only talks to Sleeper, as the logged-in user would.
      data_collection_permissions: { required: ['none'] },
    },
    gecko_android: { strict_min_version: '142.0' },
  },
});

// Upstream's manifest is already the Chrome one; Brave and other Chromium browsers load it as is.
const targets = { firefox, chrome: (manifest) => manifest };

const arg = process.argv[2] || 'all';
const names = arg === 'all' ? Object.keys(targets) : [arg];
if (names.some((name) => !targets[name])) {
  console.error(`Unknown target "${arg}". Use firefox, chrome or all.`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
for (const name of names) {
  const out = join(root, 'dist', name);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(join(root, 'src'), join(out, 'src'), { recursive: true });
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(targets[name](manifest), null, 2)}\n`);
  console.log(`Built ${out}`);
}
