import type { createAuthClient } from "better-auth/client";
import { getApiBaseURL } from "./api/http";

const getBaseURL = () => {
  // Prefer build-time env for explicit auth URL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (typeof import.meta !== "undefined" ? (import.meta as any)?.env : undefined) as Record<string, string | undefined> | undefined;
  let configuredOrigin: string | undefined =
    env?.VITE_BETTER_AUTH_URL ||
    env?.BETTER_AUTH_URL;

  if (!configuredOrigin && typeof process !== "undefined" && process?.env) {
    configuredOrigin = process.env.BETTER_AUTH_URL;
  }

  const origin =
    configuredOrigin && configuredOrigin.trim().length
      ? configuredOrigin
      : getApiBaseURL();

  return `${origin.replace(/\/$/, "")}/api/auth`;
};

type AuthClient = ReturnType<typeof createAuthClient>;

let clientPromise: Promise<AuthClient> | undefined;

export const hasAuthClient = () => typeof window !== "undefined";

export const getAuthClient = async (): Promise<AuthClient> => {
  if (!hasAuthClient()) {
    throw new Error("Auth client is only available in the browser");
  }
  if (!clientPromise) {
    clientPromise = import("better-auth/client").then(({ createAuthClient }) =>
      createAuthClient({
        baseURL: getBaseURL(),
      })
    );
  }
  return clientPromise;
};

export type { AuthClient };
