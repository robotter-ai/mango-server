import ky from "ky";
import { getNextBotId, addMangoAccount, deactivateMangoAccount } from "../db/mangoAccounts";
import { initializeParser } from "./parser";

export class AccountManager {
    private static instance: AccountManager;
    private accountSubscriptions!: string[];
    private webhookId: string = process.env.WEBHOOK_ID!;

    private constructor() {}

    public static async getInstance(): Promise<AccountManager> {
        if (!AccountManager.instance) {
            AccountManager.instance = new AccountManager();
            await AccountManager.instance.initialize();
        }
        return AccountManager.instance;
    }

    private async initialize(): Promise<void> {
        try {
            const webhookInfo = await this.getWebhookInfo();
            this.accountSubscriptions = webhookInfo.accountAddresses || [];
            await initializeParser();
        } catch (error) {
            console.error('Failed to initialize AccountManager:', error);
        }
    }

    private async getWebhookInfo(): Promise<any> {
        try {
            const response = await ky.get(`https://api.helius.xyz/v0/webhooks/${this.webhookId}`, {
                searchParams: {
                    'api-key': process.env.RPC_KEY!
                }
            }).json();

            return response;
        } catch (error: any) {
            console.error('Failed to get webhook info:', error.message);
            throw error;
        }
    }

    public async startIndexing(owner: string, mangoAccount: string): Promise<void> {
        if (!this.accountSubscriptions.includes(mangoAccount)) {
            const accountNumber = getNextBotId(owner);
            addMangoAccount(owner, mangoAccount, accountNumber);
            this.accountSubscriptions.push(mangoAccount);
            await this.updateHeliusWebhook();
            console.log(`Started indexing Mango account: ${mangoAccount}`);
        }
    }
    
    public async stopIndexing(mangoAccount: string): Promise<void> {
        const index = this.accountSubscriptions.indexOf(mangoAccount);
        if (index !== -1) {
            this.accountSubscriptions.splice(index, 1);
            deactivateMangoAccount(mangoAccount);
            await this.updateHeliusWebhook();
            console.log(`Stopped indexing Mango account: ${mangoAccount}`);
        }
    }

    public isIndexing(mangoAccount: string): boolean {
        return this.accountSubscriptions.includes(mangoAccount);
    }

    private async updateHeliusWebhook(): Promise<void> {
        if (!this.webhookId) {
            console.error('No webhook ID available. Cannot update.');
            return;
        }
    
        try {
            await ky.put(`https://api.helius.xyz/v0/webhooks/${this.webhookId}`, {
                searchParams: {
                    'api-key': process.env.RPC_KEY!
                },
                json: {
                    webhookURL: "https://beta.robotter.ai",
                    transactionTypes: ["Any"],
                    accountAddresses: Array.from(this.accountSubscriptions),
                    webhookType: "raw"
                }
            });
        } catch (error: any) {
            console.error('Failed to update Helius webhook:', error.message);
        }
    }
}