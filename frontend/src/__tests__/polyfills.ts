/* eslint @typescript-eslint/no-require-imports: "off" */
export {};

const { TextDecoder, TextEncoder } = require('node:util');
const { ReadableStream, TransformStream, WritableStream } = require('node:stream/web');
const { BroadcastChannel } = require('node:worker_threads');

Object.defineProperties(globalThis, {
  ReadableStream: { value: ReadableStream, configurable: true, writable: true },
  BroadcastChannel: { value: BroadcastChannel, configurable: true, writable: true },
  TextDecoder: { value: TextDecoder, configurable: true, writable: true },
  TextEncoder: { value: TextEncoder, configurable: true, writable: true },
  TransformStream: { value: TransformStream, configurable: true, writable: true },
  WritableStream: { value: WritableStream, configurable: true, writable: true },
});

const { fetch, FormData, Headers, Request, Response } = require('undici');

Object.defineProperties(globalThis, {
  fetch: { value: fetch, configurable: true, writable: true },
  FormData: { value: FormData, configurable: true, writable: true },
  Headers: { value: Headers, configurable: true, writable: true },
  Request: { value: Request, configurable: true, writable: true },
  Response: { value: Response, configurable: true, writable: true },
});