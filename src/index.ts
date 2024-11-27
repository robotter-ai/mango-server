import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { config } from "./config";
import { initDb } from "./db";
import { initializeMangoClient } from "./mango";
import { solanaManager } from "./solanaManager";
import { wsManager } from "./wsServer";
import { swagger } from "@elysiajs/swagger";

await initializeMangoClient();
initDb();

new Elysia()
  .use(swagger())
  .use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use(solanaManager)
  .use(wsManager)
  .listen(config.PORT);

console.log(`🦊 Elysia is running at http://${config.HOST}:${config.PORT}`);
