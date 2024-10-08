import { Connection } from "@solana/web3.js";

export const config = {
  HOST: process.env.HOST || '127.0.0.1',
  PORT: process.env.PORT || '3000',
  RPC: new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.RPC_KEY}` || ''),
  RPC_LANDER: new Connection(process.env.RPC_LANDER!),
};

const requiredEnvVariables = [
  'RPC_KEY',
];

requiredEnvVariables.forEach(variable => {
  if (config[variable as keyof typeof config] === '') {
    throw new Error(`Missing required environment variable: ${variable}`);
  }
});
