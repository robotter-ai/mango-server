import { PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Elysia } from "elysia";
import { config } from "./config";
import { confirmTransaction } from "./solana/confirmTransaction";
import { USDC_MINT } from "./constants";
import { deriveMangoAccountAddress, getMangoClient, getMangoGroup, MANGO_MAINNET_GROUP } from "./mango";
import { prepareTransaction } from "./solana/prepareTransaction";
import { BN } from "bn.js";
import { fetchTransaction, validateTransaction } from "./solana/validateTransction";
import { parseTransaction } from "./solana/parser";
import { getUserBotsData } from "./db/botStats";
import { getNextBotId } from "./db/mangoAccounts";
import { saveMangoEvent } from "./db/mangoEvents";
import { broadcastUpdate } from "./wsServer";

export const solanaManager = new Elysia()
  .get('/getUserUsdcBalance', async ({ query }: { query: { user: string } }) => {
    try {
      const user = new PublicKey(query.user!);
      const userInfo = await config.RPC.getAccountInfo(user);
      if (!userInfo) return { error: 'Ensure you have SOL and USDC on your wallet', status: 404 };
      
      const tokenAccount = getAssociatedTokenAddressSync(USDC_MINT, user);
      const balanace = await config.RPC.getTokenAccountBalance(tokenAccount);
      if (!balanace.value) return { message: 'Token account does not exists', status: 200 };
      
      return { balanace: balanace.value.uiAmount, status: 200 };
    } catch (e: any) {
      console.error(e.message);
      return { error: e.message, status: 500 };
    }
  })

  .get('/getBotData', async ({ query }: { query: { userAddress: string } }) => {
    try {
      const { userAddress } = query;
      if (!userAddress) {
        return { error: 'User address is required', status: 400 };
      }

      const userBotsData = getUserBotsData(userAddress);
      if (!userBotsData) {
        return { error: 'No active bots found for this user', status: 404 };
      }

      return { data: userBotsData, status: 200 };
    } catch (error: any) {
      console.error('Error fetching user bots and events:', error);
      return { error: error.message, status: 500 };
    }
  })

  // note: amount without decimals
  .post('/deposit', async ({ body }: { body: { owner: string, amount: number, delegate: string } }) => {
    const { owner, amount, delegate } = body;
    const ownerPubkey = new PublicKey(owner);
    const delegatePubkey = new PublicKey(delegate);
    const mangoClient = getMangoClient();
    const accountNumber = getNextBotId(owner);
    const mangoAccount = deriveMangoAccountAddress(ownerPubkey, accountNumber);
    const mangoGroup = getMangoGroup();
    const bank = mangoGroup.getFirstBankByMint(USDC_MINT);
    const tokenAccount = getAssociatedTokenAddressSync(USDC_MINT, ownerPubkey);

    try {
      const createAccountIx = await mangoClient.program.methods
        .accountCreate(accountNumber, 4, 4, 4, 32, '')
        .accounts({
          account: mangoAccount,
          group: MANGO_MAINNET_GROUP,
          owner: ownerPubkey,
          payer: ownerPubkey,
        })
        .instruction();
        
      const depositIx = await mangoClient.program.methods
        .tokenDeposit(new BN(amount), false)
        .accounts({
          tokenAuthority: ownerPubkey,
          group: MANGO_MAINNET_GROUP,
          account: mangoAccount,
          owner: ownerPubkey,
          bank: bank.publicKey,
          vault: bank.vault,
          tokenAccount,
        })
        .instruction();

      const setDelegateIx = await mangoClient.program.methods
        .accountEdit(
          null,
          delegatePubkey,
          null,
          null
        )
        .accounts({
          group: MANGO_MAINNET_GROUP,
          account: mangoAccount,
          owner: ownerPubkey,
        })
        .instruction();

      const transferIx = SystemProgram.transfer({
        fromPubkey: ownerPubkey,
        toPubkey: delegatePubkey,
        lamports: 1000000,
      })

      const instructions = [transferIx, createAccountIx, depositIx, setDelegateIx];
      const transaction = await prepareTransaction(instructions, ownerPubkey);

      return { transaction, botId: accountNumber, mangoAccount: mangoAccount.toBase58(), status: 200 };
    } catch (error: any) {
      console.error('Error creating deposit transaction:', error);
      if (error.message.includes("already in use")) {
        return { message: 'Account number conflict, please try again', status: 409 };
      }
      return { message: 'error', error: error.message, status: 500 };
    }
  })

  .post('/withdraw', async ({ body }: { body: { owner: string, botId: number } }) => {
    try {
      const { owner, botId } = body;
      const ownerPubkey = new PublicKey(owner);
      const mangoAddress = deriveMangoAccountAddress(ownerPubkey, botId);
      const mangoClient = getMangoClient();
      const mangoAccount = await mangoClient.getMangoAccount(mangoAddress);
      const mangoGroup = getMangoGroup();
      const bank = mangoGroup.getFirstBankByMint(USDC_MINT);
      const tokenBalance = mangoAccount.getTokenBalance(bank);
      const withdrawAmount = tokenBalance.toNumber();
      
      if (withdrawAmount <= 0) {
        return { message: 'Insufficient balance to withdraw', status: 400 };
      }

      const withdrawIx = await mangoClient.program.methods
        .tokenWithdraw(new BN(withdrawAmount), true)
        .accounts({
          group: mangoGroup.publicKey,
          account: mangoAccount.publicKey,
          owner: ownerPubkey,
          bank: bank.publicKey,
          vault: bank.vault,
          tokenAccount: getAssociatedTokenAddressSync(USDC_MINT, ownerPubkey),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const closeAccountIx = await mangoClient.program.methods
        .accountClose(false)
        .accounts({
          group: mangoGroup.publicKey,
          account: mangoAccount.publicKey,
          owner: ownerPubkey,
          solDestination: ownerPubkey,
        })
        .instruction();

      const transaction = await prepareTransaction([withdrawIx, closeAccountIx], ownerPubkey);

      return { transaction, status: 200 };
    } catch (error: any) {
      console.error('Error creating withdraw transaction:', error);
      return { message: 'error', error: error.message, status: 500 };
    }
  })

  .post('/sendTransaction', async ({ body }: { body: { transaction: string } }) => {
    try {
      const signature = await confirmTransaction(body.transaction);
      validateTransaction(signature); // dont await this

      return { signature, status: 200 };
    } catch (error: any) {
      console.error('Error sending transaction:', error);
      return { error: error.message, status: 500 };
    }
  })
  
  .post('/accountsListener', async ({ body, headers }) => {
    try {
        const authToken = headers['authorization'];
        if (!authToken || authToken !== process.env.RPC_KEY) {
            console.error(`Unauthorized request`);
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const signatures = (body as any).flatMap((x: any) => x.transaction.signatures);
        const confirmationPromises = signatures.map((signature: string) => getConfirmation(signature));
        const confirmationResults = await Promise.all(confirmationPromises);
        const confirmedSignatures = signatures.filter((_: string, index: number) => confirmationResults[index] !== null);
    
        if (confirmedSignatures.length === 0) {
          console.log('No transactions were confirmed');
          return { success: false, message: 'No transactions were confirmed' };
        }
    
        console.log(`Confirmed signatures: ${confirmedSignatures}`);
        for (const signature of signatures) {
          const response = await fetchTransaction(signature);
          if (!response) throw new Error('Transaction not found');
      
          const { transaction: { message }, meta, blockTime } = response;
          if (!message || !meta) throw new Error('Transaction data not found');
      
          const versionedTransaction = new VersionedTransaction(message);    
          const mangoEvents = parseTransaction(versionedTransaction, signature, blockTime);
      
          for (const mangoEvent of mangoEvents) {
            console.log('mangoEvent from accountListener', mangoEvent)
            saveMangoEvent(mangoEvent);
            broadcastUpdate(mangoEvent);
          }
        }

        return { success: true, message: 'Transactions processed successfully' };
    } catch (error) {
        console.error('Failed to process transactions:', error);
        return { success: false, message: 'Failed to process transactions' };
    }
});

async function getConfirmation(
  signature: string,
  maxRetries: number = 10,
  retryDelay: number = 2000
): Promise<string | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await config.RPC.getSignatureStatus(signature, {
          searchTransactionHistory: true,
      });
      const status = result.value?.confirmationStatus;
  
      if (status === 'confirmed' || status === 'finalized') {
          return status;
      }
  
      console.log(`Attempt ${attempt + 1}: Transaction not yet confirmed. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
  }

  console.error(`Transaction not confirmed after ${maxRetries} attempts.`);
  return null;
}