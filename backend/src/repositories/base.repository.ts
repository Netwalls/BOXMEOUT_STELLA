// Base repository with common CRUD operations
import { PrismaClient } from '@prisma/client';
import { prisma } from '../database/prisma.js';

export abstract class BaseRepository<T> {
  protected prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || prisma;
  }

  abstract getModelName(): string;

  protected getModel() {
    return (this.prisma as any)[this.getModelName()];
  }

  async findById(id: string): Promise<T | null> {
    return await this.getModel().findUnique({
      where: { id },
    });
  }

  async findMany(options?: {
    where?: any;
    orderBy?: any;
    skip?: number;
    take?: number;
    include?: any;
  }): Promise<T[]> {
    return await this.getModel().findMany(options);
  }

  async create(data: any): Promise<T> {
    return await this.getModel().create({
      data,
    });
  }

  async update(id: string, data: any): Promise<T> {
    return await this.getModel().update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<T> {
    return await this.getModel().delete({
      where: { id },
    });
  }

  async count(where?: any): Promise<number> {
    return await this.getModel().count({ where });
  }

  async exists(where: any): Promise<boolean> {
    const count = await this.getModel().count({ where });
    return count > 0;
  }
}
