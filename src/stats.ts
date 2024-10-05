import { getDepositWithdrawSumByMangoAccount, getTradesByMangoAccount, getDailyPortfolioValuesByMangoAccount } from './db';

export function calculatePNL(mangoAccount: string): number {
  const { deposits, withdrawals } = getDepositWithdrawSumByMangoAccount(mangoAccount);
  const trades = getTradesByMangoAccount(mangoAccount);
  
  let totalPnL = 0;
  for (const trade of trades) {
    const tradeValue = parseFloat(trade.price) * parseFloat(trade.quantity);
    totalPnL += trade.side === 'buy' ? -tradeValue : tradeValue;
  }
  
  return totalPnL + withdrawals - deposits;
}

export function calculatePortfolio(mangoAccount: string): number {
  const dailyValues = getDailyPortfolioValuesByMangoAccount(mangoAccount, 1);
  return dailyValues.length > 0 ? dailyValues[0].portfolio_value : 0;
}

export function calculateAccuracy(mangoAccount: string): number {
  const trades = getTradesByMangoAccount(mangoAccount);
  let profitableTrades = 0;
  
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
    }
  }
  
  return trades.length > 1 ? profitableTrades / (trades.length - 1) : 0;
}

export function calculateSharpeRatio(mangoAccount: string): number {
  const dailyValues = getDailyPortfolioValuesByMangoAccount(mangoAccount);
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
  const dailyValues = getDailyPortfolioValuesByMangoAccount(mangoAccount);
  if (dailyValues.length < 2) return 0;
  
  const oldestValue = dailyValues[dailyValues.length - 1].portfolio_value;
  const newestValue = dailyValues[0].portfolio_value;
  const daysPassed = dailyValues.length;
  
  const totalReturn = (newestValue - oldestValue) / oldestValue;
  const annualizedReturn = Math.pow(1 + totalReturn, 365 / daysPassed) - 1;
  
  return annualizedReturn * 100; // Convert to percentage
}