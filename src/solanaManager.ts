import {
  PublicKey,
  SystemProgram,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createCloseAccountInstruction,
  createInitializeAccount3Instruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Elysia, t } from "elysia";
import { config } from "./config";
import { confirmTransaction } from "./solana/confirmTransaction";
import {
  deriveMangoAccountAddress,
  getMangoClient,
  getMangoGroup,
  MANGO_MAINNET_GROUP,
} from "./mango";
import { prepareTransaction } from "./solana/prepareTransaction";
import { BN } from "bn.js";
import {
  fetchTransaction,
  validateTransaction,
} from "./solana/validateTransction";
import { parseTransaction } from "./solana/parser";
import { getUserBotsData } from "./db/botStats";
import { getNextBotId } from "./db/mangoAccounts";
import { saveMangoEvent } from "./db/mangoEvents";
import { broadcastUpdate } from "./wsServer";
import { toBase } from "./solana/amountParser";
import { getTokenAccounts } from "./solana/fetcher/getTokenAccounts";
import { getMints } from "./solana/fetcher/getMint";
import BigNumber from "bignumber.js";
import { mintFromSymbol, symbolFromMint } from "./constants";

interface GetBalancesQuery {
  user: string;
}

const getBalancesQuerySchema = t.Object({
  user: t.String(),
});

interface GetBotDataQuery {
  user: string;
}

const getBotDataQuerySchema = t.Object({
  user: t.String(),
});

interface DepositRequestBody {
  owner: string;
  balanceA: number;
  mintA: string;
  balanceB: number;
  mintB: string;
  feesAmount: string;
  delegate: string;
}

const depositBodySchema = t.Object({
  owner: t.String(),
  balanceA: t.Number(),
  mintA: t.String(),
  balanceB: t.Number(),
  mintB: t.String(),
  feesAmount: t.String(),
  delegate: t.String(),
});

interface WithdrawRequestBody {
  owner: string;
  botId: string;
}

const withdrawBodySchema = t.Object({
  owner: t.String(),
  botId: t.String(),
});

