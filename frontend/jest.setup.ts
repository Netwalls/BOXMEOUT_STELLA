import "@testing-library/jest-dom";

// lib/config.ts validates the environment when it loads, so tests need a valid API URL.
process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:3001";
