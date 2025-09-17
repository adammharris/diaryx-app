import { createAuthClient } from "better-auth/client";

const getBaseURL = () => {
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.origin}/api/auth`;
  }
  const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:5173";
  return `${origin.replace(/\/$/, "")}/api/auth`;
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});
