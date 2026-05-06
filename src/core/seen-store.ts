import Database from 'better-sqlite3';

/**
 * Tiny SQLite-backed dedup store. Pulse Stream replays its current view on
 * every `sync` (~30s), so we must remember which tokens we already alerted on.
 */
export class SeenStore {
  private readonly db: Database.Database;
  private readonly insert: Database.Statement<[string, number]>;
  private readonly select: Database.Statement<[string]>;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS seen_tokens (
        chain_address TEXT PRIMARY KEY,
        first_seen_ts INTEGER NOT NULL
      );
    `);
    this.insert = this.db.prepare(
      'INSERT OR IGNORE INTO seen_tokens (chain_address, first_seen_ts) VALUES (?, ?)',
    );
    this.select = this.db.prepare(
      'SELECT 1 FROM seen_tokens WHERE chain_address = ? LIMIT 1',
    );
  }

  private static key(chainId: string, address: string): string {
    return `${chainId}|${address.toLowerCase()}`;
  }

  alreadySeen(chainId: string, address: string): boolean {
    return this.select.get(SeenStore.key(chainId, address)) !== undefined;
  }

  markSeen(chainId: string, address: string): void {
    this.insert.run(SeenStore.key(chainId, address), Date.now());
  }

  close(): void {
    this.db.close();
  }
}
