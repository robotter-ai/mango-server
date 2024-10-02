import { solanaManager } from './solanaManager';
import { config } from "./config";
import { Elysia } from 'elysia';
import { initDb } from './db';
import { initializeMangoClient } from './mango';

new Elysia()
    .use(solanaManager)
    .listen({ hostname: config.HOST, port: config.PORT }, async ({ hostname, port }) => {
        await initializeMangoClient();
        initDb();
        console.log(`Running at http://${hostname}:${port}`)
    });