import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "util";

// stellar-sdk v15 needs these globals, which jsdom does not provide.
Object.assign(globalThis, { TextEncoder, TextDecoder });

process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
process.env.NEXT_PUBLIC_STELLAR_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";
process.env.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
