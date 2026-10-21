// Security headers applied to every route. Written as CommonJS so that
// next.config.js can require it directly; the TypeScript app imports it too.

const HORIZON_URLS = {
  testnet: "https://horizon-testnet.stellar.org",
  mainnet: "https://horizon.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
};

/**
 * Returns the origin of a configured URL, or throws naming the variable that
 * is wrong. Keeps a typo in an env var from silently producing a broken CSP.
 */
function toOrigin(value, name) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${name} must be a valid URL, got "${value}"`);
  }
}

/**
 * Lists the origins the browser may open connections to: the API (also used
 * for the market EventSource stream), Horizon for the network, and the Soroban
 * RPC when one is configured.
 */
function buildConnectSrc({ apiUrl, sorobanRpcUrl, network }) {
  const sources = ["'self'", toOrigin(apiUrl, "NEXT_PUBLIC_API_URL")];

  const horizonUrl = HORIZON_URLS[network];
  if (horizonUrl) sources.push(horizonUrl);

  if (sorobanRpcUrl) {
    sources.push(toOrigin(sorobanRpcUrl, "NEXT_PUBLIC_SOROBAN_RPC_URL"));
  }

  return [...new Set(sources)];
}

/**
 * Builds the Content-Security-Policy. `'unsafe-inline'` for scripts is needed
 * by Next's hydration payload; `'unsafe-eval'` is only added in development,
 * where React's debugging tools require it.
 */
function buildCsp({ isDev, connectSrc }) {
  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connectSrc,
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/**
 * Returns the header list for Next's `headers()` config.
 *
 * @param {object} options
 * @param {boolean} options.isDev
 * @param {string} options.apiUrl          NEXT_PUBLIC_API_URL
 * @param {string} [options.sorobanRpcUrl] NEXT_PUBLIC_SOROBAN_RPC_URL
 * @param {string} options.network         NEXT_PUBLIC_STELLAR_NETWORK
 * @returns {{ key: string, value: string }[]}
 */
function buildSecurityHeaders({ isDev, apiUrl, sorobanRpcUrl, network }) {
  const connectSrc = buildConnectSrc({ apiUrl, sorobanRpcUrl, network });

  return [
    { key: "Content-Security-Policy", value: buildCsp({ isDev, connectSrc }) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  ];
}

module.exports = { buildSecurityHeaders, buildConnectSrc, buildCsp, HORIZON_URLS };
