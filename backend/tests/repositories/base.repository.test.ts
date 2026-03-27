// Unit tests for BaseRepository
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BaseRepository,
  RepositoryError,
} from '../../src/repositories/base.repository.js';

// Helper: create a fake PrismaClientKnownRequestError (duck-typed)
function makePrismaKnownError(code: string): Error & { code: string } {
  const err = new Error(`Prisma error ${code}`) as Error & { code: string };
  err.name = 'PrismaClientKnownRequestError';
  err.code = code;
  Object.defineProperty(err, 'constructor', {
    value: { name: 'PrismaClientKnownRequestError' },
  });
  return err;
}

// ─── Minimal concrete subclass for testing ────────────────────────────────────

class TestRepository extends BaseRepository<{ id: string; name: string }> {
  getModelName(): string {
    return 'testModel';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockModel(overrides: Record<string, unknown> = {}) {
  return {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function makePrismaClient(model: ReturnType<typeof makeMockModel>) {
  return { testModel: model } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BaseRepository', () => {
  let mockModel: ReturnType<typeof makeMockModel>;
  let repo: TestRepository;

  beforeEach(() => {
    mockModel = makeMockModel();
    repo = new TestRepository(makePrismaClient(mockModel));
  });

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns null when record does not exist', async () => {
      mockModel.findUnique.mockResolvedValue(null);

      const result = await repo.findById('non-existent-id');

      expect(result).toBeNull();
      expect(mockModel.findUnique).toHaveBeenCalledWith({
        where: { id: 'non-existent-id' },
      });
    });

    it('returns the record when it exists', async () => {
      const record = { id: '123', name: 'test' };
      mockModel.findUnique.mockResolvedValue(record);

      const result = await repo.findById('123');

      expect(result).toEqual(record);
    });

    it('forwards select and include options', async () => {
      const select = { id: true };
      const include = { relations: true };
      await repo.findById('123', { select, include });

      expect(mockModel.findUnique).toHaveBeenCalledWith({
        where: { id: '123' },
        select,
        include,
      });
    });

    it('throws RepositoryError on Prisma known error', async () => {
      const prismaError = makePrismaKnownError('P2002');
      mockModel.findUnique.mockRejectedValue(prismaError);

      await expect(repo.findById('123')).rejects.toBeInstanceOf(
        RepositoryError
      );
    });
  });

  // ── findMany ──────────────────────────────────────────────────────────────

  describe('findMany', () => {
    it('returns empty array when no records exist', async () => {
      const result = await repo.findMany();
      expect(result).toEqual([]);
    });

    it('passes where, select, orderBy, skip, take, include to Prisma', async () => {
      const options = {
        where: { name: 'x' },
        select: { id: true },
        orderBy: { id: 'asc' },
        skip: 5,
        take: 10,
        include: { rel: true },
      };
      await repo.findMany(options);
      expect(mockModel.findMany).toHaveBeenCalledWith(options);
    });

    it('throws RepositoryError on Prisma error', async () => {
      mockModel.findMany.mockRejectedValue(makePrismaKnownError('P2025'));
      await expect(repo.findMany()).rejects.toBeInstanceOf(RepositoryError);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a record and returns it', async () => {
      const record = { id: '1', name: 'new' };
      mockModel.create.mockResolvedValue(record);

      const result = await repo.create({ name: 'new' });

      expect(result).toEqual(record);
      expect(mockModel.create).toHaveBeenCalledWith({ data: { name: 'new' } });
    });

    it('throws RepositoryError on unique constraint violation', async () => {
      mockModel.create.mockRejectedValue(makePrismaKnownError('P2002'));
      await expect(repo.create({ name: 'dup' })).rejects.toMatchObject({
        code: 'UNIQUE_CONSTRAINT',
      });
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates a record and returns it', async () => {
      const updated = { id: '1', name: 'updated' };
      mockModel.update.mockResolvedValue(updated);

      const result = await repo.update('1', { name: 'updated' });

      expect(result).toEqual(updated);
      expect(mockModel.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'updated' },
      });
    });

    it('throws RepositoryError with NOT_FOUND when record is missing', async () => {
      mockModel.update.mockRejectedValue(makePrismaKnownError('P2025'));
      await expect(repo.update('missing', {})).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes a record and returns it', async () => {
      const deleted = { id: '1', name: 'gone' };
      mockModel.delete.mockResolvedValue(deleted);

      const result = await repo.delete('1');

      expect(result).toEqual(deleted);
      expect(mockModel.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('throws RepositoryError on Prisma error', async () => {
      mockModel.delete.mockRejectedValue(makePrismaKnownError('P2025'));
      await expect(repo.delete('missing')).rejects.toBeInstanceOf(
        RepositoryError
      );
    });
  });

  // ── count ─────────────────────────────────────────────────────────────────

  describe('count', () => {
    it('returns 0 when no records match', async () => {
      const result = await repo.count({ name: 'nobody' });
      expect(result).toBe(0);
    });

    it('passes where clause to Prisma', async () => {
      mockModel.count.mockResolvedValue(3);
      const result = await repo.count({ name: 'x' });
      expect(result).toBe(3);
      expect(mockModel.count).toHaveBeenCalledWith({ where: { name: 'x' } });
    });
  });

  // ── RepositoryError ───────────────────────────────────────────────────────

  describe('RepositoryError', () => {
    it('has the correct name and code', () => {
      const err = new RepositoryError('NOT_FOUND', 'not found');
      expect(err.name).toBe('RepositoryError');
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('not found');
    });

    it('preserves the original cause', () => {
      const cause = new Error('original');
      const err = new RepositoryError('UNKNOWN', 'wrapped', cause);
      expect(err.cause).toBe(cause);
    });
  });
});
