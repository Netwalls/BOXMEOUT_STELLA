/**
 * B-129: modules that write audit rows must reuse the shared Prisma client from
 * src/db.ts instead of opening their own connection pool. This is a source-level
 * guard so it does not depend on compiling the audit middleware's Prisma types.
 */
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..");
const readSrc = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("shared Prisma client (B-129)", () => {
  it.each([
    "api/middleware/audit-log.middleware.ts",
    "services/audit.service.ts",
  ])("%s imports the shared client and does not construct PrismaClient", (rel) => {
    const source = readSrc(rel);
    expect(source).toMatch(/import \{ db as prisma \} from "[./]+\/db";/);
    expect(source).not.toMatch(/new PrismaClient\(/);
  });
});
