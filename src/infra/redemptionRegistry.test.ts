import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as SQLite from 'expo-sqlite';

import { registryContract } from '../state/testing/registryContract';
import { createRedemptionRegistry, openRegistryDb, type RegistryDb } from './redemptionRegistry';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

function adaptDatabase(db: DatabaseSync): RegistryDb {
  const connection: Omit<RegistryDb, 'withExclusiveTransactionAsync'> = {
    async execAsync(source) { db.exec(source); },
    async runAsync(source, ...params) {
      return { changes: Number(db.prepare(source).run(...params).changes) };
    },
    async getFirstAsync<T>(source: string, ...params: (string | number)[]) {
      return (db.prepare(source).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, ...params: (string | number)[]) {
      return db.prepare(source).all(...params) as T[];
    },
  };
  return {
    ...connection,
    async withExclusiveTransactionAsync(task) {
      db.exec('BEGIN EXCLUSIVE');
      try {
        await task(connection);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

describe('SQLite redemption registry', () => {
  let sqlite: DatabaseSync;
  let db: RegistryDb;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    db = adaptDatabase(sqlite);
    jest.mocked(SQLite.openDatabaseAsync).mockReset();
    jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(db as SQLite.SQLiteDatabase);
  });
  afterEach(() => sqlite.close());

  registryContract(async () => {
    await openRegistryDb();
    return createRedemptionRegistry(async () => db);
  });

  test('opening twice preserves data and schema version', async () => {
    const registry = createRedemptionRegistry(openRegistryDb);
    await registry.record({ requestId: 'first', at: 100, spends: [{ nonceId: 'a', stamps: 2 }] });
    const reopened = createRedemptionRegistry(openRegistryDb);
    expect(await reopened.view('first', ['a'])).toEqual({ prior: { at: 100 }, spent: new Map([['a', 2]]) });
    expect(sqlite.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
    expect(sqlite.prepare('PRAGMA synchronous').get()).toEqual({ synchronous: 2 });
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('redemptions.db');
  });

  test('uses WAL with full synchronization and retains redemptions after closing and reopening the file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'redemption-registry-'));
    const path = join(directory, 'redemptions.db');
    let fileDb: DatabaseSync | undefined;
    try {
      fileDb = new DatabaseSync(path);
      jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(adaptDatabase(fileDb) as SQLite.SQLiteDatabase);
      await createRedemptionRegistry(openRegistryDb).record({ requestId: 'durable', at: 100, spends: [{ nonceId: 'a', stamps: 2 }] });
      expect(fileDb.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
      expect(fileDb.prepare('PRAGMA synchronous').get()).toEqual({ synchronous: 2 });
      fileDb.close();
      fileDb = undefined;

      fileDb = new DatabaseSync(path);
      jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(adaptDatabase(fileDb) as SQLite.SQLiteDatabase);
      expect(await createRedemptionRegistry(openRegistryDb).view('durable', ['a'])).toEqual({
        prior: { at: 100 }, spent: new Map([['a', 2]]),
      });
    } finally {
      fileDb?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('opens lazily, shares a pending open, and reuses the database', async () => {
    await openRegistryDb();
    const open = jest.fn(async () => db);
    const registry = createRedemptionRegistry(open);
    expect(open).not.toHaveBeenCalled();
    await Promise.all([registry.view('first', []), registry.view('second', ['a'])]);
    await registry.record({ requestId: 'first', at: 100, spends: [] });
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('rejects a failed open and retries on the next call', async () => {
    await openRegistryDb();
    const open = jest.fn<() => Promise<RegistryDb>>()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue(db);
    const registry = createRedemptionRegistry(open);
    await expect(registry.view('first', [])).rejects.toThrow('unavailable');
    await expect(registry.record({ requestId: 'first', at: 100, spends: [] })).resolves.toBe('recorded');
    expect(open).toHaveBeenCalledTimes(2);
  });

  test('an empty nonce list performs no aggregate query', async () => {
    await openRegistryDb();
    const getAllAsync = jest.spyOn(db, 'getAllAsync');
    expect(await createRedemptionRegistry(async () => db).view('first', [])).toEqual({ prior: null, spent: new Map() });
    expect(getAllAsync).not.toHaveBeenCalled();
  });
});
