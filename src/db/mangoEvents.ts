import { MangoEvent, DepositEvent, WithdrawEvent, TradeEvent, SwapEvent, LiquidationEvent, PerpPlaceOrderEvent, PerpSettlePnlEvent, PerpSettleFeesEvent, PerpForceClosePositionEvent, PerpCancelOrderEvent, PerpCancelAllOrdersEvent, PerpFillEvent, isLiquidationEvent, isPerpCancelAllOrdersEvent, isPerpCancelOrderEvent, isPerpFillEvent, isPerpForceClosePositionEvent, isPerpPlaceOrderEvent, isPerpSettleFeesEvent, isPerpSettlePnlEvent, isSwapEvent, isTradeEvent, isWithdrawEvent, isDepositEvent } from '../types';
import db from './index';

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
      } else if (isPerpPlaceOrderEvent(event)) {
        savePerpPlaceOrderEvent(event);
      } else if (isPerpSettlePnlEvent(event)) {
        savePerpSettlePnlEvent(event);
      } else if (isPerpSettleFeesEvent(event)) {
        savePerpSettleFeesEvent(event);
      } else if (isPerpForceClosePositionEvent(event)) {
        savePerpForceClosePositionEvent(event);
      } else if (isPerpCancelOrderEvent(event)) {
        savePerpCancelOrderEvent(event);
      } else if (isPerpCancelAllOrdersEvent(event)) {
        savePerpCancelAllOrdersEvent(event);
      } else if (isPerpFillEvent(event)) {
        savePerpFillEvent(event);
      } else {
        console.error('Unknown event type:', event);
      }
    })();
  }

export function getEventsByMangoAccount(mangoAccount: string): MangoEvent[] {
    const deposits = getDepositWithdrawEventsByMangoAccount(mangoAccount);
    const trades = getTradeEventsByMangoAccount(mangoAccount);
    const swaps = getSwapEventsByMangoAccount(mangoAccount);
    const liquidations = getLiquidationEventsByMangoAccount(mangoAccount);
    const perpCancelOrders = getPerpCancelOrderEventsByMangoAccount(mangoAccount);
    const perpCancelAllOrders = getPerpCancelAllOrdersEventsByMangoAccount(mangoAccount);
    const perpFills = getPerpFillEventsByMangoAccount(mangoAccount);
  
    return [...deposits, ...trades, ...swaps, ...liquidations, ...perpCancelOrders, ...perpCancelAllOrders, ...perpFills].sort((a, b) => b.timestamp - a.timestamp);
}

function getDepositWithdrawEventsByMangoAccount(mangoAccount: string): (DepositEvent | WithdrawEvent)[] {
    const stmt = db.prepare(`
      SELECT * FROM deposit_withdraw_events
      WHERE mango_account = ?
    `);
    const events = stmt.all(mangoAccount) as (DepositEvent | WithdrawEvent)[];
    return events.map(event => ({
      ...event,
      signers: JSON.parse(event.signers.toString()),
    }));
  }

  function getTradeEventsByMangoAccount(mangoAccount: string): TradeEvent[] {
    const stmt = db.prepare(`
      SELECT * FROM trade_events
      WHERE mango_account = ?
    `);
    const events = stmt.all(mangoAccount) as TradeEvent[];
    return events.map(event => ({
      ...event,
      signers: JSON.parse(event.signers.toString()),
      reduceOnly: Boolean(event.reduceOnly),
    }));
  }

  function getSwapEventsByMangoAccount(mangoAccount: string): SwapEvent[] {
    const stmt = db.prepare(`
      SELECT * FROM swap_events
      WHERE mango_account = ?
    `);
    const events = stmt.all(mangoAccount) as SwapEvent[];
    return events.map(event => ({
      ...event,
      signers: JSON.parse(event.signers.toString()),
    }));
  }

  function getLiquidationEventsByMangoAccount(mangoAccount: string): LiquidationEvent[] {
  const stmt = db.prepare(`
    SELECT * FROM liquidation_events
    WHERE mango_account = ?
  `);
  const events = stmt.all(mangoAccount) as LiquidationEvent[];
  return events.map(event => ({
    ...event,
    signers: JSON.parse(event.signers.toString()),
  }));
}

