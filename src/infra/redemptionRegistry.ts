import * as SQLite from 'expo-sqlite';

import type { RedemptionRegistry } from '../state/counterStore';

interface RegistryConnection {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: (string | number)[]): Promise<{ readonly changes: number }>;
  getFirstAsync<T>(source: string, ...params: (string | number)[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: (string | number)[]): Promise<T[]>;
}

/** The SQLite subset needed by the registry, also usable with a non-native test database. */
export interface RegistryDb extends RegistryConnection {
  withExclusiveTransactionAsync(task: (txn: RegistryConnection) => Promise<void>): Promise<void>;
}

// Stay within SQLite's historical limit even on builds with a higher variable limit.
const QUERY_VARIABLE_LIMIT = 999;

async function migrate(db: RegistryDb): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const version = await txn.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (!version || version.user_version > 1) throw new Error('Unsupported redemption registry schema');
    if (version.user_version === 1) return;

    await txn.execAsync(`
      CREATE TABLE IF NOT EXISTS redemptions (
        request_id TEXT PRIMARY KEY,
        at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS spends (
        request_id TEXT NOT NULL,
        nonce_id TEXT NOT NULL,
        stamps INTEGER NOT NULL CHECK (stamps > 0)
      );
      CREATE INDEX IF NOT EXISTS spends_nonce_id ON spends(nonce_id);
      PRAGMA user_version = 1;
    `);
  });
}

export async function openRegistryDb(): Promise<RegistryDb> {
  const db = await SQLite.openDatabaseAsync('redemptions.db');
  try {
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    await migrate(db);
    return db;
  } catch (error) {
    // A failed initialization must not retain a connection when the next call retries.
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
}

export function createRedemptionRegistry(openDb: () => Promise<RegistryDb>): RedemptionRegistry {
  let opening: Promise<RegistryDb> | undefined;
  const database = (): Promise<RegistryDb> => {
    if (!opening) {
      opening = Promise.resolve().then(openDb).catch((error: unknown) => {
        opening = undefined;
        throw error;
      });
    }
    return opening;
  };

  return {
    async view(requestId, proofNonceIds) {
      const db = await database();
      const prior = await db.getFirstAsync<{ at: number }>('SELECT at FROM redemptions WHERE request_id = ?', requestId);
      const ids = [...new Set(proofNonceIds)];
      const spent = new Map<string, number>();
      for (let start = 0; start < ids.length; start += QUERY_VARIABLE_LIMIT) {
        const chunk = ids.slice(start, start + QUERY_VARIABLE_LIMIT);
        const rows = await db.getAllAsync<{ nonce_id: string; stamps: number }>(
          `SELECT nonce_id, SUM(stamps) AS stamps FROM spends
           WHERE nonce_id IN (${chunk.map(() => '?').join(',')}) GROUP BY nonce_id`,
          ...chunk,
        );
        for (const row of rows) spent.set(row.nonce_id, row.stamps);
      }
      return { prior, spent };
    },

    async record(redemption) {
      const db = await database();
      let result: 'recorded' | 'duplicate' = 'duplicate';
      await db.withExclusiveTransactionAsync(async (txn) => {
        const inserted = await txn.runAsync(
          'INSERT OR IGNORE INTO redemptions (request_id, at) VALUES (?, ?)',
          redemption.requestId,
          redemption.at,
        );
        if (inserted.changes === 0) return;
        for (const spend of redemption.spends) {
          await txn.runAsync(
            'INSERT INTO spends (request_id, nonce_id, stamps) VALUES (?, ?, ?)',
            redemption.requestId,
            spend.nonceId,
            spend.stamps,
          );
        }
        result = 'recorded';
      });
      return result;
    },
  };
}
