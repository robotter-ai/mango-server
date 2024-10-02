import Database from "bun:sqlite";

const db = new Database("tradingbots.sqlite");

export function initDb() {
  db.query(`CREATE TABLE IF NOT EXISTS "bots" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    accountNumber INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT 1,
    UNIQUE(owner, accountNumber)
  )`).run();
}

export function getNextBotId(owner: string): number {
  return db.transaction(() => {
    const maxAccountNumber = db.prepare(`
      SELECT COALESCE(MAX(accountNumber), -1) as maxAccountNumber
      FROM bots
      WHERE owner = ?
    `).get(owner) as { maxAccountNumber: number };

    const nextAccountNumber = maxAccountNumber.maxAccountNumber + 1;

    db.prepare(`
      INSERT INTO bots (owner, accountNumber)
      VALUES (?, ?)
    `).run(owner, nextAccountNumber);

    return nextAccountNumber;
  })();
}

export function deactivateBot(owner: string, accountNumber: number) {
  const query = db.prepare(`
    UPDATE bots
    SET active = 0
    WHERE owner = ? AND accountNumber = ?
  `);
  query.run(owner, accountNumber);
}

export function getAllActiveBots(owner: string): { accountNumber: number }[] {
  const query = db.prepare(`
    SELECT accountNumber
    FROM bots
    WHERE owner = ? AND active = 1
  `);
  return query.all(owner) as { accountNumber: number }[];
}

export default db;