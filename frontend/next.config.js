const path = require("path");
const { buildSecurityHeaders } = require("./lib/security-headers");

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (see frontend/Dockerfile)
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          isDev: process.env.NODE_ENV !== "production",
          apiUrl: process.env.NEXT_PUBLIC_API_URL,
          sorobanRpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL,
          network: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet",
        }),
      },
    ];
  },
  webpack: (config, { webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      zod: path.resolve(__dirname, "node_modules/next/dist/compiled/zod"),
    };

    // Playwright builds swap the wallet and Soroban layers for mocks (see e2e/mocks)
    if (process.env.NEXT_PUBLIC_E2E === "true") {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^@stellar\/freighter-api$/,
          path.resolve(__dirname, "e2e/mocks/freighter.ts")
        ),
        new webpack.NormalModuleReplacementPlugin(
          /^@creit\.tech\/stellar-wallets-kit$/,
          path.resolve(__dirname, "e2e/mocks/walletKit.ts")
        ),
        new webpack.NormalModuleReplacementPlugin(
          /^@\/lib\/stellar$/,
          path.resolve(__dirname, "e2e/mocks/stellar.ts")
        )
      );
    }
    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);
