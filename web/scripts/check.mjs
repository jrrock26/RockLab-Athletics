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

/// Identifiers that exist without being declared in the file.
const GLOBALS = new Set([
  'window', 'document', 'navigator', 'console', 'Math', 'JSON', 'Date', 'Number', 'String',
  'Boolean', 'Array', 'Object', 'Promise', 'Set', 'Map', 'Error', 'RegExp', 'parseInt',
  'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'setTimeout',
  'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'Blob', 'URL', 'File', 'FormData',
  'React', 'undefined', 'null', 'true', 'false', 'NaN', 'Infinity', 'process',
]);

/// Every name this file binds: imports, destructuring, declarations, parameters, functions.
///
/// A crude but effective approximation of scope. It over-collects (a name declared anywhere
/// is treated as bound everywhere), which means it cannot flag a genuinely out-of-scope use
/// in a nested block -- but it does catch the case that shipped: a JSX attribute referring to
/// a name the component never destructured, which throws on first render.
/// Adds the names bound by a destructuring or parameter pattern, tolerating defaults and
/// renames: `{ a, b: c, d = 1, ...rest }` binds a, c, d, rest.
function addFromPattern(pattern, names) {
  // Take the inside of the first brace or bracket group, ignoring any trailing `= {}`
  // default, so `{ locale, timeZone } = {}` splits correctly.
  const group = String(pattern).match(/[{[](.*)[}\]]/s);
  const inner = group ? group[1] : String(pattern);
  inner.split(',').forEach((piece) => {
    const withoutDefault = piece.split('=')[0];
    const parts = withoutDefault.split(':');
    const raw = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim().replace(/^\.\.\./, '');
    if (/^[A-Za-z_$][\w$]*$/.test(raw)) names.add(raw);
  });
}

function boundNames(source, imports) {
  const names = new Set();

  for (const m of imports.matchAll(/import\s+([\s\S]*?)\s+from/g)) {
    const clause = m[1];
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) names.add(ns[1]);
    const braced = clause.match(/\{([\s\S]*)\}/);
    if (braced) addFromPattern(braced[1], names);
    const dflt = clause.replace(/\{[\s\S]*\}/, '').replace(/\*\s+as\s+[\w$]+/, '').replace(/,/g, '').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(dflt)) names.add(dflt);
  }

  // const { a, b: c } = ...   /   const [x, y] = ...   /   const z = ...
  for (const m of source.matchAll(/\b(?:const|let|var)\s+(?:\{([^}]*)\}|\[([^\]]*)\]|([A-Za-z_$][\w$]*))/g)) {
    if (m[1]) m[1].split(',').forEach((piece) => {
      const alias = piece.split(':');
      const name = (alias[1] || alias[0] || '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    });
    if (m[2]) m[2].split(',').forEach((piece) => {
      const name = piece.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    });
    if (m[3]) names.add(m[3]);
  }

  // function foo(  /  (a, b) =>  /  function (a) -- params may be destructured
  for (const m of source.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of source.matchAll(/function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g)) {
    m[1].split(/\s*,\s*(?![^{]*\})/).forEach((piece) => {
      const trimmed = piece.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        addFromPattern(trimmed, names);
      } else {
        const name = trimmed.split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    });
  }
  for (const m of source.matchAll(/\(([^()]*)\)\s*=>/g)) {
    m[1].split(/\s*,\s*(?![^{]*\})/).forEach((piece) => {
      const trimmed = piece.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        addFromPattern(trimmed, names);
      } else {
        const name = trimmed.split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    });
  }
  for (const m of source.matchAll(/(?:^|[\s(,])([A-Za-z_$][\w$]*)\s*=>/gm)) names.add(m[1]);

  return names;
}

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

  // A bare identifier inside JSX braces -- {user}, profile={user} -- must be bound in this
  // file or it is a ReferenceError on the first render. React reports that as "a client-side
  // exception has occurred", which names neither the file nor the identifier: /import threw
  // exactly this way on `user` and the message told you nothing.
  const bound = boundNames(body, imports);
  const reported = new Set();
  const looksLikeJsx = file.endsWith('.js');
  if (looksLikeJsx) {
    for (const m of body.matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
      const name = m[1];
      if (reported.has(name) || bound.has(name) || GLOBALS.has(name)) continue;
      reported.add(name);
      problems.push(`${name} is used in JSX but never declared in this file`);
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
