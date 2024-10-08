import { Elysia } from 'elysia';
import { ElysiaWS } from '@elysiajs/websocket';
import { MangoEvent } from './types';
import { ServerWebSocket } from "bun";
import { getUserBotsData } from './db/botStats';

type WS = ElysiaWS<
    ServerWebSocket<any>,
    any,
    any
>

const clientConnections = new Map<WS, Set<string>>();
const accountConnections = new Map<string, Set<WS>>();

export const wsManager = new Elysia()
  .ws('/ws', {
    message(ws, message) {
        console.log('Received message:', message);

        const [action, account] = (message as string).split(':');

        switch (action) {
          case 'connect':
            handleConnect(ws, account);
            break;
          case 'disconnect':
            handleDisconnect(ws, account);
            break;
          default:
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: 'Unknown message type' }
            }));
        }
    },
    close(ws) {
      removeConnection(ws);
      console.log('WebSocket disconnected');
    }
  });

  async function handleConnect(ws: WS, account: string) {
    try {
      const userBotsData = getUserBotsData(account);
      registerAccounts(ws, userBotsData.map(bot => bot.mangoAccount));
      ws.send(JSON.stringify({
        type: 'connectionSuccess',
        payload: { bots: userBotsData }
      }));
    } catch (error) {
      console.error('Error fetching user bots data:', error);
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: 'Failed to fetch user bots data' }
      }));
    }
  }

function handleDisconnect(ws: WS, account: string) {
  const clientAccounts = clientConnections.get(ws);
  if (clientAccounts) {
    unregisterAccounts(ws, Array.from(clientAccounts));
    ws.send(JSON.stringify({
      type: 'disconnectionSuccess',
      payload: { accounts: Array.from(clientAccounts) }
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: 'No accounts registered for this connection' }
    }));
  }
}

function registerAccounts(ws: WS, accounts: string[]) {
  const clientAccounts = clientConnections.get(ws) || new Set();
  accounts.forEach(account => {
    clientAccounts.add(account);
    if (!accountConnections.has(account)) {
      accountConnections.set(account, new Set());
    }
    accountConnections.get(account)!.add(ws);
  });
  clientConnections.set(ws, clientAccounts);
  console.log(`Registered accounts for client: ${Array.from(clientAccounts).join(', ')}`);
}

function unregisterAccounts(ws: WS, accounts: string[]) {
  const clientAccounts = clientConnections.get(ws);
  if (clientAccounts) {
    accounts.forEach(account => {
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
  console.log(`Unregistered accounts for client: ${accounts.join(', ')}`);
}

function removeConnection(ws: WS) {
  const accounts = clientConnections.get(ws);
  if (accounts) {
    accounts.forEach(account => {
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
    connections.forEach(ws => {
      ws.send(JSON.stringify({
        type: 'botUpdate',
        payload: { event }
      }));
    });
  }
}