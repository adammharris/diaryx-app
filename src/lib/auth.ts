import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";

const missingEnvMessage = "DATABASE_URL environment variable is required for auth";

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

let pooledConnection: Pool | undefined;
let resolvedAuth: ReturnType<typeof betterAuth> | undefined;

const resolvePool = (): Pool | undefined => {
  if (pooledConnection) {
    return pooledConnection;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return undefined;
  }
  pooledConnection = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
  });
  return pooledConnection;
};

const resolveAuth = (): ReturnType<typeof betterAuth> => {
  const pool = resolvePool();
  if (!pool) {
    return createAuthStub();
  }
  if (!resolvedAuth) {
    resolvedAuth = betterAuth({
      database: pool,
      emailAndPassword: {
        enabled: true,
      },
      trustedOrigins: [
        "https://app.diaryx.net",
        "https://*adammharris-projects.vercel.app",
      ],
    });
  }
  return resolvedAuth;
};

const createProxy = <T extends object>(resolver: () => T) =>
  new Proxy({} as T, {
    get(_target, prop, receiver) {
      const instance = resolver();
      const value = Reflect.get(instance, prop, receiver);
      return typeof value === "function" ? value.bind(instance) : value;
    },
    has(_target, prop) {
      const instance = resolver();
      return prop in instance;
    },
    ownKeys() {
      const instance = resolver();
      return Reflect.ownKeys(instance);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const instance = resolver();
      const descriptor = Reflect.getOwnPropertyDescriptor(instance, prop);
      if (descriptor) {
        descriptor.configurable = true;
      }
      return descriptor;
    },
  });

export const auth = createProxy<ReturnType<typeof betterAuth>>(resolveAuth);

export const dbPool = createProxy<Pool>(() => {
  const pool = resolvePool();
  if (!pool) {
    throw new Error(missingEnvMessage);
  }
  return pool;
});
