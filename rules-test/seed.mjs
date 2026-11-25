/**
 * Fill the emulators with the same fixtures the rules tests use, so the Emulator UI at
 * http://127.0.0.1:4000 shows a database that looks like a real school instead of an
 * empty one.
 *
 * Start the emulators first (`npm run emulators` from this directory), then
 * `npm run seed`. Writes here go through `withSecurityRulesDisabled` because the
 * fixtures model what the Cloud Functions create with the Admin SDK.
 */
import { initEnv } from './tests/_env.mjs';
import { seedFixtures } from './tests/fixtures.mjs';

const env = await initEnv();
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  await seedFixtures(ctx.firestore());
});
await env.cleanup();

console.log('Seeded demo-rocklab-athletics: 2 schools, 1 team, 2 families, 1 invitation.');
