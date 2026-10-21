// Runs once before the whole Jest run. Unit tests mock their infrastructure,
// so there is nothing to start here; the hook exists so integration suites
// can add database setup later without touching the Jest config.
export default async function globalSetup(): Promise<void> {
  return;
}
