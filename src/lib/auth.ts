import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
const missingEnvMessage = "DATABASE_URL environment variable is required for auth";

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
    })
  : undefined;

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

export const auth = pool
  ? betterAuth({
      database: pool,
      emailAndPassword: {
        enabled: true,
      },
    })
  : createAuthStub();

export const dbPool =
  pool ??
  (new Proxy(
    {},
    {
      get() {
        throw new Error(missingEnvMessage);
      },
    }
  ) as Pool);
