import { solanaManager } from './solanaManager';
import { config } from "./config";
import { Elysia } from 'elysia';
import { initDb } from './db';
import { initializeMangoClient } from './mango';
import { cors } from '@elysiajs/cors';

await initializeMangoClient();
initDb();

new Elysia()
    .use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }))
    .use(solanaManager)
    .listen({ hostname: config.HOST, port: config.PORT }, async ({ hostname, port }) => {
        console.log(`Running at http://${hostname}:${port}`)
    });