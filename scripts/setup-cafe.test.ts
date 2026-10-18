import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(__dirname, '..');
const cli = join(repo, 'scripts/setup-cafe.ts');
let root: string;

const run = (...args: string[]): Promise<{ status: number; output: string }> =>
  new Promise((resolve, reject) => {
    execFile('bun', [cli, ...args, '--root', root], { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') { reject(error); return; }
      resolve({ status: typeof error?.code === 'number' ? error.code : 0, output: `${stdout}${stderr}` });
    });
  });
const config = () => JSON.parse(readFileSync(join(root, 'cafe.config.json'), 'utf8'));
const secret = (id: number) => join(root, 'cafe-secrets', `staff-key-${id}.txt`);
const html = (id: number) => join(root, 'cafe-secrets', `staff-key-${id}.html`);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cafe-cli-'));
  cpSync(join(repo, 'cafe.config.json'), join(root, 'cafe.config.json'));
  cpSync(join(repo, 'cafe-secrets'), join(root, 'cafe-secrets'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('CLI against a temporary copy only', () => {
  test('checks, creates, prints, retires, and reports the retained retired secret', async () => {
    expect((await run('check')).status).toBe(0);
    const originalSecret = readFileSync(secret(1));
    expect((await run('new-key')).status).toBe(0);
    expect(config().keys.map((key: { id: number }) => key.id)).toContain(2);
    expect(statSync(secret(2)).mode & 0o777).toBe(0o600);
    expect(statSync(html(2)).mode & 0o777).toBe(0o600);
    expect(readFileSync(secret(1)).equals(originalSecret)).toBe(true);
    expect((await run('check')).status).toBe(0);
    rmSync(html(2));
    expect((await run('print')).status).toBe(0);
    expect(existsSync(html(2))).toBe(true);
    const code = readFileSync(secret(2), 'utf8').trim();
    expect(readFileSync(html(2), 'utf8').includes(code)).toBe(true);
    const retired = await run('retire', '2');
    expect(retired.status).toBe(0);
    expect(retired.output).toContain('only after they update');
    expect(existsSync(secret(2))).toBe(true);
    const checked = await run('check');
    expect(checked.status).toBe(1);
    expect(checked.output).toContain('untrusted-key');
    expect((await run('print', '2')).status).toBe(1);
    rmSync(secret(2));
    expect((await run('check')).status).toBe(0);
  });

  test('refuses an existing secret without overwriting secret or config', async () => {
    writeFileSync(secret(2), 'existing secret\n', { mode: 0o600 });
    const before = readFileSync(join(root, 'cafe.config.json'));
    const result = await run('new-key');
    expect(result.status).toBe(1);
    expect(result.output).toContain('refusing to overwrite');
    expect(readFileSync(secret(2), 'utf8') === 'existing secret\n').toBe(true);
    expect(readFileSync(join(root, 'cafe.config.json')).equals(before)).toBe(true);
  });

  test('does not update config if secret creation fails', async () => {
    rmSync(join(root, 'cafe-secrets'), { recursive: true });
    writeFileSync(join(root, 'cafe-secrets'), 'not a directory');
    const before = readFileSync(join(root, 'cafe.config.json'));
    expect((await run('new-key')).status).toBe(1);
    expect(readFileSync(join(root, 'cafe.config.json')).equals(before)).toBe(true);
  });

  test('creates a private secret directory when absent', async () => {
    rmSync(join(root, 'cafe-secrets'), { recursive: true });
    expect((await run('new-key')).status).toBe(0);
    expect(statSync(join(root, 'cafe-secrets')).mode & 0o777).toBe(0o700);
    expect((await run('check')).status).toBe(0);
  });

  test('explains how to recover HTML after the key has already been saved', async () => {
    mkdirSync(html(2));
    const result = await run('new-key');
    expect(result.status).toBe(1);
    expect(result.output).toContain('Key 2 and config saved');
    expect(result.output).toContain('run print 2');
    expect((await run('check')).status).toBe(0);
    rmSync(html(2), { recursive: true });
    expect((await run('print', '2')).status).toBe(0);
  });

  test('rejects valid code saved under the wrong id', async () => {
    cpSync(secret(1), secret(2));
    expect((await run('print', '2')).output).toContain('does not match filename');
    expect((await run('check')).status).toBe(1);
  });

  test.each(['not-a-code', 'CAFESTAFF1.wrong-cafe.1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'CAFESTAFF1.test.1.short'])('rejects malformed or mismatched staff code %s', async (value) => {
    writeFileSync(secret(1), value);
    expect((await run('check')).status).toBe(1);
    expect((await run('print', '1')).status).toBe(1);
  });

  test.each(['null', '{', '{"keys": {}}'])('rejects malformed config %s with a one-line error', async (value) => {
    writeFileSync(join(root, 'cafe.config.json'), value);
    const result = await run('check');
    expect(result.status).toBe(1);
    expect(result.output.trim().split('\n')).toHaveLength(1);
    expect(result.output).toContain('Error:');
  });

  test('refuses exhaustion at id 255', async () => {
    const updated = config();
    updated.keys[0].id = 255;
    writeFileSync(join(root, 'cafe.config.json'), JSON.stringify(updated));
    expect((await run('new-key')).output).toContain('maximum is 255');
  });

  test.each([['retire', '1'], ['retire', '9'], ['retire'], ['retire', '256'], ['print', '-1'],
    ['print', '1.5'], ['print', '999999999999999'], ['print', '99'], ['unknown'], ['check', '1'],
    ['print', '1', 'extra'], ['check', '--bad'], ['check', '--root']])('fails clearly for %j', async (...args) => {
    const result = await run(...args);
    expect(result.status).toBe(1);
    expect(result.output.trim().split('\n')).toHaveLength(1);
    expect(result.output).not.toContain('at main');
  });

  test('handles no secret files and invalid filenames', async () => {
    rmSync(join(root, 'cafe-secrets'), { recursive: true });
    expect((await run('check')).status).toBe(0);
    expect((await run('print')).output).toContain('No staff secret files found');
    mkdirSync(join(root, 'cafe-secrets'));
    writeFileSync(join(root, 'cafe-secrets/staff-key-bad.txt'), 'invalid');
    expect((await run('check')).output).toContain('invalid secret filename');
  });

  test('shows usage for no command and help without requiring a config', async () => {
    rmSync(join(root, 'cafe.config.json'));
    expect((await run()).status).toBe(0);
    expect((await run('help')).output).toContain('Usage:');
  });
});
