import db from './index';

export function getNextBotId(owner: string): number {
  return db.transaction(() => {
    const maxAccountNumber = db.prepare(`
      SELECT COALESCE(MAX(accountNumber), 0) as maxAccountNumber
      FROM mango_accounts
      WHERE owner = ?
    `).get(owner) as { maxAccountNumber: number };

    return maxAccountNumber.maxAccountNumber + 1;
  })();
}

export function addMangoAccount(owner: string, mangoAccount: string, accountNumber: number): void {
  db.prepare(`
    INSERT INTO mango_accounts (owner, mangoAccount, accountNumber)
    VALUES (?, ?, ?)
  `).run(owner, mangoAccount, accountNumber);
}

export function deactivateMangoAccount(mangoAccount: string) {
  const query = db.prepare(`
    UPDATE mango_accounts
    SET active = 0
    WHERE mangoAccount = ?
  `);
  query.run(mangoAccount);
}

export function getUserMangoAccounts(owner: string): string[] {
  const query = db.prepare(`
    SELECT mangoAccount
    FROM mango_accounts
    WHERE owner = ? AND active = 1
  `);
  const accounts = query.all(owner) as { mangoAccount: string }[];
  return accounts.map(account => account.mangoAccount);
}