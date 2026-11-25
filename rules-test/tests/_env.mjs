/**
 * One place that knows how to talk to the emulators under test.
 *
 * Everything here is offline. The project id starts with `demo-`, which is the
 * Firebase convention for "never contact a real project": the emulators accept it
 * without a login, without a `.firebaserc` entry, and without creating anything in
 * the console. There is deliberately no staging project to fall back to.
 *
 * Host/port come from the variables `firebase emulators:exec` sets, so the same
 * suites can be pointed at a different port (used to prove the harness fails when a
 * rule is deliberately broken) without editing this file.
 */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

export const PROJECT_ID = 'demo-rocklab-athletics';

function endpoint(name, fallbackPort) {
  const raw = process.env[name];
  if (!raw) return { host: '127.0.0.1', port: fallbackPort };
  // The emulator exports disagree on shape: FIRESTORE_EMULATOR_HOST is
  // "127.0.0.1:8080" while STORAGE_EMULATOR_HOST is "http://127.0.0.1:9199".
  // Parsing both through URL() handles either, and a bare host:port.
  const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
  return { host: url.hostname, port: Number(url.port || fallbackPort) };
}

/// Rules are read from the repo, not copied. A test run therefore always exercises
/// exactly what `firebase deploy --only firestore,storage` would upload.
export function initEnv() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      ...endpoint('FIRESTORE_EMULATOR_HOST', 8080),
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
    storage: {
      ...endpoint('STORAGE_EMULATOR_HOST', 9199),
      rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8'),
    },
  });
}

/// A fresh environment with the seed data written past the rules.
///
/// Seeding with `withSecurityRulesDisabled` is not a loophole in the tests: the
/// documents model what the Cloud Functions (Admin SDK) and onboarding actually
/// create, which no client is allowed to write directly.
export async function freshEnv(seedFixtures) {
  const env = await initEnv();
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await seedFixtures(ctx.firestore());
  });
  return env;
}
