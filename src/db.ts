import Database from "bun:sqlite";
import { MangoEvent, DepositEvent, LiquidationEvent, SwapEvent, TradeEvent, WithdrawEvent } from "./types";

const db = new Database("tradingbots.sqlite");

export function initDb() {
  db.query(`CREATE TABLE IF NOT EXISTS "mango_accounts" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    mangoAccount TEXT NOT NULL UNIQUE,
    accountNumber INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT 1,
    UNIQUE(owner, accountNumber)
  )`).run();

  db.query(`CREATE TABLE IF NOT EXISTS "mango_deposits_withdraws" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature TEXT NOT NULL,
    event_type TEXT NOT NULL,
    mango_account TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    group_pubkey TEXT NOT NULL,
    amount TEXT NOT NULL,
    token TEXT NOT NULL,
    owner TEXT NOT NULL,
    bank TEXT NOT NULL,
    vault TEXT NOT NULL,
    token_account TEXT NOT NULL,
    allow_borrow BOOLEAN,
    signers TEXT NOT NULL,
    UNIQUE(signature, event_type)
  )`).run();

  db.query(`CREATE TABLE IF NOT EXISTS "mango_trades" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature TEXT NOT NULL,
    event_type TEXT NOT NULL,
    mango_account TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    group_pubkey TEXT NOT NULL,
    perp_market TEXT,
    serum_market TEXT,
    side TEXT NOT NULL,
    price TEXT NOT NULL,
    quantity TEXT NOT NULL,
    client_order_id TEXT NOT NULL,
    order_type TEXT NOT NULL,
    reduce_only BOOLEAN,
    token TEXT NOT NULL,
    owner TEXT NOT NULL,
    max_base_quantity TEXT,
    max_quote_quantity TEXT,
    expiry_timestamp TEXT,
    "limit" TEXT NOT NULL,
    open_orders TEXT,
    self_trade_behavior TEXT,
    signers TEXT NOT NULL,
    UNIQUE(signature, event_type)
  )`).run();

  db.query(`CREATE TABLE IF NOT EXISTS "mango_swaps" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature TEXT NOT NULL,
    mango_account TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    group_pubkey TEXT NOT NULL,
    buy_token_index INTEGER NOT NULL,
    sell_token_index INTEGER NOT NULL,
    buy_token TEXT NOT NULL,
    sell_token TEXT NOT NULL,
    owner TEXT NOT NULL,
    buy_bank TEXT NOT NULL,
    sell_bank TEXT NOT NULL,
    max_buy_token_to_release TEXT NOT NULL,
    max_sell_token_to_release TEXT NOT NULL,
    signers TEXT NOT NULL,
    UNIQUE(signature)
  )`).run();

  db.query(`CREATE TABLE IF NOT EXISTS "mango_liquidations" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature TEXT NOT NULL,
    mango_account TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    group_pubkey TEXT NOT NULL,
    liqor TEXT NOT NULL,
    liqee TEXT NOT NULL,
    asset_token_index INTEGER NOT NULL,
    liab_token_index INTEGER NOT NULL,
    asset_token TEXT NOT NULL,
    liab_token TEXT NOT NULL,
    asset_bank TEXT NOT NULL,
    liab_bank TEXT NOT NULL,
    max_liab_transfer TEXT NOT NULL,
    signers TEXT NOT NULL,
    UNIQUE(signature)
  )`).run();

  db.query(`CREATE INDEX IF NOT EXISTS idx_mango_account ON mango_deposits_withdraws (mango_account)`).run();
  db.query(`CREATE INDEX IF NOT EXISTS idx_mango_account ON mango_trades (mango_account)`).run();
  db.query(`CREATE INDEX IF NOT EXISTS idx_mango_account ON mango_swaps (mango_account)`).run();
  db.query(`CREATE INDEX IF NOT EXISTS idx_mango_account ON mango_liquidations (mango_account)`).run();
}

