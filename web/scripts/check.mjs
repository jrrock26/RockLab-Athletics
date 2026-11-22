#!/usr/bin/env node
/**
 * A dependency-free correctness gate, run before every build.
 *
 * It exists because of six real breakages in one day, five of which were the same two
 * mistakes and only two of which any existing check caught:
 *
 *   1. An identifier used but not imported  (`where` in team.js) -- compiles, fails only
 *      in the browser, inside a try/catch, so it surfaced as "no roster".
 *   2. A `const` read above its declaration (`isAd` in coaches.js) -- a temporal dead
 *      zone throw, which React turns into a blank page.
 *
 * ESLint would find both, but it is not installed here and `next lint` stops to ask.
 * This does the two checks that matter with no network and no dependencies.
 *
 * Deliberately NOT a general linter: no style, no unused vars, no formatting. Only
 * "this will throw at runtime".
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOTS = ['pages', 'components', 'lib'];

/// Names that only ever arrive by import. Using one without importing it is a guaranteed
/// runtime failure, not a style opinion.
const IMPORT_ONLY = [
  // firestore
  'doc', 'collection', 'getDoc', 'getDocs', 'setDoc', 'updateDoc', 'deleteDoc', 'addDoc',
  'query', 'where', 'orderBy', 'limit', 'onSnapshot', 'serverTimestamp', 'writeBatch',
  'arrayUnion', 'arrayRemove', 'runTransaction', 'deleteField', 'getCountFromServer',
  'collectionGroup', 'startAfter', 'endBefore', 'documentId',
  // auth
  'signInWithEmailAndPassword', 'createUserWithEmailAndPassword', 'onAuthStateChanged',
  'signOut', 'updateProfile', 'getAuth', 'sendPasswordResetEmail', 'currentUser',
  // functions
  'httpsCallable', 'getFunctions',
  // react / next
  'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useRouter',
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.js') || full.endsWith('.mjs')) out.push(full);
  }
  return out;
}

function importBlock(source) {
  const matches = source.match(/import[\s\S]*?from\s+['"][^'"]+['"];/g) || [];
  return matches.join('\n');
}

function checkFile(file) {
  const source = readFileSync(file, 'utf8');
  const imports = importBlock(source);
  const problems = [];

  // Strip comments so a name mentioned in prose is not mistaken for a declaration.
  const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  for (const name of IMPORT_ONLY) {
    const used = new RegExp(`(?<![\\w.$])${name}\\s*\\(`).test(body);
    if (!used) continue;
    if (new RegExp(`(?<![\\w.$])${name}\\b`).test(imports)) continue;
    problems.push(`${name} is used but never imported`);
  }

  // Use-before-declaration, narrowed to the case that actually broke the app: a hook
  // callback defined ABOVE a component-level const, referencing it. Hooks run after
  // render, but the closure is created during render, so a const declared later is still
  // in its temporal dead zone when the body is built. Reading a const below its own
  // declaration inside a different function is normal JS and is not flagged.
  const lines = body.split('\n');
  const declared = [];
  lines.forEach((line, i) => {
    const m = line.match(/^  (?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (m) declared.push({ name: m[1], line: i });
  });

  for (const decl of declared) {
    const hookStart = (() => {
      for (let i = decl.line - 1; i >= 0; i -= 1) {
        if (/\b(useEffect|useMemo|useCallback)\s*\(/.test(lines[i])) return i;
        // Leaving the component's own level means any hook above belongs elsewhere.
        if (/^(function|export default function|const \w+ = \()/.test(lines[i])) return -1;
      }
      return -1;
    })();
    if (hookStart < 0) continue;

    const pattern = new RegExp(`(?<![\\w.$])${decl.name}(?![\\w$])`);
    // Include the hook's own opening line: a one-line effect callback references its
    // variables on that line, which is how the real bug looked.
    for (let i = hookStart; i < decl.line; i += 1) {
      if (pattern.test(lines[i])) {
        problems.push(
          `${decl.name} is read at line ${i + 1} inside a hook declared before it (line ${decl.line + 1}) — temporal dead zone`,
        );
        break;
      }
    }
  }

  return problems;
}

const files = ROOTS.flatMap((root) => {
  try { return walk(root); } catch { return []; }
}).filter((f) => !f.endsWith('.test.mjs') && !f.endsWith('.test.js'));

let failures = 0;
for (const file of files) {
  // lib/portal.mjs is a pure module with no hooks; still worth the same checks.
  const problems = checkFile(file);
  if (!problems.length) continue;
  failures += 1;
  console.error(`\n${relative(process.cwd(), file)}`);
  problems.forEach((p) => console.error(`  ✗ ${p}`));
}

if (failures) {
  console.error(`\n${failures} file(s) would throw at runtime. Build stopped.`);
  process.exit(1);
}
console.log(`checked ${files.length} files — no runtime-breaking identifier errors`);
