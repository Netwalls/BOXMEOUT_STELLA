import type { Request, Response, NextFunction } from 'express';
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { requireAdminJwt } from '../../src/middleware/requireAdminJwt.middleware';
import { AppError } from '../../src/utils/AppError';

const SECRET = 'test-secret';

function makeReqRes(authHeader?: string) {
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request;
  const res = {} as Response;
  const next = jest.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('requireAdminJwt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = SECRET;
  });

  it('calls next() with no error for a valid admin JWT', () => {
    const token = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '1h' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);
    requireAdminJwt(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 401 when Authorization header is missing', () => {
    const { req, res, next } = makeReqRes();
    requireAdminJwt(req, res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('returns 401 when Authorization header has no Bearer prefix', () => {
    const token = jwt.sign({ role: 'admin' }, SECRET);
    const { req, res, next } = makeReqRes(token);
    requireAdminJwt(req, res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
  });

  it('returns 401 for an expired token', () => {
    const token = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: -1 });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);
    requireAdminJwt(req, res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', () => {
    const token = jwt.sign({ role: 'admin' }, 'wrong-secret');
    const { req, res, next } = makeReqRes(`Bearer ${token}`);
    requireAdminJwt(req, res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
  });

  it('returns 403 for a valid JWT with a non-admin role', () => {
    const token = jwt.sign({ role: 'user' }, SECRET);
    const { req, res, next } = makeReqRes(`Bearer ${token}`);
    requireAdminJwt(req, res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });
});
