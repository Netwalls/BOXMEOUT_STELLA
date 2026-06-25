// jest.polyfills.js
// This file runs in the Node environment BEFORE jsdom is applied.
// We capture Node 18+ built-in fetch globals here and expose them so that
// MSW v2 (which extends globalThis.Request) can load in the jsdom test env.
const { fetch, Request, Response, Headers, FormData } = globalThis;

Object.defineProperties(globalThis, {
  fetch:    { value: fetch,    writable: true, configurable: true },
  Request:  { value: Request,  writable: true, configurable: true },
  Response: { value: Response, writable: true, configurable: true },
  Headers:  { value: Headers,  writable: true, configurable: true },
  FormData: { value: FormData, writable: true, configurable: true },
});