export const solanaManager = new Elysia()
  .get(
    "/getBalances",
    async ({ query }: { query: GetBalancesQuery }) => {
      try {
        const user = new PublicKey(query.user!);
        const userInfo = await config.RPC.getAccountInfo(user);
        if (!userInfo)
          return {
            error: "Ensure you have SOL on your wallet",
            status: 404,
          };

        const tokenAccounts = await getTokenAccounts(user.toBase58());
        if (tokenAccounts.length === 0)
          return { message: "No token accounts found", status: 200 };

        const mints = await getMints(tokenAccounts.map((x) => new PublicKey(x.pubkey)));

        const balances = tokenAccounts.map((x) => {
          const mintData = mints[x.pubkey];
          const decimals = mintData ? mintData.decimals : 0;
          const balance = x.data.amount.dividedBy(new BigNumber(10).pow(decimals)).toString();
          return {
            mint: x.pubkey,
            balance,
          };
        });
  
        return { balances, status: 200 };
      } catch (e: any) {
        console.error(e.message);
        return { error: e.message, status: 500 };
      }
    },
    {
      query: getBalancesQuerySchema,
    },
  )

  .get(
    "/getBotData",
    async ({ query }: { query: GetBotDataQuery }) => {
      try {
        const { user } = query;
        if (!user) {
          return { error: "User address is required", status: 400 };
        }

        const userBotsData = getUserBotsData(user);
        if (!userBotsData) {
          return { error: "No active bots found for this user", status: 404 };
        }

        return { data: userBotsData, status: 200 };
      } catch (error: any) {
        console.error("Error fetching user bots and events:", error);
        return { error: error.message, status: 500 };
      }
    },
    {
      query: getBotDataQuerySchema,
    },
  )

  .post(
    "/deposit",
    async ({ body }: { body: DepositRequestBody }) => {
      const { owner, balanceA, mintA, balanceB, mintB, feesAmount, delegate } =
        body;
      const amountA = toBase(balanceA.toString(), mintA);
      const amountB = toBase(balanceB.toString(), mintB);
      const solAmount = toBase(feesAmount, "SOL");

      const ownerPubkey = new PublicKey(owner);
      const delegatePubkey = new PublicKey(delegate);
      const mangoClient = getMangoClient();
      const accountNumber = getNextBotId(owner);
      const mangoAccount = deriveMangoAccountAddress(
        ownerPubkey,
        accountNumber,
      );
      const mangoGroup = getMangoGroup();

      try {
        const createAccountIx = await mangoClient.program.methods
          .accountCreate(accountNumber, 4, 4, 4, 32, "")
          .accounts({
            account: mangoAccount,
            group: MANGO_MAINNET_GROUP,
            owner: ownerPubkey,
            payer: ownerPubkey,
          })
          .instruction();

        const setDelegateIx = await mangoClient.program.methods
          .accountEdit(null, delegatePubkey, null, null)
          .accounts({
            group: MANGO_MAINNET_GROUP,
            account: mangoAccount,
            owner: ownerPubkey,
          })
          .instruction();

        const transferIx = SystemProgram.transfer({
          fromPubkey: ownerPubkey,
          toPubkey: delegatePubkey,
          lamports: solAmount,
        });

        const instructions = [createAccountIx, transferIx, setDelegateIx];

        const mintAIsSol = new PublicKey(mintFromSymbol[mintA]).equals(NATIVE_MINT);
        const mintBIsSol = new PublicKey(mintFromSymbol[mintB]).equals(NATIVE_MINT);
        let wrappedSolAccounts: PublicKey[] = [];

        if (amountA > 0) {
          const mintAddress = mintFromSymbol[mintA];
          const mintPubkey = new PublicKey(mintAddress);
          const bankA = mangoGroup.getFirstBankByMint(mintPubkey);
          let tokenAccountA = getAssociatedTokenAddressSync(
            new PublicKey(mintAddress),
            ownerPubkey,
          );

          if (mintAIsSol) {
            // Generate seed for wrapped SOL account
            const seed = Math.random().toString(36).slice(2, 34);
            const wrappedSolAccount = await PublicKey.createWithSeed(
              ownerPubkey,
              seed,
              TOKEN_PROGRAM_ID
            );
            wrappedSolAccounts.push(wrappedSolAccount);
        
            // Create and initialize wrapped SOL account
            const rentExemptLamports = await config.RPC.getMinimumBalanceForRentExemption(165);
            const totalLamports = new BN(amountA).add(new BN(rentExemptLamports));
        
            instructions.push(
              SystemProgram.createAccountWithSeed({
                fromPubkey: ownerPubkey,
                basePubkey: ownerPubkey,
                seed,
                newAccountPubkey: wrappedSolAccount,
                lamports: totalLamports.toNumber(),
                space: 165,
                programId: TOKEN_PROGRAM_ID
              }),
              createInitializeAccount3Instruction(
                wrappedSolAccount,
                NATIVE_MINT,
                ownerPubkey
              )
            );
        
            tokenAccountA = wrappedSolAccount;
          }

          const depositIx = await mangoClient.program.methods
            .tokenDeposit(new BN(amountA), false)
            .accounts({
              tokenAuthority: ownerPubkey,
              group: MANGO_MAINNET_GROUP,
              account: mangoAccount,
              owner: ownerPubkey,
              bank: bankA.publicKey,
              vault: bankA.vault,
              tokenAccount: tokenAccountA,
            })
            .instruction();
          instructions.push(depositIx);
        }

        if (amountB > 0) {
          const mintAddress = mintFromSymbol[mintB];
          const bankB = mangoGroup.getFirstBankByMint(new PublicKey(mintAddress));
          let tokenAccountB = getAssociatedTokenAddressSync(
            new PublicKey(mintAddress),
            ownerPubkey,
          );

          if (mintBIsSol) {
            // Generate seed for wrapped SOL account
            const seed = Math.random().toString(36).slice(2, 34);
            const wrappedSolAccount = await PublicKey.createWithSeed(
              ownerPubkey,
              seed,
              TOKEN_PROGRAM_ID
            );
            wrappedSolAccounts.push(wrappedSolAccount);
        
            // Create and initialize wrapped SOL account
            const rentExemptLamports = await config.RPC.getMinimumBalanceForRentExemption(165);
            const totalLamports = new BN(amountB).add(new BN(rentExemptLamports));
        
            instructions.push(
              SystemProgram.createAccountWithSeed({
                fromPubkey: ownerPubkey,
                basePubkey: ownerPubkey,
                seed,
                newAccountPubkey: wrappedSolAccount,
                lamports: totalLamports.toNumber(),
                space: 165,
                programId: TOKEN_PROGRAM_ID
              }),
              createInitializeAccount3Instruction(
                wrappedSolAccount,
                NATIVE_MINT,
                ownerPubkey
              )
            );
        
            tokenAccountB = wrappedSolAccount;
          }

          const depositIxB = await mangoClient.program.methods
            .tokenDeposit(new BN(amountB), false)
            .accounts({
              tokenAuthority: ownerPubkey,
              group: MANGO_MAINNET_GROUP,
              account: mangoAccount,
              owner: ownerPubkey,
              bank: bankB.publicKey,
              vault: bankB.vault,
              tokenAccount: tokenAccountB,
            })
            .instruction();
          instructions.push(depositIxB);
        }

        wrappedSolAccounts.forEach(wrappedAccount => {
          instructions.push(
            createCloseAccountInstruction(
              wrappedAccount,
              ownerPubkey,
              ownerPubkey
            )
          );
        });

        const transaction = await prepareTransaction(instructions, ownerPubkey);

        return {
          transaction,
          botId: accountNumber,
          mangoAccount: mangoAccount.toBase58(),
          status: 200,
        };
      } catch (error: any) {
        console.error("Error creating deposit transaction:", error);
        if (error.message.includes("already in use")) {
          return {
            message: "Account number conflict, please try again",
            status: 409,
          };
        }
        return { message: "error", error: error.message, status: 500 };
      }
    },
  )

  .post(
    "/withdraw",
    async ({ body }: { body: WithdrawRequestBody }) => {
      try {
        const { owner, botId } = body;
        const ownerPubkey = new PublicKey(owner);
        const mangoAddress = deriveMangoAccountAddress(
          ownerPubkey,
          parseInt(botId),
        );
        const mangoClient = getMangoClient();
        const mangoAccount = await mangoClient.getMangoAccount(mangoAddress);
        const mangoGroup = getMangoGroup();
        const banksMap = mangoGroup.banksMapByMint;
        const balances = Array.from(banksMap.entries()).map(
          ([mint, banks]) => ({
            mint,
            balance: mangoAccount.getTokenBalance(banks[0]).toNumber(), // Assuming you want the balance of the first bank for each mint
          }),
        );

        console.log("Balances of all banks:", balances);

        // Filter for withdrawable balances
        const withdrawableBalances = balances.filter(
          (balance) => balance.balance > 0,
        );
        if (withdrawableBalances.length === 0) {
          return { message: "No withdrawable balances available", status: 400 };
        }

        // Create withdrawal instructions for all withdrawable balances
        const instructions = [];
        for (const { mint, balance } of withdrawableBalances) {
          const bank = banksMap.get(mint)?.[0]; // Get the first bank for the mint
          if (!bank) {
            return { message: "Bank not found", status: 400 };
          }

          const withdrawIx = await mangoClient.program.methods
            .tokenWithdraw(new BN(balance), true)
            .accounts({
              group: mangoGroup.publicKey,
              account: mangoAccount.publicKey,
              owner: ownerPubkey,
              bank: bank.publicKey,
              vault: bank.vault,
              tokenAccount: getAssociatedTokenAddressSync(
                bank.mint,
                ownerPubkey,
              ),
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .instruction();

          instructions.push(withdrawIx);
        }

        const closeAccountIx = await mangoClient.program.methods
          .accountClose(false)
          .accounts({
            group: mangoGroup.publicKey,
            account: mangoAccount.publicKey,
            owner: ownerPubkey,
            solDestination: ownerPubkey,
          })
          .instruction();

        instructions.push(closeAccountIx);

        const transaction = await prepareTransaction(instructions, ownerPubkey);

        return { transaction, status: 200 };
      } catch (error: any) {
        console.error("Error creating withdraw transaction:", error);
        return { message: "error", error: error.message, status: 500 };
      }
    },
    {
      body: withdrawBodySchema,
    },
  )

  .post(
    "/sendTransaction",
    async ({ body }: { body: { transaction: string } }) => {
      try {
        const signature = await confirmTransaction(body.transaction);
        validateTransaction(signature); // dont await this

        return { signature, status: 200 };
      } catch (error: any) {
        console.error("Error sending transaction:", error);
        return { error: error.message, status: 500 };
      }
    },
  )

  .post("/accountsListener", async ({ body, headers }) => {
    try {
      const authToken = headers["authorization"];
      if (!authToken || authToken !== process.env.RPC_KEY) {
        console.error(`Unauthorized request`);
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const signatures = (body as any).flatMap(
        (x: any) => x.transaction.signatures,
      );
      const confirmationPromises = signatures.map((signature: string) =>
        getConfirmation(signature),
      );
      const confirmationResults = await Promise.all(confirmationPromises);
      const confirmedSignatures = signatures.filter(
        (_: string, index: number) => confirmationResults[index] !== null,
      );

      if (confirmedSignatures.length === 0) {
        console.log("No transactions were confirmed");
        return { success: false, message: "No transactions were confirmed" };
      }

      console.log(`Confirmed signatures: ${confirmedSignatures}`);
      for (const signature of signatures) {
        const response = await fetchTransaction(signature);
        if (!response) throw new Error("Transaction not found");

        const {
          transaction: { message },
          meta,
          blockTime,
        } = response;
        if (!message || !meta) throw new Error("Transaction data not found");

        const versionedTransaction = new VersionedTransaction(message);
        const mangoEvents = parseTransaction(
          versionedTransaction,
          signature,
          blockTime,
        );

        for (const mangoEvent of mangoEvents) {
          console.log("mangoEvent from accountListener", mangoEvent);
          saveMangoEvent(mangoEvent);
          broadcastUpdate(mangoEvent);
        }
      }

      return { success: true, message: "Transactions processed successfully" };
    } catch (error) {
      console.error("Failed to process transactions:", error);
      return { success: false, message: "Failed to process transactions" };
    }
  });

async function getConfirmation(
  signature: string,
  maxRetries: number = 10,
  retryDelay: number = 2000,
): Promise<string | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await config.RPC.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    const status = result.value?.confirmationStatus;

    if (status === "confirmed" || status === "finalized") {
      return status;
    }

    console.log(
      `Attempt ${attempt + 1}: Transaction not yet confirmed. Retrying...`,
    );
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  console.error(`Transaction not confirmed after ${maxRetries} attempts.`);
  return null;
}
