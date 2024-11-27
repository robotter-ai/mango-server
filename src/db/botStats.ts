import db from "./index";
import { BotData } from "../types";
import { getMangoClient, getMangoGroup } from "../mango";
import { PublicKey } from "@solana/web3.js";

export function updateBotStats(
  mangoAccount: string,
  stats: {
    pnl: number;
    portfolioValue: number;
    accuracy: number;
    sharpeRatio: number;
    apr: number;
  },
) {
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
    Date.now(),
  );
}

export function updateBotDailyStats(
  mangoAccount: string,
  date: string,
  pnl: number,
  portfolioValue: number,
) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bot_daily_stats (
      mango_account, date, pnl, portfolio_value
    ) VALUES (?, ?, ?, ?)
  `);

  stmt.run(mangoAccount, date, pnl, portfolioValue);
}

export async function getUserBotsData(userAddress: string): Promise<BotData[]> {
  const mangoClient = getMangoClient();
  const mangoGroup = getMangoGroup();

  const existingBots = db
    .prepare(
      `
    SELECT ma.mangoAccount, ma.accountNumber as id, ma.active
    FROM mango_accounts ma
    WHERE ma.owner = ?
    ORDER BY ma.accountNumber ASC
  `,
    )
    .all(userAddress) as { mangoAccount: string; id: number; active: number }[];

  /*  const accounts = await mangoClient.getMangoAccountsForOwner(mangoGroup, new PublicKey(userAddress))

  const mangoAccounts = accounts.map(x => { 
    return{
      mangoAccount: x.publicKey.toBase58(), 
      id: x.accountNum, 
      active: 0
    }
  })

  const mergedBots = [...existingBots, ...mangoAccounts]
*/
  return await Promise.all(
    existingBots.map(async (bot) => {
      const mangoAccountAddress = new PublicKey(bot.mangoAccount);
      let onChainAccount;
      try {
        onChainAccount = await mangoClient.getMangoAccount(mangoAccountAddress);
      } catch (error) {
        console.log(`Account ${bot.mangoAccount} not found on-chain`);
      }

      // const events = getEventsByMangoAccount(bot.mangoAccount);

      const equity = onChainAccount
        ? onChainAccount.getEquity(mangoGroup).toNumber()
        : 0;
      const pnl = onChainAccount
        ? onChainAccount.getPnl(mangoGroup).toNumber()
        : 0;

      return {
        id: bot.id,
        name: `Bot ${bot.id}`,
        status: onChainAccount ? "Active" : "Stopped",
        mangoAccount: bot.mangoAccount,
        pnl: {
          value: pnl,
          percentage: equity !== 0 ? (pnl / equity) * 100 : 0,
          isPositive: pnl >= 0,
          chartData: [], // You'll need to implement a function to get this data
        },
        portfolio: equity,
        accuracy: 0, // You'll need to calculate this based on trade history
        sharpeRatio: 0, // You'll need to calculate this based on historical data
        apr: 0, // You'll need to calculate this based on historical data
        delegate: onChainAccount ? onChainAccount.delegate.toString() : "",
        events: [],
      };
    }),
  );
}

export function getSingleBotData(mangoAccount: string): BotData | null {
  const botData = db
    .prepare(
      `
    SELECT ma.mangoAccount, ma.accountNumber as id, ma.active, ma.owner,
           bs.pnl, bs.portfolio_value as portfolio, bs.accuracy, bs.sharpe_ratio, bs.apr
    FROM mango_accounts ma
    LEFT JOIN bot_stats bs ON ma.mangoAccount = bs.mango_account
    WHERE ma.mangoAccount = ?
  `,
    )
    .get(mangoAccount) as
    | (Omit<BotData, "events"> & { active: number; owner: string })
    | undefined;

  if (!botData) return null;

  const events = db
    .prepare(
      `
    SELECT 
      CASE 
        WHEN event_type IN ('tokenDeposit', 'tokenWithdraw') THEN 
          CASE 
            WHEN event_type = 'tokenDeposit' THEN 'deposit'
            ELSE 'withdraw'
          END
        ELSE 'trade'
      END as event_category,
      timestamp,
      CASE 
        WHEN event_type IN ('tokenDeposit', 'tokenWithdraw') THEN amount
        ELSE quantity
      END as amount,
      token,
      price,
      quantity,
      side
    FROM (
      SELECT event_type, timestamp, amount, token, NULL as price, NULL as quantity, NULL as side
      FROM deposit_withdraw_events
      WHERE mango_account = ?
      UNION ALL
      SELECT event_type, timestamp, NULL as amount, token, price, quantity, side
      FROM trade_events
      WHERE mango_account = ?
    )
    ORDER BY timestamp DESC
    LIMIT 30
  `,
    )
    .all(mangoAccount, mangoAccount) as BotData["events"];

  return {
    id: botData.id,
    name: `Bot ${botData.id}`,
    status: botData.active ? "Active" : "Stopped",
    mangoAccount: botData.mangoAccount,
    pnl: {
      value: botData.pnl?.value || 0,
      percentage: 0, // Calculate this based on initial investment
      isPositive: (botData.pnl?.value || 0) >= 0,
      chartData: [], // You'll need to implement a function to get this data
    },
    portfolio: botData.portfolio || 0,
    accuracy: botData.accuracy || 0,
    sharpeRatio: botData.sharpeRatio || 0,
    apr: botData.apr || 0,
    delegate: botData.mangoAccount,
    events,
  };
}

export function getDailyPortfolioValuesByMangoAccount(
  mangoAccount: string,
  days: number = 30,
): { date: string; portfolio_value: number }[] {
  const query = db.prepare(`
    SELECT date, portfolio_value
    FROM bot_daily_stats
    WHERE mango_account = ?
    ORDER BY date DESC
    LIMIT ?
  `);
  return query.all(mangoAccount, days) as {
    date: string;
    portfolio_value: number;
  }[];
}
