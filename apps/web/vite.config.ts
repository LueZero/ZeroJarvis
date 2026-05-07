import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import basicSsl from "@vitejs/plugin-basic-ssl";

const require = createRequire(import.meta.url);

/** Serve onnxruntime-web .mjs / .wasm files directly from node_modules so
 *  Vite's pre-bundler doesn't break their dynamic-import chain. */
function onnxruntimePlugin(): Plugin {
  let distDir: string;
  try {
    distDir = join(dirname(require.resolve("onnxruntime-web/package.json")), "dist");
  } catch {
    distDir = join(process.cwd(), "node_modules/onnxruntime-web/dist");
  }

  return {
    name: "vite-plugin-onnxruntime",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (/^\/ort-.*\.(mjs|wasm|js)$/.test(pathname)) {
          const filePath = join(distDir, pathname.slice(1));
          if (existsSync(filePath)) {
            const ct = pathname.endsWith(".wasm")
              ? "application/wasm"
              : "application/javascript";
            res.writeHead(200, { "Content-Type": ct });
            res.end(readFileSync(filePath));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [sveltekit(), onnxruntimePlugin(), basicSsl()],
  optimizeDeps: {
    include: ["onnxruntime-web", "@ricky0123/vad-web"],
  },
  server: {
    proxy: {
      "/ws": {
        target: "ws://localhost:3100",
        ws: true,
      },
      "/api": {
        target: "http://localhost:3100",
      },
      "/files": {
        target: "http://localhost:3100",
      },
    },
  },
});
