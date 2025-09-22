import type { RequestEvent } from "@builder.io/qwik-city";

const isNonEmpty = (value: string | undefined | null): value is string =>
  typeof value === "string" && value.length > 0;

export const readServerEnvValue = (
  event: RequestEvent | undefined,
  key: string
): string | undefined => {
  const fromEvent = event?.env?.get?.(key);
  if (isNonEmpty(fromEvent)) {
    return fromEvent;
  }
  let fromProcess: string | undefined;
  if (typeof process !== "undefined" && process?.env) {
    switch (key) {
      case "DATABASE_URL":
        fromProcess = process.env.DATABASE_URL;
        break;
      case "BETTER_AUTH_SECRET":
        fromProcess = process.env.BETTER_AUTH_SECRET;
        break;
      case "BETTER_AUTH_URL":
        fromProcess = process.env.BETTER_AUTH_URL;
        break;
      default:
        fromProcess = process.env[key];
        break;
    }
  }
  return isNonEmpty(fromProcess) ? fromProcess : undefined;
};

export const requireServerEnvValue = (
  event: RequestEvent | undefined,
  key: string,
  errorMessage?: string
): string => {
  const value = readServerEnvValue(event, key);
  if (!isNonEmpty(value)) {
    throw new Error(errorMessage ?? `Missing required env variable: ${key}`);
  }
  return value;
};

export type ResolvedServerEnv = {
  get(key: string): string | undefined;
  require(key: string, errorMessage?: string): string;
};

export const createServerEnv = (event: RequestEvent | undefined): ResolvedServerEnv => ({
  get: (key) => readServerEnvValue(event, key),
  require: (key, message) => requireServerEnvValue(event, key, message),
});
