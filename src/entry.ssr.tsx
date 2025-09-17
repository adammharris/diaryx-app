/**
 * WHAT IS THIS FILE?
 *
 * SSR entry point, in all cases the application is rendered outside the browser, this
 * entry point will be the common one.
 *
 * - Server (express, cloudflare...)
 * - npm run start
 * - npm run preview
 * - npm run build
 *
 */
import {
  renderToStream,
  type RenderToStreamOptions,
} from "@builder.io/qwik/server";
import Root from "./root";

export default function (opts: RenderToStreamOptions) {
  const sanitizeServerData = (
    value: unknown,
    seen = new WeakMap<object, unknown>()
  ): unknown => {
    if (value == null) return value;
    if (typeof value !== "object") return value;
    if (seen.has(value as object)) {
      return seen.get(value as object);
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof URL) {
      return value.toString();
    }

    if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) {
      return undefined;
    }
    if (
      (typeof Response !== "undefined" && value instanceof Response) ||
      (typeof Request !== "undefined" && value instanceof Request)
    ) {
      return undefined;
    }

    if (Array.isArray(value)) {
      const clone: unknown[] = [];
      seen.set(value as object, clone);
      for (const item of value) {
        clone.push(sanitizeServerData(item, seen));
      }
      return clone;
    }

    const output: Record<string, unknown> = {};
    seen.set(value as object, output);
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
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

  const safeServerData = opts.serverData
    ? (sanitizeServerData(opts.serverData) as RenderToStreamOptions["serverData"])
    : undefined;

  return renderToStream(<Root />, {
    ...opts,
    // Use container attributes to set attributes on the html tag.
    containerAttributes: {
      lang: "en-us",
      ...opts.containerAttributes,
    },
    serverData: safeServerData,
  });
}
