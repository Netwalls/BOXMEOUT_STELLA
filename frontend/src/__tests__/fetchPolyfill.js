// Polyfill fetch + stream globals for jsdom (Node 18+ has them but jsdom doesn't expose them)
const { fetch, Request, Response, Headers, FormData, TextDecoderStream, TextEncoderStream, ReadableStream, WritableStream, TransformStream } = globalThis;
Object.assign(global, { fetch, Request, Response, Headers, FormData, TextDecoderStream, TextEncoderStream, ReadableStream, WritableStream, TransformStream });