export function getNextBotId(owner: string): number {
  return db.transaction(() => {
    const maxAccountNumber = db.prepare(`
      SELECT COALESCE(MAX(accountNumber), 0) as maxAccountNumber
      FROM mango_accounts
      WHERE owner = ?
    `).get(owner) as { maxAccountNumber: number };

    console.log('Bot number', maxAccountNumber.maxAccountNumber + 1)
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

export function getAllActiveMangoAccounts(): { owner: string, mangoAccount: string, accountNumber: number }[] {
  const query = db.prepare(`
    SELECT owner, mangoAccount, accountNumber
    FROM mango_accounts
    WHERE active = 1
  `);
  return query.all() as { owner: string, mangoAccount: string, accountNumber: number }[];
}

export function saveMangoEvent(event: MangoEvent) {
  db.transaction(() => {
      if (isDepositEvent(event) || isWithdrawEvent(event)) {
          saveDepositWithdrawEvent(event);
      } else if (isTradeEvent(event)) {
          saveTradeEvent(event);
      } else if (isSwapEvent(event)) {
          saveSwapEvent(event);
      } else if (isLiquidationEvent(event)) {
          saveLiquidationEvent(event);
      }
  })();
}

function saveDepositWithdrawEvent(event: DepositEvent | WithdrawEvent) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO mango_deposits_withdraws (
      signature, event_type, mango_account, timestamp, group_pubkey, amount, token,
      owner, bank, vault, token_account, allow_borrow, signers
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    event.signature,
    event.eventType,
    event.mangoAccount,
    event.timestamp,
    event.groupPubkey,
    event.amount,
    event.token,
    event.owner,
    event.bank,
    event.vault,
    event.tokenAccount,
    false,
    JSON.stringify(event.signers)
  );
}

function saveTradeEvent(event: TradeEvent) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO mango_trades (
      signature, event_type, mango_account, timestamp, group_pubkey, perp_market, serum_market,
      side, price, quantity, client_order_id, order_type, reduce_only, token, owner,
      max_base_quantity, max_quote_quantity, expiry_timestamp, limit, open_orders,
      self_trade_behavior, signers
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    event.signature,
    event.eventType,
    event.mangoAccount,
    event.timestamp,
    event.groupPubkey,
    event.perpMarket ?? null,
    event.serumMarket ?? null,
    event.side,
    event.price,
    event.quantity,
    event.clientOrderId,
    event.orderType,
    event.reduceOnly ? 1 : 0,  // Convert boolean to 1 or 0
    event.token,
    event.owner,
    event.maxBaseQuantity ?? null,
    event.maxQuoteQuantity ?? null,
    event.expiryTimestamp ?? null,
    event.limit,
    event.openOrders ?? null,
    event.selfTradeBehavior ?? null,
    JSON.stringify(event.signers)
  );
}

function saveSwapEvent(event: SwapEvent) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO mango_swaps (
      signature, mango_account, timestamp, group_pubkey, buy_token_index, sell_token_index,
      buy_token, sell_token, owner, buy_bank, sell_bank, max_buy_token_to_release,
      max_sell_token_to_release, signers
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    event.signature,
    event.mangoAccount,
    event.timestamp,
    event.groupPubkey,
    event.buyTokenIndex,
    event.sellTokenIndex,
    event.buyToken,
    event.sellToken,
    event.owner,
    event.buyBank,
    event.sellBank,
    event.maxBuyTokenToRelease,
    event.maxSellTokenToRelease,
    JSON.stringify(event.signers)
  );
}

function saveLiquidationEvent(event: LiquidationEvent) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO mango_liquidations (
      signature, mango_account, timestamp, group_pubkey, liqor, liqee, asset_token_index,
      liab_token_index, asset_token, liab_token, asset_bank, liab_bank, max_liab_transfer, signers
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    event.signature,
    event.mangoAccount,
    event.timestamp,
    event.groupPubkey,
    event.liqor,
    event.liqee,
    event.assetTokenIndex,
    event.liabTokenIndex,
    event.assetToken,
    event.liabToken,
    event.assetBank,
    event.liabBank,
    event.maxLiabTransfer,
    JSON.stringify(event.signers)
  );
}


export function getDepositWithdrawEventsByMangoAccount(mangoAccount: string): (DepositEvent | WithdrawEvent)[] {
  const query = db.prepare(`
    SELECT * FROM mango_deposits_withdraws
    WHERE mango_account = ?
    ORDER BY timestamp DESC
  `);
  return query.all(mangoAccount) as (DepositEvent | WithdrawEvent)[];
}

export function getTradeEventsByMangoAccount(mangoAccount: string): TradeEvent[] {
  const query = db.prepare(`
    SELECT * FROM mango_trades
    WHERE mango_account = ?
    ORDER BY timestamp DESC
  `);
  return query.all(mangoAccount) as TradeEvent[];
}

export function getSwapEventsByMangoAccount(mangoAccount: string): SwapEvent[] {
  const query = db.prepare(`
    SELECT * FROM mango_swaps
    WHERE mango_account = ?
    ORDER BY timestamp DESC
  `);
  return query.all(mangoAccount) as SwapEvent[];
}

export function getLiquidationEventsByMangoAccount(mangoAccount: string): LiquidationEvent[] {
  const query = db.prepare(`
    SELECT * FROM mango_liquidations
    WHERE mango_account = ?
    ORDER BY timestamp DESC
  `);
  return query.all(mangoAccount) as LiquidationEvent[];
}

export function getMangoAccountByOwner(owner: string, accountNumber: number): { mangoAccount: string } | undefined {
  const query = db.prepare(`
    SELECT mangoAccount
    FROM mango_accounts
    WHERE owner = ? AND accountNumber = ?
  `);
  return query.get(owner, accountNumber) as { mangoAccount: string } | undefined;
}

export function getOwnerByMangoAccount(mangoAccount: string): { owner: string, accountNumber: number } | undefined {
  const query = db.prepare(`
    SELECT owner, accountNumber
    FROM mango_accounts
    WHERE mangoAccount = ?
  `);
  return query.get(mangoAccount) as { owner: string, accountNumber: number } | undefined;
}

export function getEventsByMangoAccount(mangoAccount: string): MangoEvent[] {
  const deposits = getDepositWithdrawEventsByMangoAccount(mangoAccount);
  const trades = getTradeEventsByMangoAccount(mangoAccount);
  const swaps = getSwapEventsByMangoAccount(mangoAccount);
  const liquidations = getLiquidationEventsByMangoAccount(mangoAccount);

  return [...deposits, ...trades, ...swaps, ...liquidations].sort((a, b) => b.timestamp - a.timestamp);
}

export function isDepositEvent(event: MangoEvent): event is DepositEvent {
  return event.eventType === 'tokenDeposit';
}

export function isWithdrawEvent(event: MangoEvent): event is WithdrawEvent {
  return event.eventType === 'tokenWithdraw';
}

export function isTradeEvent(event: MangoEvent): event is TradeEvent {
  return event.eventType === 'perpTrade' || event.eventType === 'spotTrade';
}

export function isSwapEvent(event: MangoEvent): event is SwapEvent {
  return event.eventType === 'tokenConditionalSwap';
}

export function isLiquidationEvent(event: MangoEvent): event is LiquidationEvent {
  return event.eventType === 'liquidation';
}

export default db;