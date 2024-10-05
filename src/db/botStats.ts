import db from './index';
import { BotData } from '../types';

export function updateBotStats(mangoAccount: string, stats: {
  pnl: number,
  portfolioValue: number,
  accuracy: number,
  sharpeRatio: number,
  apr: number
}) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bot_stats (
      mango_account, pnl, portfolio_value, accuracy, sharpe_ratio, apr, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    mangoAccount,
    stats.pnl,
    stats.portfolioValue,
    stats.accuracy,
    stats.sharpeRatio,
    stats.apr,
    Date.now()
  );
}

export function updateBotDailyStats(mangoAccount: string, date: string, pnl: number, portfolioValue: number) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bot_daily_stats (
      mango_account, date, pnl, portfolio_value
    ) VALUES (?, ?, ?, ?)
  `);

  stmt.run(mangoAccount, date, pnl, portfolioValue);
}

export function getUserBotsData(userAddress: string): BotData[] {
    const userBots = db.prepare(`
        SELECT ma.mangoAccount, ma.accountNumber as id, ma.active, 
               bs.pnl, bs.portfolio_value as portfolio, bs.accuracy, bs.sharpe_ratio, bs.apr
        FROM mango_accounts ma
        LEFT JOIN bot_stats bs ON ma.mangoAccount = bs.mango_account
        WHERE ma.owner = ?
        ORDER BY ma.accountNumber ASC
      `).all(userAddress) as (Omit<BotData, 'events'> & { active: number })[];

  if (userBots.length === 0) {
    return [];
  }

  const botsData: BotData[] = userBots.map(bot => {
    const events = db.prepare(`
        SELECT 
          CASE 
            WHEN me.event_type = 'tokenDeposit' THEN 'deposit'
            WHEN me.event_type = 'tokenWithdraw' THEN 'withdraw'
            WHEN me.event_type IN ('perpTrade', 'spotTrade') THEN 'trade'
          END as event_category,
          me.timestamp,
          COALESCE(dwe.amount, te.quantity) as amount,
          COALESCE(dwe.token, te.token) as token,
          te.price,
          te.quantity,
          te.side
        FROM mango_events me
        LEFT JOIN deposit_withdraw_events dwe ON me.event_id = dwe.id AND me.event_type IN ('tokenDeposit', 'tokenWithdraw')
        LEFT JOIN trade_events te ON me.event_id = te.id AND me.event_type IN ('perpTrade', 'spotTrade')
        WHERE me.mango_account = ? AND me.event_type IN ('tokenDeposit', 'tokenWithdraw', 'perpTrade', 'spotTrade')
        ORDER BY me.timestamp DESC
        LIMIT 30
      `).all(bot.mangoAccount) as BotData['events'];

    console.log(bot)
    return {
      id: bot.id,
      name: `Bot ${bot.id}`,
      status: bot.active ? 'Active' : 'Stopped',
      mangoAccount: bot.mangoAccount,
      pnl: {
        value: bot.pnl ? bot.pnl.value : 0,
        percentage: 0, // Calculate this based on initial investment
        isPositive: (bot.pnl ? bot.pnl.value : 0) >= 0,
        chartData: [], // You'll need to implement a function to get this data
      },
      portfolio: bot.portfolio || 0,
      accuracy: bot.accuracy || 0,
      sharpeRatio: bot.sharpeRatio || 0,
      apr: bot.apr || 0,
      delegate: bot.mangoAccount,
      events
    };
  });

  return botsData;
}

export function getDailyPortfolioValuesByMangoAccount(mangoAccount: string, days: number = 30): { date: string, portfolio_value: number }[] {
  const query = db.prepare(`
    SELECT date, portfolio_value
    FROM bot_daily_stats
    WHERE mango_account = ?
    ORDER BY date DESC
    LIMIT ?
  `);
  return query.all(mangoAccount, days) as { date: string, portfolio_value: number }[];
}