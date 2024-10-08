import db from './db/index';
import { TradeEvent, DepositEvent, WithdrawEvent } from './types';

export function calculatePNL(mangoAccount: string): number {
  const depositWithdrawQuery = db.prepare(`
    SELECT event_type, amount
    FROM deposit_withdraw_events
    WHERE mango_account = ?
  `);
  const depositWithdrawEvents = depositWithdrawQuery.all(mangoAccount) as (DepositEvent | WithdrawEvent)[];

  const tradeQuery = db.prepare(`
    SELECT side, price, quantity
    FROM trade_events
    WHERE mango_account = ?
  `);
  const trades = tradeQuery.all(mangoAccount) as TradeEvent[];

  let totalPnL = 0;

  for (const event of depositWithdrawEvents) {
    if (event.eventType === 'tokenDeposit') {
      totalPnL -= parseFloat(event.amount);
    } else if (event.eventType === 'tokenWithdraw') {
      totalPnL += parseFloat(event.amount);
    }
  }

  for (const trade of trades) {
    const tradeValue = parseFloat(trade.price) * parseFloat(trade.quantity);
    totalPnL += trade.side === 'buy' ? -tradeValue : tradeValue;
  }

  return totalPnL;
}

export function calculatePortfolio(mangoAccount: string): number {
  const query = db.prepare(`
    SELECT portfolio_value
    FROM bot_daily_stats
    WHERE mango_account = ?
    ORDER BY date DESC
    LIMIT 1
  `);
  const result = query.get(mangoAccount) as { portfolio_value: number } | undefined;
  return result ? result.portfolio_value : 0;
}

export function calculateAccuracy(mangoAccount: string): number {
  const query = db.prepare(`
    SELECT side, price
    FROM trade_events
    WHERE mango_account = ?
    ORDER BY timestamp ASC
  `);
  const trades = query.all(mangoAccount) as TradeEvent[];

  let profitableTrades = 0;
  let totalTrades = 0;

  for (let i = 1; i < trades.length; i++) {
    const prevTrade = trades[i - 1];
    const currentTrade = trades[i];

    if (prevTrade.side !== currentTrade.side) {
      const prevPrice = parseFloat(prevTrade.price);
      const currentPrice = parseFloat(currentTrade.price);

      if ((prevTrade.side === 'buy' && currentPrice > prevPrice) ||
          (prevTrade.side === 'sell' && currentPrice < prevPrice)) {
        profitableTrades++;
      }
      totalTrades++;
    }
  }

  return totalTrades > 0 ? profitableTrades / totalTrades : 0;
}

export function calculateSharpeRatio(mangoAccount: string): number {
  const query = db.prepare(`
    SELECT portfolio_value
    FROM bot_daily_stats
    WHERE mango_account = ?
    ORDER BY date ASC
  `);
  const dailyValues = query.all(mangoAccount) as { portfolio_value: number }[];

  if (dailyValues.length < 2) return 0;

  const dailyReturns = [];
  for (let i = 1; i < dailyValues.length; i++) {
    const prevValue = dailyValues[i - 1].portfolio_value;
    const currentValue = dailyValues[i].portfolio_value;
    dailyReturns.push((currentValue - prevValue) / prevValue);
  }

  const avgReturn = dailyReturns.reduce((sum, return_) => sum + return_, 0) / dailyReturns.length;
  const stdDev = Math.sqrt(dailyReturns.reduce((sum, return_) => sum + Math.pow(return_ - avgReturn, 2), 0) / dailyReturns.length);

  const annualizedReturn = avgReturn * 365;
  const annualizedStdDev = stdDev * Math.sqrt(365);

  return (annualizedReturn - 0.02) / annualizedStdDev; // Assuming 2% risk-free rate
}

export function calculateAPR(mangoAccount: string): number {
  const query = db.prepare(`
    SELECT portfolio_value, date
    FROM bot_daily_stats
    WHERE mango_account = ?
    ORDER BY date ASC
  `);
  const dailyValues = query.all(mangoAccount) as { portfolio_value: number, date: string }[];

  if (dailyValues.length < 2) return 0;

  const oldestValue = dailyValues[0].portfolio_value;
  const newestValue = dailyValues[dailyValues.length - 1].portfolio_value;
  const startDate = new Date(dailyValues[0].date);
  const endDate = new Date(dailyValues[dailyValues.length - 1].date);
  const daysPassed = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

  const totalReturn = (newestValue - oldestValue) / oldestValue;
  const annualizedReturn = Math.pow(1 + totalReturn, 365 / daysPassed) - 1;

  return annualizedReturn * 100; // Convert to percentage
}