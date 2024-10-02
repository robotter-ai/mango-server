import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Elysia } from "elysia";
import { config } from "./config";
import { confirmTransaction } from "./solana/confirmTransaction";
import { USDC_MINT } from "./constants";
import { deriveMangoAccountAddress, getMangoClient, getMangoGroup, MANGO_MAINNET_GROUP } from "./mango";
import { prepareTransaction } from "./solana/prepareTransaction";
import { BN } from "bn.js";
import { deactivateBot, getNextBotId } from "./db";

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
        .accountCreate(accountNumber, 8, 4, 4, 32, '')
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

      const instructions = [createAccountIx, depositIx, setDelegateIx];
      const transaction = await prepareTransaction(instructions, ownerPubkey);

      return { transaction, botId: accountNumber, status: 200 };
    } catch (error: any) {
      console.error('Error creating deposit transaction:', error);
      if (error.message.includes("already in use")) {
        deactivateBot(body.owner, accountNumber);
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
      return { signature, status: 200 };
    } catch (error: any) {
      console.error('Error sending transaction:', error);
      return { error: error.message, status: 500 };
    }
  })