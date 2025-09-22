import type { RequestEvent } from "@builder.io/qwik-city";
import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";

const missingDatabaseMessage = "DATABASE_URL environment variable is required for auth";
const missingSecretMessage = "BETTER_AUTH_SECRET environment variable is required for auth";

const poolCache = new Map<string, Pool>();
const authCache = new Map<string, ReturnType<typeof betterAuth>>();

const createAuthStub = (message: string): ReturnType<typeof betterAuth> =>
  ({
    handler: async () => {
      throw new Error(message);
    },
    api: {
      async getSession() {
        throw new Error(message);
      },
    },
  } as unknown as ReturnType<typeof betterAuth>);

const readDatabaseUrl = (event?: RequestEvent) => {
  const fromEvent = event?.env?.get?.("DATABASE_URL");
  if (fromEvent && fromEvent.length > 0) {
    return fromEvent;
  }
  const fromProcess = process.env.DATABASE_URL;
  return fromProcess && fromProcess.length > 0 ? fromProcess : undefined;
};

const readAuthSecret = (event?: RequestEvent) => {
  const fromEvent = event?.env?.get?.("BETTER_AUTH_SECRET");
  if (fromEvent && fromEvent.length > 0) {
    return fromEvent;
  }
  const fromProcess = process.env.BETTER_AUTH_SECRET;
  return fromProcess && fromProcess.length > 0 ? fromProcess : undefined;
};

const createPool = (databaseUrl: string) =>
  new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
  });

export const getDbPool = (event?: RequestEvent): Pool => {
  const databaseUrl = readDatabaseUrl(event);
  if (!databaseUrl) {
    throw new Error(missingDatabaseMessage);
  }
  let pool = poolCache.get(databaseUrl);
  if (!pool) {
    pool = createPool(databaseUrl);
    poolCache.set(databaseUrl, pool);
  }
  return pool;
};

export const getAuth = (event?: RequestEvent): ReturnType<typeof betterAuth> => {
  const databaseUrl = readDatabaseUrl(event);
  if (!databaseUrl) {
    return createAuthStub(missingDatabaseMessage);
  }
  const secret = readAuthSecret(event);
  if (!secret) {
    return createAuthStub(missingSecretMessage);
  }
  const cacheKey = `${databaseUrl}::${secret}`;
  let auth = authCache.get(cacheKey);
  if (!auth) {
    const pool = getDbPool(event);
    auth = betterAuth({
      database: pool,
      emailAndPassword: {
        enabled: true,
      },
      secret,
      trustedOrigins: [
        "https://app.diaryx.net",
        "https://*adammharris-projects.vercel.app",
      ],
    });
    authCache.set(cacheKey, auth);
  }
  return auth;
};

export type AuthInstance = ReturnType<typeof betterAuth>;
