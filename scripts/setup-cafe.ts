import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

import { keyRingOf, validateConfig, type CafeConfig } from '../src/domain/config';
import { buildStaffCode, DEMO_KEY_ID, demoStaffCode, parseStaffCode } from '../src/domain/provisioning';
import { keyPairFromSeed } from '../src/domain/token';
import { addPublicKey, nextKeyId, removeKey, renderProvisioningPage } from './lib/cafeKeys';

const usage = `Usage: bun run setup-cafe <command> [--root <dir>]
  new-key      Generate a signing key and private provisioning HTML
  print [id]   Render provisioning HTML (default: highest id with a secret)
  retire <id>  Remove a trusted public key; keep its secret until safe to delete
  check        Validate config and every staff secret
  demo         Write the public demo staff code page (docs/review/) for app reviewers
  help         Show this help`;

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ');

function parseId(text: string): number {
  if (!/^\d{1,3}$/.test(text) || Number(text) > 255) throw new Error('Key id must be an integer from 0 to 255');
  return Number(text);
}

async function loadConfig(root: string): Promise<CafeConfig> {
  let config: CafeConfig;
  try {
    config = JSON.parse(await readFile(join(root, 'cafe.config.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read cafe.config.json: ${errorMessage(error)}`);
  }
  let result;
  try {
    result = validateConfig(config);
  } catch {
    throw new Error('Invalid cafe.config.json: malformed config structure');
  }
  if (!result.ok) throw new Error(`Invalid cafe.config.json: ${result.error.join('; ')}`);
  return result.value;
}

/** Replace whole files atomically, keeping private HTML private even on reprint. */
async function replaceFile(path: string, contents: string, mode: number): Promise<void> {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeExclusive(temporary, contents, mode);
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error: unknown) => { if (!isMissing(error)) throw error; });
  }
}

async function writeExclusive(path: string, contents: string, mode: number): Promise<void> {
  const file = await open(path, 'wx', mode);
  try {
    await file.writeFile(contents, 'utf8');
  } finally {
    await file.close();
  }
}

const secretPath = (root: string, id: number): string => join(root, 'cafe-secrets', `staff-key-${id}.txt`);
const htmlPath = (root: string, id: number): string => join(root, 'cafe-secrets', `staff-key-${id}.html`);
const saveConfig = (root: string, config: CafeConfig): Promise<void> =>
  replaceFile(join(root, 'cafe.config.json'), `${JSON.stringify(config, null, 2)}\n`, 0o644);