function getPerpCancelOrderEventsByMangoAccount(mangoAccount: string): PerpCancelOrderEvent[] {
    const stmt = db.prepare(`
      SELECT * FROM perp_cancel_order_events
      WHERE mango_account = ?
    `);
    const events = stmt.all(mangoAccount) as PerpCancelOrderEvent[];
    return events.map(event => ({
      ...event,
      signers: JSON.parse(event.signers.toString()),
    }));
  }

  function getPerpCancelAllOrdersEventsByMangoAccount(mangoAccount: string): PerpCancelAllOrdersEvent[] {
    const stmt = db.prepare(`
      SELECT * FROM perp_cancel_all_orders_events
      WHERE mango_account = ?
    `);
    const events = stmt.all(mangoAccount) as PerpCancelAllOrdersEvent[];
    return events.map(event => ({
      ...event,
      signers: JSON.parse(event.signers.toString()),
    }));
  }

  function getPerpFillEventsByMangoAccount(mangoAccount: string): PerpFillEvent[] {
    const stmt = db.prepare(`
      SELECT * FROM perp_fill_events
      WHERE mango_account = ?
    `);
    const events = stmt.all(mangoAccount) as PerpFillEvent[];
    return events.map(event => ({
      ...event,
      signers: JSON.parse(event.signers.toString()),
    }));
  }

