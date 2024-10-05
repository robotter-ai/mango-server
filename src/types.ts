export type MangoEventType = 'tokenDeposit' | 'tokenWithdraw' | 'perpTrade' | 'spotTrade' | 'tokenConditionalSwap' | 'liquidation' | 'perpPlaceOrder' | 'perpSettlePnl' | 'perpSettleFees' | 'perpForceClosePosition';

export interface BaseMangoEvent {
    signature: string;
    eventType: MangoEventType;
    mangoAccount: string;
    timestamp: number;
    groupPubkey: string;
    signers: string[];  
}

export interface DepositEvent extends BaseMangoEvent {
    eventType: 'tokenDeposit';
    amount: string;
    token: string;
    owner: string;
    bank: string;
    vault: string;
    tokenAccount: string;
}

export interface WithdrawEvent extends BaseMangoEvent {
    eventType: 'tokenWithdraw';
    amount: string;
    token: string;
    owner: string;
    bank: string;
    vault: string;
    tokenAccount: string;
}

export interface TradeEvent extends BaseMangoEvent {
    eventType: 'perpTrade' | 'spotTrade';
    perpMarket?: string;
    serumMarket?: string;
    side: 'buy' | 'sell';
    price: string;
    quantity: string;
    clientOrderId: string;
    orderType: string;
    reduceOnly?: boolean;
    token: string;
    owner: string;
    maxBaseQuantity?: string;
    maxQuoteQuantity?: string;
    expiryTimestamp?: string;
    limit: string;
    openOrders?: string;
    selfTradeBehavior?: string;
}

export interface SwapEvent extends BaseMangoEvent {
    eventType: 'tokenConditionalSwap';
    buyTokenIndex: number;
    sellTokenIndex: number;
    buyToken: string;
    sellToken: string;
    owner: string;
    buyBank: string;
    sellBank: string;
    maxBuyTokenToRelease: string;
    maxSellTokenToRelease: string;
}

export interface LiquidationEvent extends BaseMangoEvent {
    eventType: 'liquidation';
    liqor: string;
    liqee: string;
    assetTokenIndex: number;
    liabTokenIndex: number;
    assetToken: string;
    liabToken: string;
    assetBank: string;
    liabBank: string;
    maxLiabTransfer: string;
}

export interface PerpPlaceOrderEvent extends BaseMangoEvent {
    eventType: 'perpPlaceOrder';
    perpMarket: string;
    side: 'buy' | 'sell';
    price: string;
    quantity: string;
    clientOrderId: string;
    orderType: string;
    reduceOnly: boolean;
    token: string;
    owner: string;
    maxBaseQuantity: string;
    maxQuoteQuantity: string;
    expiryTimestamp: string;
    limit: string;
}

export interface PerpSettlePnlEvent extends BaseMangoEvent {
    eventType: 'perpSettlePnl';
    perpMarket: string;
    token: string;
    accountA: string;
    accountB: string;
}

export interface PerpSettleFeesEvent extends BaseMangoEvent {
    eventType: 'perpSettleFees';
    perpMarket: string;
    token: string;
    feeAccount: string;
}

export interface PerpForceClosePositionEvent extends BaseMangoEvent {
    eventType: 'perpForceClosePosition';
    perpMarket: string;
    token: string;
    liqor: string;
    liqorOwner: string;
    baseTransfer: string;
}

export type MangoEvent = DepositEvent | WithdrawEvent | TradeEvent | SwapEvent | LiquidationEvent | PerpPlaceOrderEvent | PerpSettlePnlEvent | PerpSettleFeesEvent | PerpForceClosePositionEvent;

export interface BotData {
    id: number;
    name: string;
    status: 'Active' | 'Stopped';
    mangoAccount: string; 
    pnl: {
      value: number;
      percentage: number;
      isPositive: boolean;
      chartData: number[];
    };
    portfolio: number;
    accuracy: number;
    sharpeRatio: number;
    apr: number;
    delegate: string;
    events: {
      event_category: 'deposit' | 'withdraw' | 'trade';
      timestamp: string;
      [key: string]: any;
    }[];
}