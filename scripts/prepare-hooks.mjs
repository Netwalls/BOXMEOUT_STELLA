// Installs git hooks via husky during `npm install`.
// Skipped in CI and when the checkout has no .git directory (e.g. a zip download),
// so a fresh clone never fails to install because hooks could not be set up.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.env.CI) process.exit(0);
if (!existsSync('.git')) process.exit(0);

try {
  execSync('npx --no-install husky', { stdio: 'inherit' });
} catch {
  console.warn('[prepare-hooks] Could not install git hooks; continuing without them.');
}
