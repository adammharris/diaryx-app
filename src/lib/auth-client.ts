import type { createAuthClient } from "better-auth/client";

const getBaseURL = () => {
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.origin}/api/auth`;
  }
  const origin =
    (typeof process !== "undefined" && process?.env?.BETTER_AUTH_URL) ||
    "http://localhost:5173";
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
