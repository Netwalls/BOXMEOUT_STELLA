const path = require("path");

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (see frontend/Dockerfile)
  output: "standalone",
  webpack: (config, { webpack }) => {
    // Playwright builds swap the wallet and Soroban layers for mocks (see e2e/mocks)
    if (process.env.NEXT_PUBLIC_E2E === "true") {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^@stellar\/freighter-api$/,
          path.resolve(__dirname, "e2e/mocks/freighter.ts")
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
