#!/usr/bin/env node
/**
 * Catches a component reaching for something it cannot see.
 *
 *   node tests/component-scope.test.js
 *
 * This exists because of a real outage. A find-and-replace rewrote
 *
 *     onChange={setFirstName}   ->   onChange={edit(setFirstName)}
 *
 * everywhere in app/_jubilee-id-door.js — including inside NameFields and
 * DobField, which are declared at MODULE level and therefore cannot see `edit`,
 * a helper declared inside JubileeIdDoor.
 *
 * `next build` compiled it without complaint: it is not a syntax error, it is a
 * ReferenceError thrown while RENDERING. Those two components appear on exactly
 * two screens — Create Account and Create your Jubilee ID — so both sign-up
 * screens died in the browser while every other screen, the build, and all 227
 * other assertions stayed green.
 *
 * The rule: a component declared at module level may not reference an
 * identifier that is only declared inside another component. A linter with
 * no-undef would catch this; there is no linter here, so this does.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? '\n         ' + d : '')); } };

const APP = path.join(__dirname, '..', 'app');

function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (e.name.endsWith('.js') && !p.includes(`${path.sep}api${path.sep}`)) out.push(p);
    }
    return out;
}

/** The body of the LAST top-level function in the file — the page component. */
function mainComponentBody(src) {
    const m = /\nexport default function\s+(\w+)\s*\([^)]*\)\s*\{/.exec(src);
    if (!m) return null;
    const start = m.index + m[0].length;
    let depth = 1, i = start;
    while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
    }
    return { name: m[1], body: src.slice(start, i - 1), from: m.index, to: i };
}

/**
 * Names declared at the TOP level of a body — not inside a nested function.
 *
 * Depth matters. `const r = await postJson(…)` inside a submit handler is a
 * local nobody could reference from outside anyway, and counting it is pure
 * noise: single-letter locals collide with almost any text. What this looks for
 * is the component's own helpers — `edit`, `goto` — which read like
 * module-level functions and are not.
 */
function declaredNames(body, topLevelOnly) {
    const names = new Set();
    let depth = 0;
    for (const line of body.split('\n')) {
        if (!topLevelOnly || depth === 0) {
            for (const re of [/\b(?:const|let|var)\s+(\w+)\s*=/g, /\bfunction\s+(\w+)\s*\(/g]) {
                let m;
                while ((m = re.exec(line))) names.add(m[1]);
            }
        }
        for (const c of line) { if (c === '{') depth++; else if (c === '}') depth--; }
    }
    return names;
}

console.log('\nNo module-level component reaches into a page component');

for (const file of walk(APP)) {
    const src = fs.readFileSync(file, 'utf8');
    const main = mainComponentBody(src);
    if (!main) continue;

    const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
    const outside = src.slice(0, main.from) + src.slice(main.to);
    const inner = declaredNames(main.body, true);
    const moduleLevel = declaredNames(outside, false);

    const leaks = [];
    for (const name of inner) {
        if (moduleLevel.has(name)) continue;               // also declared outside — fine
        // Used outside the page component, as a call or a value.
        const used = new RegExp(`(?<![\\w.$])${name}\\s*[\\(<.,)\\]}=;]`).test(outside);
        if (used) leaks.push(name);
    }

    ok(rel, leaks.length === 0,
        leaks.length ? `${main.name} declares ${leaks.map((n) => `\`${n}\``).join(', ')}, `
            + 'but it is referenced outside that component — a ReferenceError at render.' : '');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
