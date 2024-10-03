export type MangoEventType = 'tokenDeposit' | 'tokenWithdraw' | 'perpTrade' | 'spotTrade' | 'tokenConditionalSwap' | 'liquidation';

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

export type MangoEvent = DepositEvent | WithdrawEvent | TradeEvent | SwapEvent | LiquidationEvent;