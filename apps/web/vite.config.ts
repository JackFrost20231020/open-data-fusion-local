import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

import { mintDevToken, resolveDevAuthSecret } from "../api/src/dev-auth.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repositoryRoot, "");

  return {
    envDir: repositoryRoot,
    plugins: [
      react(),
      {
        name: "odf-csp",
        transformIndexHtml(html, context) {
          const production = context.server === undefined;
          const csp = production
            ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
            : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'self'";
          return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`);
        },
      },
    ],
    preview: {
      headers: {
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
    server: {
      headers: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:4310",
          changeOrigin: true,
          configure(proxy) {
            proxy.on("proxyReq", (proxyReq, req) => {
              const address = req.socket?.remoteAddress ?? "";
              const loopback = address === "127.0.0.1" || address === "::1" || address === ":ffff:127.0.0.1";
              if (!loopback) return;
              try {
                const userHeader = req.headers["x-odf-user"];
                const user = (Array.isArray(userHeader) ? userHeader[0] : userHeader)?.trim()
                  || env.ODF_DEV_USER?.trim()
                  || "local-user";
                const token = mintDevToken(user, { secret: resolveDevAuthSecret(), ttlSeconds: 60 * 60 });
                proxyReq.setHeader("Authorization", `Bearer ${token}`);
              } catch {
                // Leave the request unmodified; the API will reject writes without a token.
              }
            });
          },
        },
      },
    },
  };
});
