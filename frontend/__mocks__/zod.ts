export const z = {
  object: (shape: Record<string, unknown>) => ({
    safeParse: (data: Record<string, unknown>) => ({
      success: true,
      data: {
        NEXT_PUBLIC_API_URL: data?.NEXT_PUBLIC_API_URL || "http://localhost:3001",
        NEXT_PUBLIC_STELLAR_NETWORK: data?.NEXT_PUBLIC_STELLAR_NETWORK || "testnet",
        NEXT_PUBLIC_SOROBAN_RPC_URL: data?.NEXT_PUBLIC_SOROBAN_RPC_URL,
        NEXT_PUBLIC_MARKET_CONTRACT_ID: data?.NEXT_PUBLIC_MARKET_CONTRACT_ID,
      },
    }),
  }),
  string: () => ({
    url: () => ({
      optional: () => ({}),
    }),
    optional: () => ({}),
  }),
  enum: () => ({
    default: (val: unknown) => val,
  }),
};

export type ZodTypeAny = unknown;
export type infer<T> = any;
