import Database from "bun:sqlite";

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

  db.query(`CREATE TABLE IF NOT EXISTS "mango_events" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signature TEXT NOT NULL,
    event_type TEXT NOT NULL,
    mango_account TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    group_pubkey TEXT NOT NULL,
    signers TEXT NOT NULL,
    event_id INTEGER NOT NULL,
    UNIQUE(signature, event_type)
  )`).run();

  db.query(`CREATE TABLE IF NOT EXISTS "deposit_withdraw_events" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount TEXT NOT NULL,
    token TEXT NOT NULL,
    owner TEXT NOT NULL,
    bank TEXT NOT NULL,
    vault TEXT NOT NULL,
    token_account TEXT NOT NULL
  )`).run();

  db.query(`CREATE TABLE IF NOT EXISTS "trade_events" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    self_trade_behavior TEXT
  )`).run();

  db.query(`CREATE TABLE IF NOT EXISTS "swap_events" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buy_token_index INTEGER NOT NULL,
    sell_token_index INTEGER NOT NULL,
    buy_token TEXT NOT NULL,
    sell_token TEXT NOT NULL,
    owner TEXT NOT NULL,
    buy_bank TEXT NOT NULL,
    sell_bank TEXT NOT NULL,
    max_buy_token_to_release TEXT NOT NULL,
    max_sell_token_to_release TEXT NOT NULL
  )`).run();

  db.query(`CREATE TABLE IF NOT EXISTS "liquidation_events" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    liqor TEXT NOT NULL,
    liqee TEXT NOT NULL,
    asset_token_index INTEGER NOT NULL,
    liab_token_index INTEGER NOT NULL,
    asset_token TEXT NOT NULL,
    liab_token TEXT NOT NULL,
    asset_bank TEXT NOT NULL,
    liab_bank TEXT NOT NULL,
    max_liab_transfer TEXT NOT NULL
  )`).run();

  db.query(`CREATE TABLE IF NOT EXISTS "bot_stats" (
    mango_account TEXT PRIMARY KEY,
    pnl REAL,
    portfolio_value REAL,
    accuracy REAL,
    sharpe_ratio REAL,
    apr REAL,
    last_updated INTEGER
  )`).run();

  db.query(`CREATE TABLE IF NOT EXISTS "bot_daily_stats" (
    mango_account TEXT,
    date TEXT,
    pnl REAL,
    portfolio_value REAL,
    PRIMARY KEY (mango_account, date)
  )`).run();

  db.query(`CREATE INDEX IF NOT EXISTS idx_mango_account ON mango_events (mango_account)`).run();
  db.query(`CREATE INDEX IF NOT EXISTS idx_timestamp ON mango_events (timestamp)`).run();
}

export default db;