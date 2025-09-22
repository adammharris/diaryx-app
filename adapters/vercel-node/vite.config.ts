import { extendConfig } from "@builder.io/qwik-city/vite";
import { vercelNodeAdapter } from "@builder.io/qwik-city/adapters/vercel-node/vite";
import baseConfig from "../../vite.config.mjs";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.vercel-edge.tsx", "@qwik-city-plan"],
      },
      outDir: ".vercel/output/functions/_qwik-city.func",
    },
    plugins: [
      vercelNodeAdapter({
        // ensure any static generation uses a safe worker count for Neon
        ssg: {
          maxWorkers: 1,
        },
      }),
    ],
  };
});