function saveDepositWithdrawEvent(event: DepositEvent | WithdrawEvent): number {
    const stmt = db.prepare(`
      INSERT INTO deposit_withdraw_events (
        signature, event_type, mango_account, timestamp, group_pubkey, signers,
        amount, token, owner, bank, vault, token_account
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    const result = stmt.run(
      event.signature,
      event.eventType,
      event.mangoAccount,
      event.timestamp,
      event.groupPubkey,
      JSON.stringify(event.signers),
      event.amount,
      event.token,
      event.owner,
      event.bank,
      event.vault,
      event.tokenAccount
    );
  
    return result.lastInsertRowid as number;
  }

  function saveTradeEvent(event: TradeEvent): number {
    const stmt = db.prepare(`
      INSERT INTO trade_events (
        signature, event_type, mango_account, timestamp, group_pubkey, signers,
        perp_market, serum_market, side, price, quantity, client_order_id, order_type,
        reduce_only, token, owner, max_base_quantity, max_quote_quantity, expiry_timestamp,
        "limit", open_orders, self_trade_behavior
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    const result = stmt.run(
      event.signature,
      event.eventType,
      event.mangoAccount,
      event.timestamp,
      event.groupPubkey,
      JSON.stringify(event.signers),
      event.perpMarket || null,
      event.serumMarket || null,
      event.side,
      event.price,
      event.quantity,
      event.clientOrderId,
      event.orderType,
      event.reduceOnly ? 1 : 0,
      event.token,
      event.owner,
      event.maxBaseQuantity || null,
      event.maxQuoteQuantity || null,
      event.expiryTimestamp || null,
      event.limit,
      event.openOrders || null,
      event.selfTradeBehavior || null
    );
  
    return result.lastInsertRowid as number;
  }

  function savePerpPlaceOrderEvent(event: PerpPlaceOrderEvent): number {
    const stmt = db.prepare(`
      INSERT INTO perp_place_order_events (
        signature, event_type, mango_account, timestamp, group_pubkey, signers,
        perp_market, side, price, quantity, client_order_id, order_type,
        reduce_only, token, owner, max_base_quantity, max_quote_quantity, expiry_timestamp, "limit"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    const result = stmt.run(
      event.signature,
      event.eventType,
      event.mangoAccount,
      event.timestamp,
      event.groupPubkey,
      JSON.stringify(event.signers),
      event.perpMarket,
      event.side,
      event.price,
      event.quantity,
      event.clientOrderId,
      event.orderType,
      event.reduceOnly ? 1 : 0,
      event.token,
      event.owner,
      event.maxBaseQuantity,
      event.maxQuoteQuantity,
      event.expiryTimestamp,
      event.limit
    );
  
    return result.lastInsertRowid as number;
  }
  
  function savePerpSettlePnlEvent(event: PerpSettlePnlEvent): number {
    const stmt = db.prepare(`
      INSERT INTO perp_settle_pnl_events (
        signature, event_type, mango_account, timestamp, group_pubkey, signers,
        perp_market, token, account_a, account_b
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    const result = stmt.run(
      event.signature,
      event.eventType,
      event.mangoAccount,
      event.timestamp,
      event.groupPubkey,
      JSON.stringify(event.signers),
      event.perpMarket,
      event.token,
      event.accountA,
      event.accountB
    );
  
    return result.lastInsertRowid as number;
  }
  
  function savePerpSettleFeesEvent(event: PerpSettleFeesEvent): number {
    const stmt = db.prepare(`
      INSERT INTO perp_settle_fees_events (
        signature, event_type, mango_account, timestamp, group_pubkey, signers,
        perp_market, token, fee_account
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    const result = stmt.run(
      event.signature,
      event.eventType,
      event.mangoAccount,
      event.timestamp,
      event.groupPubkey,
      JSON.stringify(event.signers),
      event.perpMarket,
      event.token,
      event.feeAccount
    );
  
    return result.lastInsertRowid as number;
  }
  
  function savePerpForceClosePositionEvent(event: PerpForceClosePositionEvent): number {
    const stmt = db.prepare(`
      INSERT INTO perp_force_close_position_events (
        signature, event_type, mango_account, timestamp, group_pubkey, signers,
        perp_market, token, liqor, liqor_owner, base_transfer
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    const result = stmt.run(
      event.signature,
      event.eventType,
      event.mangoAccount,
      event.timestamp,
      event.groupPubkey,
      JSON.stringify(event.signers),
      event.perpMarket,
      event.token,
      event.liqor,
      event.liqorOwner,
      event.baseTransfer
    );
  
    return result.lastInsertRowid as number;
  }

function saveSwapEvent(event: SwapEvent): number {
  const stmt = db.prepare(`
    INSERT INTO swap_events (
      buy_token_index, sell_token_index, buy_token, sell_token, owner,
      buy_bank, sell_bank, max_buy_token_to_release, max_sell_token_to_release
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    event.buyTokenIndex,
    event.sellTokenIndex,
    event.buyToken,
    event.sellToken,
    event.owner,
    event.buyBank,
    event.sellBank,
    event.maxBuyTokenToRelease,
    event.maxSellTokenToRelease
  );

  return result.lastInsertRowid as number;
}

function saveLiquidationEvent(event: LiquidationEvent): number {
  const stmt = db.prepare(`
    INSERT INTO liquidation_events (
      liqor, liqee, asset_token_index, liab_token_index, asset_token,
      liab_token, asset_bank, liab_bank, max_liab_transfer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    event.liqor,
    event.liqee,
    event.assetTokenIndex,
    event.liabTokenIndex,
    event.assetToken,
    event.liabToken,
    event.assetBank,
    event.liabBank,
    event.maxLiabTransfer
  );

  return result.lastInsertRowid as number;
}

function savePerpCancelOrderEvent(event: PerpCancelOrderEvent) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO perp_cancel_order_events (
        signature, mango_account, timestamp, group_pubkey, perp_market, order_id,
        client_order_id, token, owner, signers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    stmt.run(
      event.signature,
      event.mangoAccount,
      event.timestamp,
      event.groupPubkey,
      event.perpMarket,
      event.orderId,
      event.clientOrderId,
      event.token,
      event.owner,
      JSON.stringify(event.signers)
    );
  }
  
  function savePerpCancelAllOrdersEvent(event: PerpCancelAllOrdersEvent) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO perp_cancel_all_orders_events (
        signature, mango_account, timestamp, group_pubkey, perp_market, limit,
        token, owner, signers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    stmt.run(
      event.signature,
      event.mangoAccount,
      event.timestamp,
      event.groupPubkey,
      event.perpMarket,
      event.limit,
      event.token,
      event.owner,
      JSON.stringify(event.signers)
    );
  }
  
  function savePerpFillEvent(event: PerpFillEvent) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO perp_fill_events (
        signature, mango_account, timestamp, group_pubkey, perp_market, maker,
        taker, maker_order_id, taker_order_id, maker_fee, taker_fee, price,
        quantity, token, signers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    stmt.run(
      event.signature,
      event.mangoAccount,
      event.timestamp,
      event.groupPubkey,
      event.perpMarket,
      event.maker,
      event.taker,
      event.makerOrderId,
      event.takerOrderId,
      event.makerFee,
      event.takerFee,
      event.price,
      event.quantity,
      event.token,
      JSON.stringify(event.signers)
    );
}