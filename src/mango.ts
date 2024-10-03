import { MangoClient, MANGO_V4_ID, Group } from "@blockworks-foundation/mango-v4"
import { AnchorProvider, Wallet } from "@coral-xyz/anchor"
import { Connection, Keypair, PublicKey } from "@solana/web3.js"

let mangoClient: MangoClient | undefined;
let mangoGroup: Group | undefined;

export const MANGO_MAINNET_GROUP = new PublicKey(
    '78b8f4cGCwmZ9ysPFMWLaLTkkaYnUjwMJYStWe5RTSSX',
);

export async function initializeMangoClient(): Promise<MangoClient | undefined> {
    if (mangoClient) return mangoClient;

    try {
      const clientKeypair = new Keypair()
      const options = AnchorProvider.defaultOptions()
  
      const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.RPC_KEY}`, options)
      const clientWallet = new Wallet(clientKeypair)
      const clientProvider = new AnchorProvider(connection, clientWallet, options)
  
      mangoClient = MangoClient.connect(
        clientProvider,
        'mainnet-beta',
        MANGO_V4_ID['mainnet-beta'],
        {
          idsSource: 'api',
        },
      )

      mangoGroup = await mangoClient.getGroup(MANGO_MAINNET_GROUP);

      return mangoClient;
    } catch (e) {
      console.log(e)
      return undefined;
    }
}

export function getMangoClient(): MangoClient {
    if (!mangoClient) throw Error('Mango client not initialized');

    return mangoClient;
}

export function getMangoGroup(): Group {
    if (!mangoGroup) throw Error('Mango group not fetched');

    return mangoGroup;
}

export function deriveMangoAccountAddress(
    owner: PublicKey,
    accountNum: number
): PublicKey {
    const [mangoAccount] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('MangoAccount'),
            MANGO_MAINNET_GROUP.toBuffer(),
            owner.toBuffer(),
            new Uint8Array(new Uint32Array([accountNum]).buffer),
        ],
        MANGO_V4_ID["mainnet-beta"]
    );
    
    return mangoAccount;
}