import { defineConfig } from "vite";
import { qwikVite } from "@builder.io/qwik/optimizer";
import { qwikCity } from "@builder.io/qwik-city/vite";
import tsconfigPaths from "vite-tsconfig-paths";

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
    plugins: [qwikCity(), qwikVite(), tsconfigPaths({ root: "." })],
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
