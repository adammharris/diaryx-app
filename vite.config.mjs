import { defineConfig } from "vite";
import { qwikVite } from "@builder.io/qwik/optimizer";
import { qwikCity } from "@builder.io/qwik-city/vite";
import tsconfigPaths from "vite-tsconfig-paths";

const sanitizeServerData = (value, seen = new WeakMap()) => {
  if (value == null) {
    return value;
  }
  const valueType = typeof value;
  if (valueType !== "object") {
    if (valueType === "bigint") {
      return Number.isSafeInteger(Number(value))
        ? Number(value)
        : value.toString();
    }
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof URL) {
    return value.toString();
  }

  if (
    typeof ReadableStream !== "undefined" &&
    value instanceof ReadableStream
  ) {
    return undefined;
  }
  if (typeof Response !== "undefined" && value instanceof Response) {
    return undefined;
  }
  if (typeof Request !== "undefined" && value instanceof Request) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const clone = [];
    seen.set(value, clone);
    for (const item of value) {
      const sanitized = sanitizeServerData(item, seen);
      if (sanitized !== undefined) {
        clone.push(sanitized);
      }
    }
    return clone;
  }

  if (value instanceof Map) {
    const clone = {};
    seen.set(value, clone);
    for (const [key, mapValue] of value.entries()) {
      const sanitized = sanitizeServerData(mapValue, seen);
      if (sanitized !== undefined) {
        clone[key] = sanitized;
      }
    }
    return clone;
  }

  if (value instanceof Set) {
    const clone = [];
    seen.set(value, clone);
    for (const item of value.values()) {
      const sanitized = sanitizeServerData(item, seen);
      if (sanitized !== undefined) {
        clone.push(sanitized);
      }
    }
    return clone;
  }

  const output = {};
  seen.set(value, output);
  for (const [key, val] of Object.entries(value)) {
    if (key === "socket" || key === "req" || key === "res") {
      continue;
    }
    const sanitized = sanitizeServerData(val, seen);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  return output;
};

const QWIK_ENV_PATCHED = Symbol("qwikEnvDataPatched");

const sanitizeEnvData = (value) => {
  const sanitized = sanitizeServerData(value);
  if (sanitized?.qwikcity) {
    // Keep qwikcity.ev intact for dev server
  }
  return sanitized;
};

const qwikEnvDataSanitizer = () => ({
  name: "qwik-env-data-sanitizer",
  enforce: "pre",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      if (!res[QWIK_ENV_PATCHED]) {
        const existing = res._qwikEnvData;
        let store =
          existing === undefined ? undefined : sanitizeEnvData(existing);
        Object.defineProperty(res, "_qwikEnvData", {
          configurable: true,
          enumerable: false,
          get() {
            return store;
          },
          set(value) {
            store = value === undefined ? undefined : sanitizeEnvData(value);
          },
        });
        res[QWIK_ENV_PATCHED] = true;
      }
      next();
    });
  },
});

export default defineConfig(({ command, mode }) => {
  const isProdBuild = command === "build" && mode === "production";
  const ssrConfig = {
    resolve: {
      conditions: ["edge-light", "default"],
    },
    ...(isProdBuild
      ? {
          noExternal: [
            "@neondatabase/serverless",
            "better-auth",
            "better-auth/client",
          ],
        }
      : {}),
  };

  return {
    plugins: [
      qwikEnvDataSanitizer(),
      qwikCity(),
      qwikVite(),
      tsconfigPaths({ root: "." }),
    ],
    optimizeDeps: {
      exclude: [],
    },
    resolve: {
      conditions: ["edge-light", "browser", "default"],
    },
    server: {
      headers: {
        "Cache-Control": "public, max-age=0",
      },
    },
    preview: {
      headers: {
        "Cache-Control": "public, max-age=600",
      },
    },
    ssr: ssrConfig,
  };
});
