import type { RequestEvent } from "@builder.io/qwik-city";
import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";

const missingEnvMessage = "DATABASE_URL environment variable is required for auth";

const poolCache = new Map<string, Pool>();
const authCache = new Map<string, ReturnType<typeof betterAuth>>();

const createAuthStub = (): ReturnType<typeof betterAuth> =>
  ({
    handler: async () => {
      throw new Error(missingEnvMessage);
    },
    api: {
      async getSession() {
        throw new Error(missingEnvMessage);
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

const createPool = (databaseUrl: string) =>
  new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
  });

export const getDbPool = (event?: RequestEvent): Pool => {
  const databaseUrl = readDatabaseUrl(event);
  if (!databaseUrl) {
    throw new Error(missingEnvMessage);
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
    return createAuthStub();
  }
  let auth = authCache.get(databaseUrl);
  if (!auth) {
    const pool = getDbPool(event);
    auth = betterAuth({
      database: pool,
      emailAndPassword: {
        enabled: true,
      },
      trustedOrigins: [
        "https://app.diaryx.net",
        "https://*adammharris-projects.vercel.app",
      ],
    });
    authCache.set(databaseUrl, auth);
  }
  return auth;
};

export type AuthInstance = ReturnType<typeof betterAuth>;
