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
  const fromProcess = process.env?.[key];
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
