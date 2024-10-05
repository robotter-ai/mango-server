import { MangoEvent, DepositEvent, WithdrawEvent, TradeEvent, SwapEvent, LiquidationEvent, PerpPlaceOrderEvent, PerpSettlePnlEvent, PerpSettleFeesEvent, PerpForceClosePositionEvent } from '../types';
import db from './index';

export function saveMangoEvent(event: MangoEvent) {
  return db.transaction(() => {
    let eventId: number;

    switch (event.eventType) {
        case 'tokenDeposit':
        case 'tokenWithdraw':
          eventId = saveDepositWithdrawEvent(event);
          break;
        case 'perpTrade':
        case 'spotTrade':
          eventId = saveTradeEvent(event);
          break;
        case 'tokenConditionalSwap':
          eventId = saveSwapEvent(event);
          break;
        case 'liquidation':
          eventId = saveLiquidationEvent(event);
          break;
        case 'perpPlaceOrder':
          eventId = savePerpPlaceOrderEvent(event);
          break;
        case 'perpSettlePnl':
          eventId = savePerpSettlePnlEvent(event);
          break;
        case 'perpSettleFees':
          eventId = savePerpSettleFeesEvent(event);
          break;
        case 'perpForceClosePosition':
          eventId = savePerpForceClosePositionEvent(event);
          break;
        default:
          throw new Error(`Unknown event type: ${(event as any).eventType}`);
      }

    const stmt = db.prepare(`
      INSERT INTO mango_events (
        signature, event_type, mango_account, timestamp, group_pubkey, signers, event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.signature,
      event.eventType,
      event.mangoAccount,
      event.timestamp,
      event.groupPubkey,
      JSON.stringify(event.signers),
      eventId
    );
  })();
}

function saveDepositWithdrawEvent(event: DepositEvent | WithdrawEvent): number {
  const stmt = db.prepare(`
    INSERT INTO deposit_withdraw_events (
      amount, token, owner, bank, vault, token_account
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
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
        perp_market, serum_market, side, price, quantity, client_order_id, order_type,
        reduce_only, token, owner, max_base_quantity, max_quote_quantity, expiry_timestamp,
        "limit", open_orders, self_trade_behavior
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    const result = stmt.run(
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
        perp_market, side, price, quantity, client_order_id, order_type,
        reduce_only, token, owner, max_base_quantity, max_quote_quantity, expiry_timestamp, "limit"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  
    const result = stmt.run(
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
        perp_market, token, account_a, account_b
      ) VALUES (?, ?, ?, ?)
    `);
  
    const result = stmt.run(
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
        perp_market, token, fee_account
      ) VALUES (?, ?, ?)
    `);
  
    const result = stmt.run(
      event.perpMarket,
      event.token,
      event.feeAccount
    );
  
    return result.lastInsertRowid as number;
  }
  
  function savePerpForceClosePositionEvent(event: PerpForceClosePositionEvent): number {
    const stmt = db.prepare(`
      INSERT INTO perp_force_close_position_events (
        perp_market, token, liqor, liqor_owner, base_transfer
      ) VALUES (?, ?, ?, ?, ?)
    `);
  
    const result = stmt.run(
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

export function getEventsByMangoAccount(mangoAccount: string): MangoEvent[] {
    const query = db.prepare(`
      SELECT me.*, 
             dwe.*, te.*, se.*, le.*,
             ppoe.*, pspe.*, psfe.*, pfcpe.*
      FROM mango_events me
      LEFT JOIN deposit_withdraw_events dwe ON me.event_id = dwe.id AND me.event_type IN ('tokenDeposit', 'tokenWithdraw')
      LEFT JOIN trade_events te ON me.event_id = te.id AND me.event_type IN ('perpTrade', 'spotTrade')
      LEFT JOIN swap_events se ON me.event_id = se.id AND me.event_type = 'tokenConditionalSwap'
      LEFT JOIN liquidation_events le ON me.event_id = le.id AND me.event_type = 'liquidation'
      LEFT JOIN perp_place_order_events ppoe ON me.event_id = ppoe.id AND me.event_type = 'perpPlaceOrder'
      LEFT JOIN perp_settle_pnl_events pspe ON me.event_id = pspe.id AND me.event_type = 'perpSettlePnl'
      LEFT JOIN perp_settle_fees_events psfe ON me.event_id = psfe.id AND me.event_type = 'perpSettleFees'
      LEFT JOIN perp_force_close_position_events pfcpe ON me.event_id = pfcpe.id AND me.event_type = 'perpForceClosePosition'
      WHERE me.mango_account = ?
      ORDER BY me.timestamp DESC
    `);
    
    const events = query.all(mangoAccount) as any[];
    return events.map(event => ({
      ...event,
      signers: JSON.parse(event.signers),
      reduceOnly: Boolean(event.reduce_only),
    }));
}