async function secretFiles(root: string): Promise<string[]> {
  try {
    return (await readdir(join(root, 'cafe-secrets'))).filter((name) => /^staff-key-.*\.txt$/.test(name)).sort();
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

async function readSecret(root: string, config: CafeConfig, filename: string): Promise<{ id: number; code: string }> {
  const match = /^staff-key-(0|[1-9]\d{0,2})\.txt$/.exec(filename);
  if (!match) throw new Error(`${filename}: invalid secret filename`);
  const id = parseId(match[1]);
  const code = (await readFile(join(root, 'cafe-secrets', filename), 'utf8')).trim();
  const parsed = parseStaffCode(code, { cafeId: config.cafeId, keys: keyRingOf(config) });
  if (!parsed.ok) throw new Error(`${filename}: ${parsed.error} (secret must match a configured public key)`);
  if (parsed.value.demo) throw new Error(`${filename}: that's the public demo code, not a secret`);
  if (parsed.value.keyId !== id) throw new Error(`${filename}: code key id does not match filename`);
  return { id, code };
}

async function provisioningHtml(config: CafeConfig, id: number, code: string): Promise<string> {
  const qrSvg = await QRCode.toString(code, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  return renderProvisioningPage({ cafeName: config.name, cafeId: config.cafeId, keyId: id,
    staffCode: code, qrSvg, generatedAt: new Date().toISOString() });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const positional: string[] = [];
  let hasRoot = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root') {
      if (hasRoot || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Supply --root <dir> once');
      root = resolve(args[++i]);
      hasRoot = true;
    } else if (args[i].startsWith('--')) throw new Error(`Unknown option: ${args[i]}`);
    else positional.push(args[i]);
  }
  const [command = 'help', idText, ...extra] = positional;
  if (!['help', 'new-key', 'print', 'retire', 'check', 'demo'].includes(command)) throw new Error(`Unknown command: ${command}; run help`);
  if (extra.length || (idText !== undefined && !['print', 'retire'].includes(command))) throw new Error('Unexpected arguments; run help');
  if (command === 'help') { console.log(usage); return; }
  if (command === 'retire' && idText === undefined) throw new Error('Usage: retire <id>');
  const requestedId = idText === undefined ? undefined : parseId(idText);
  const config = await loadConfig(root);

  switch (command) {
    case 'new-key': {
      const id = nextKeyId(config);
      const seed = crypto.getRandomValues(new Uint8Array(32));
      const updated = addPublicKey(config, id, keyPairFromSeed(seed).publicKey);
      const code = buildStaffCode(config.cafeId, id, seed);
      const html = await provisioningHtml(config, id, code);
      await mkdir(join(root, 'cafe-secrets'), { recursive: true, mode: 0o700 });
      try {
        await writeExclusive(secretPath(root, id), `${code}\n`, 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') throw new Error(`Secret for key ${id} already exists; refusing to overwrite it`);
        throw new Error(`Cannot write secret for key ${id}; config unchanged: ${errorMessage(error)}`);
      }
      try {
        await saveConfig(root, updated);
      } catch (error) {
        throw new Error(`Secret for key ${id} saved, but config update failed; keep the secret and repair the config before retrying: ${errorMessage(error)}`);
      }
      try {
        await replaceFile(htmlPath(root, id), html, 0o600);
      } catch (error) {
        throw new Error(`Key ${id} and config saved, but HTML failed; fix the output path then run print ${id}: ${errorMessage(error)}`);
      }
      console.log(`Created key ${id}. Rebuild/publish the app so customers trust the new key.\nPrint ${htmlPath(root, id)} and keep it private.\nProvision the counter phone by scanning the code in the app.`);
      return;
    }
    case 'print': {
      const ids = (await secretFiles(root)).flatMap((name) => {
        const match = /^staff-key-(0|[1-9]\d{0,2})\.txt$/.exec(name);
        return match && Number(match[1]) <= 255 ? [Number(match[1])] : [];
      });
      const id = requestedId ?? (ids.length ? Math.max(...ids) : undefined);
      if (id === undefined) throw new Error('No staff secret files found');
      const { code } = await readSecret(root, config, `staff-key-${id}.txt`);
      await replaceFile(htmlPath(root, id), await provisioningHtml(config, id, code), 0o600);
      console.log(`Print ${htmlPath(root, id)}. Keep it private; anyone with this code can issue stamps.`);
      return;
    }
    case 'retire': {
      await saveConfig(root, removeKey(config, requestedId!));
      console.log(`Retired key ${requestedId}. WARNING: Customers' apps reject this key only after they update.\nAfter customers update, the secret file and provisioning HTML can be deleted. Existing files were kept.`);
      return;
    }
    case 'check': {
      const files = await secretFiles(root);
      const problems: string[] = [];
      for (const filename of files) {
        try { await readSecret(root, config, filename); }
        catch (error) { problems.push(errorMessage(error)); }
      }
      if (problems.length) throw new Error(`Config valid; ${files.length - problems.length}/${files.length} secrets valid: ${problems.join('; ')}`);
      console.log(`Config valid: ${config.keys.length} trusted key(s); ${files.length} secret file(s) verified.`);
      return;
    }
    case 'demo': {
      const dir = join(root, 'docs', 'review');
      await mkdir(dir, { recursive: true });
      await replaceFile(join(dir, 'index.html'), await provisioningHtml(config, DEMO_KEY_ID, demoStaffCode(config.cafeId)), 0o644);
      console.log(`Wrote ${join(dir, 'index.html')}. It's safe to publish: customers' apps reject demo stamps.`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(`Error: ${errorMessage(error)}`);
  process.exitCode = 1;
});
