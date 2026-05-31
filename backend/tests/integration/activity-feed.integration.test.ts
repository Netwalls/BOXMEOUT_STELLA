// tests/integration/activity-feed.integration.test.ts
// Integration test: buy shares → WebSocket client receives trade event

import http from 'http';
import { WebSocket } from 'ws';
import { ActivityFeed, type ActivityEvent } from '../../src/websocket/realtime';

function waitForMessage(ws: WebSocket, timeoutMs = 1000): Promise<ActivityEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for WS message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as ActivityEvent);
    });
  });
}

describe('ActivityFeed integration', () => {
  let server: http.Server;
  let feed: ActivityFeed;
  let port: number;

  beforeAll((done) => {
    server = http.createServer();
    feed = new ActivityFeed(server);
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      done();
    });
  });

  afterAll((done) => {
    feed.close();
    server.close(done);
  });

  it('delivers a trade event to a subscribed client after buying shares', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Subscribe to market activity
    ws.send(JSON.stringify({ type: 'subscribe_activity', marketId: 'market-1' }));

    // Simulate a buy-shares trade event
    const tradeEvent: ActivityEvent = {
      type: 'trade',
      marketId: 'market-1',
      outcomeId: 'outcome-a',
      side: 'buy',
      sharesAmount: 100,
      priceBps: 5000,
      timestamp: new Date().toISOString(),
    };

    // Small tick to ensure subscription is registered before publish
    await new Promise((r) => setImmediate(r));

    feed.publish(tradeEvent);

    const received = await waitForMessage(ws);

    expect(received).toEqual(tradeEvent);

    ws.close();
  });

  it('does not deliver events to unsubscribed markets', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Subscribe to a different market
    ws.send(JSON.stringify({ type: 'subscribe_activity', marketId: 'market-other' }));
    await new Promise((r) => setImmediate(r));

    const messages: string[] = [];
    ws.on('message', (d) => messages.push(d.toString()));

    feed.publish({ type: 'trade', marketId: 'market-1', outcomeId: 'o', side: 'buy', sharesAmount: 1, priceBps: 1, timestamp: '' });

    await new Promise((r) => setTimeout(r, 100));
    expect(messages).toHaveLength(0);

    ws.close();
  });

  it('rate-limits to 20 events/sec per market', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    ws.send(JSON.stringify({ type: 'subscribe_activity', marketId: 'market-rl' }));
    await new Promise((r) => setImmediate(r));

    const received: string[] = [];
    ws.on('message', (d) => received.push(d.toString()));

    // Publish 25 events — only 20 should get through
    for (let i = 0; i < 25; i++) {
      feed.publish({ type: 'trade', marketId: 'market-rl', outcomeId: 'o', side: 'buy', sharesAmount: i, priceBps: 1, timestamp: '' });
    }

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(20);

    ws.close();
  });
});
