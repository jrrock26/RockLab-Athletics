/**
 * Known defects, recorded where the fix will land.
 *
 * These are `todo`, not `skip`: the runner reports them as TODO, so the suite does not
 * claim coverage it does not have. Phase 2 turns each one into a real assertion at the
 * same time as the rule change, which is the point of writing them down now.
 *
 * The evidence for each is in the v2 roadmap's defect register (D-1, D-2, D-3).
 */
import { test } from 'node:test';

test.todo('D-1: the AD of school A cannot read users in school B (isAd() is not school-scoped)', () => {});
test.todo('D-2: the AD of school A cannot read another school\'s moderation reports', () => {});
test.todo('D-3: a guardian cannot overwrite a document that staff already reviewed', () => {});
