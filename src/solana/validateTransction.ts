import { VersionedTransaction } from '@solana/web3.js';
import { config } from '../config';
import { getAllActiveMangoAccounts } from '../db/mangoAccounts';
import { AccountManager } from './accountManager';
import { parseTransaction } from './parser';
import { saveMangoEvent } from '../db/mangoEvents';

const mangoAccountManager = await AccountManager.getInstance();

export async function validateTransaction(signature: string): Promise<void> {
    const response = await fetchTransaction(signature);
    if (!response) throw new Error('Transaction not found');

    const { transaction: { message }, meta, blockTime } = response;
    if (!message || !meta) throw new Error('Transaction data not found');

    const versionedTransaction = new VersionedTransaction(message);    
    const mangoEvents = parseTransaction(versionedTransaction, signature, blockTime);

    for (const mangoEvent of mangoEvents) {
        console.log(mangoEvent)
        saveMangoEvent(mangoEvent);

        const mangoAccount = mangoEvent.mangoAccount;
        if (mangoEvent.eventType === 'tokenDeposit' && !mangoAccountManager.isIndexing(mangoAccount)) {
            await mangoAccountManager.startIndexing(mangoEvent.signers[0], mangoAccount);
        } else if (mangoEvent.eventType === 'tokenWithdraw') {
            const activeAccounts = getAllActiveMangoAccounts();
            const accountToDeactivate = activeAccounts.find(account => account.mangoAccount === mangoAccount);
            
            if (accountToDeactivate) {
                await mangoAccountManager.stopIndexing(accountToDeactivate.mangoAccount);
            }
        }
    }
}

export async function fetchTransaction(signature: string) {
    const retryDelay = 400;
    const response = await config.RPC.getTransaction(signature, { 
        commitment: 'confirmed', 
        maxSupportedTransactionVersion: 0,
    });
    if (response) {
        return response;
    } else {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return fetchTransaction(signature);
    }
}