import { Elysia } from "elysia";
import { ElysiaWS } from "@elysiajs/websocket";
import { BotData, MangoEvent } from "./types";
import { ServerWebSocket } from "bun";
import { getUserBotsData, getSingleBotData } from "./db/botStats";

type WS = ElysiaWS<ServerWebSocket<any>, any, any>;

const clientConnections = new Map<WS, Set<string>>();
const accountConnections = new Map<string, Set<WS>>();

export const wsManager = new Elysia().ws("/ws", {
  message(ws, message) {
    console.log("Received message:", message);

    const [action, account] = (message as string).split(":");

    switch (action) {
      case "connect":
        handleConnect(ws, account);
        break;
      case "disconnect":
        handleDisconnect(ws);
        break;
      default:
        ws.send(
          JSON.stringify({
            type: "error",
            payload: { message: "Unknown message type" },
          }),
        );
    }
  },
  close(ws) {
    removeConnection(ws);
    console.log("WebSocket disconnected");
  },
});

async function handleConnect(ws: WS, account: string) {
  try {
    const userBotsData = await getUserBotsData(account);
    registerAccounts(ws, [account]);
    userBotsData.forEach((bot) => registerAccounts(ws, [bot.mangoAccount])); // Register each bot's mango account
    ws.send(
      JSON.stringify({
        type: "connectionSuccess",
        payload: { bots: [...userBotsData, ...placeholderBotsData] },
      }),
    );
  } catch (error) {
    console.error("Error fetching user bots data:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        payload: { message: "Failed to fetch user bots data" },
      }),
    );
  }
}

function handleDisconnect(ws: WS) {
  const clientAccounts = clientConnections.get(ws);
  if (clientAccounts) {
    unregisterAccounts(ws, Array.from(clientAccounts));
    ws.send(
      JSON.stringify({
        type: "disconnectionSuccess",
        payload: { accounts: Array.from(clientAccounts) },
      }),
    );
  } else {
    ws.send(
      JSON.stringify({
        type: "error",
        payload: { message: "No accounts registered for this connection" },
      }),
    );
  }
}

function registerAccounts(ws: WS, accounts: string[]) {
  const clientAccounts = clientConnections.get(ws) || new Set();
  accounts.forEach((account) => {
    clientAccounts.add(account);
    if (!accountConnections.has(account)) {
      accountConnections.set(account, new Set());
    }
    accountConnections.get(account)!.add(ws);
  });
  clientConnections.set(ws, clientAccounts);
}

function unregisterAccounts(ws: WS, accounts: string[]) {
  const clientAccounts = clientConnections.get(ws);
  if (clientAccounts) {
    accounts.forEach((account) => {
      clientAccounts.delete(account);
      const connections = accountConnections.get(account);
      if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
          accountConnections.delete(account);
        }
      }
    });
    if (clientAccounts.size === 0) {
      clientConnections.delete(ws);
    } else {
      clientConnections.set(ws, clientAccounts);
    }
  }
}

function removeConnection(ws: WS) {
  const accounts = clientConnections.get(ws);
  if (accounts) {
    accounts.forEach((account) => {
      const connections = accountConnections.get(account);
      if (connections) {
        connections.delete(ws);
        if (connections.size === 0) {
          accountConnections.delete(account);
        }
      }
    });
  }
  clientConnections.delete(ws);
}

export function broadcastUpdate(event: MangoEvent) {
  const connections = accountConnections.get(event.mangoAccount);
  if (connections) {
    connections.forEach((ws) => {
      ws.send(
        JSON.stringify({
          type: "botUpdate",
          payload: { event },
        }),
      );
    });
  }
}

export function broadcastNewBot(userAddress: string, mangoAccount: string) {
  console.log(`Attempting to broadcast new bot for user: ${userAddress}`);
  console.log(`Current accountConnections:`, accountConnections);

  const connections = accountConnections.get(userAddress);

  if (!connections || connections.size === 0) {
    console.log(`No active connections found for user: ${userAddress}`);
    return;
  }

  console.log(
    `Found ${connections.size} connection(s) for user: ${userAddress}`,
  );

  const newBotData = getSingleBotData(mangoAccount);

  if (!newBotData) {
    console.log(
      `No data found for new bot with mango account: ${mangoAccount}`,
    );
    return;
  }

  connections.forEach((ws) => {
    console.log(`Sending new bot data to a connection`);
    ws.send(
      JSON.stringify({
        type: "newBot",
        payload: { bot: newBotData },
      }),
    );
  });

  console.log(`Finished broadcasting new bot data`);

  // Register the new mango account for future updates
  connections.forEach((ws) => registerAccounts(ws, [mangoAccount]));
}

function generateInitialBotData(
  mangoAccount: string,
  userAddress: string,
): BotData {
  return {
    id: Date.now(),
    name: `Bot ${Math.floor(Math.random() * 1000)}`,
    status: "Active",
    mangoAccount: mangoAccount,
    pnl: {
      value: 0,
      percentage: 0,
      isPositive: true,
      chartData: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
    },
    portfolio: 0,
    accuracy: 0,
    sharpeRatio: 0,
    apr: 0,
    delegate: userAddress,
    events: [],
  };
}

const placeholderBotsData: BotData[] = [
  {
    id: 1,
    name: "Big Brain",
    status: "Active",
    mangoAccount: "",
    pnl: {
      value: 1837,
      percentage: 20,
      isPositive: true,
      chartData: [50, 60, 40, 49, 38, 34, 80, 76, 95, 100],
    },
    portfolio: 5204,
    accuracy: 65,
    sharpeRatio: 2.81,
    apr: 210,
    delegate: "rikiFB2VznT2izUT7UffzWCn1X4gNmGutX7XEqFdpRR",
    events: [],
  },
  {
    id: 2,
    name: "Trade Genius",
    status: "Active",
    mangoAccount: "",
    pnl: {
      value: 773,
      percentage: 11,
      isPositive: true,
      chartData: [50, 60, 40, 49, 38, 34, 80, 76, 95, 100],
    },
    portfolio: 3408,
    accuracy: 59,
    sharpeRatio: 2.01,
    apr: 187,
    delegate: "rikiFB2VznT2izUT7UffzWCn1X4gNmGutX7XEqFdpRR",
    events: [],
  },
  {
    id: 3,
    name: "Alpha Trader",
    status: "Stopped",
    mangoAccount: "",
    pnl: {
      value: 31,
      percentage: 1,
      isPositive: false,
      chartData: [90, 85, 80, 70, 60, 65, 75, 76, 95, 80],
    },
    portfolio: 3127,
    accuracy: 49,
    sharpeRatio: 1.75,
    apr: 165,
    delegate: "rikiFB2VznT2izUT7UffzWCn1X4gNmGutX7XEqFdpRR",
    events: [],
  },
];
