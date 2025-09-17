import { betterAuth } from "better-auth";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required for auth");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
});

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
});
