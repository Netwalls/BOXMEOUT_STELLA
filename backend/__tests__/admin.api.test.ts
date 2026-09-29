import request from 'supertest';
import express from 'express';

// Mock the service boundary so no real contract calls are made.
jest.mock('../src/services/admin.service', () => ({
  resolveDispute: jest.fn(),
  resolveAdminAction: jest.fn(),
  createOracle: jest.fn(),
  updateOracle: jest.fn(),
  deleteOracle: jest.fn(),
  listOracles: jest.fn(),
}));

import * as adminService from '../src/services/admin.service';
import { createAdminRouter } from '../src/routes/admin.routes';

const mockedService = adminService as jest.Mocked<typeof adminService>;

function buildApp(opts: { authenticated?: boolean } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (opts.authenticated) {
      (req as any).user = { id: 'admin-1', role: 'admin' };
    }
    next();
  });
  app.use('/admin', createAdminRouter());
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /admin/resolve', () => {
  const body = { marketId: 'm-1', outcome: 'yes' };

  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post('/admin/resolve').send(body);
    expect(res.status).toBe(401);
    expect(mockedService.resolveAdminAction).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid body', async () => {
    const res = await request(buildApp({ authenticated: true }))
      .post('/admin/resolve')
      .send({ outcome: 'yes' });
    expect(res.status).toBe(400);
    expect(mockedService.resolveAdminAction).not.toHaveBeenCalled();
  });

  it('resolves successfully', async () => {
    mockedService.resolveAdminAction.mockResolvedValue({ id: 'm-1', resolved: true } as any);
    const res = await request(buildApp({ authenticated: true }))
      .post('/admin/resolve')
      .send(body);
    expect(res.status).toBe(200);
    expect(mockedService.resolveAdminAction).toHaveBeenCalledWith(body);
  });
});

describe('POST /admin/dispute-resolve', () => {
  const body = { disputeId: 'd-1', resolution: 'upheld' };

  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post('/admin/dispute-resolve').send(body);
    expect(res.status).toBe(401);
    expect(mockedService.resolveDispute).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid body', async () => {
    const res = await request(buildApp({ authenticated: true }))
      .post('/admin/dispute-resolve')
      .send({ resolution: 'upheld' });
    expect(res.status).toBe(400);
    expect(mockedService.resolveDispute).not.toHaveBeenCalled();
  });

  it('resolves the dispute successfully', async () => {
    mockedService.resolveDispute.mockResolvedValue({ id: 'd-1', resolved: true } as any);
    const res = await request(buildApp({ authenticated: true }))
      .post('/admin/dispute-resolve')
      .send(body);
    expect(res.status).toBe(200);
    expect(mockedService.resolveDispute).toHaveBeenCalledWith(body);
  });
});

describe('oracle CRUD', () => {
  const oracle = { id: 'o-1', address: '0xabc', name: 'Oracle' };

  it('POST /admin/oracles returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).post('/admin/oracles').send(oracle);
    expect(res.status).toBe(401);
    expect(mockedService.createOracle).not.toHaveBeenCalled();
  });

  it('POST /admin/oracles returns 400 for an invalid body', async () => {
    const res = await request(buildApp({ authenticated: true }))
      .post('/admin/oracles')
      .send({ name: 'Oracle' });
    expect(res.status).toBe(400);
    expect(mockedService.createOracle).not.toHaveBeenCalled();
  });

  it('POST /admin/oracles creates an oracle', async () => {
    mockedService.createOracle.mockResolvedValue(oracle as any);
    const res = await request(buildApp({ authenticated: true }))
      .post('/admin/oracles')
      .send(oracle);
    expect(res.status).toBe(201);
    expect(mockedService.createOracle).toHaveBeenCalledWith(oracle);
  });

  it('PUT /admin/oracles/:id returns 401 when unauthenticated', async () => {
    const res = await request(buildApp())
      .put('/admin/oracles/o-1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(401);
    expect(mockedService.updateOracle).not.toHaveBeenCalled();
  });

  it('PUT /admin/oracles/:id returns 400 for an invalid body', async () => {
    const res = await request(buildApp({ authenticated: true }))
      .put('/admin/oracles/o-1')
      .send({});
    expect(res.status).toBe(400);
    expect(mockedService.updateOracle).not.toHaveBeenCalled();
  });

  it('PUT /admin/oracles/:id updates an oracle', async () => {
    mockedService.updateOracle.mockResolvedValue({ ...oracle, name: 'Updated' } as any);
    const res = await request(buildApp({ authenticated: true }))
      .put('/admin/oracles/o-1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(mockedService.updateOracle).toHaveBeenCalledWith('o-1', { name: 'Updated' });
  });

  it('DELETE /admin/oracles/:id returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).delete('/admin/oracles/o-1');
    expect(res.status).toBe(401);
    expect(mockedService.deleteOracle).not.toHaveBeenCalled();
  });

  it('DELETE /admin/oracles/:id deletes an oracle', async () => {
    mockedService.deleteOracle.mockResolvedValue(undefined as any);
    const res = await request(buildApp({ authenticated: true })).delete('/admin/oracles/o-1');
    expect(res.status).toBe(204);
    expect(mockedService.deleteOracle).toHaveBeenCalledWith('o-1');
  });
});
