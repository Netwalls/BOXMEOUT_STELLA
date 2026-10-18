/**
 * Runs once before the whole Jest run. Nothing needs preparing yet: CI applies
 * migrations with `prisma migrate deploy` before `npm test`, and tests that need
 * a database or Redis connect to the services in their environment.
 */
export default async function globalSetup(): Promise<void> {}
