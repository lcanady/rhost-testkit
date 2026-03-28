/**
 * 16-formatter.ts — Softcode formatter
 *
 * Demonstrates the softcode formatter: normalizing whitespace around ( , )
 * in softcode expressions. Covers compact mode, pretty-print mode, and
 * integration with the programmatic API.
 *
 * No server connection required — the formatter is entirely offline.
 *
 * Run:
 *   npx ts-node examples/16-formatter.ts
 */
import { format } from '../src';

// ---------------------------------------------------------------------------
// Compact mode (default) — strip extra whitespace
// ---------------------------------------------------------------------------

console.log('=== Compact mode ===\n');

const examples = [
    'add( 2, 3 )',
    'iter( lnum(1,10) , ## )',
    'pemit( %# , hello world )',
    'switch( %0 , 1, one, 2, two, other )',
    'setq( 0, add( %0 , %1 ) )',
    // Already formatted — no change
    'add(2,3)',
    'encode64(hello)',
];

for (const expr of examples) {
    const result = format(expr);
    const changed = result.changed ? ' ← changed' : ' (no change)';
    console.log(`  Input:  ${expr}`);
    console.log(`  Output: ${result.formatted}${changed}`);
    console.log();
}

// ---------------------------------------------------------------------------
// Pretty mode — indent nested calls for human readability
// ---------------------------------------------------------------------------

console.log('=== Pretty mode ===\n');

const complex = [
    'add(mul(2,3),div(10,5))',
    'switch(gt(%0,10),1,big,small)',
    'iter(lnum(1,5),add(##,mul(##,2)))',
    'setq(0,add(setq(1,mul(2,3)),%q1))',
];

for (const expr of complex) {
    const result = format(expr, { pretty: true });
    console.log(`Input:  ${expr}`);
    console.log(`Pretty:`);
    for (const line of result.formatted.split('\n')) {
        console.log(`  ${line}`);
    }
    console.log();
}

// ---------------------------------------------------------------------------
// Lowercase option — normalize function name casing
// ---------------------------------------------------------------------------

console.log('=== Lowercase option ===\n');

const mixed = [
    'ADD(2,3)',
    'ITER( LNUM(1,10) , ## )',
    'Pemit( %#, Hello )',
];

for (const expr of mixed) {
    const result = format(expr, { lowercase: true });
    console.log(`  ${expr}  →  ${result.formatted}`);
}

// ---------------------------------------------------------------------------
// changed flag — useful for CI lint checks
// ---------------------------------------------------------------------------

console.log('\n=== changed flag (CI use) ===\n');

const files = [
    { name: 'clean.mush',   content: 'add(2,3)' },
    { name: 'messy.mush',   content: 'add( 2 , 3 )' },
    { name: 'complex.mush', content: 'iter( lnum(1,5) , mul(##,2) )' },
];

let anyChanged = false;
for (const file of files) {
    const result = format(file.content);
    const status = result.changed ? '✗ needs formatting' : '✓ already formatted';
    console.log(`  ${file.name}: ${status}`);
    if (result.changed) anyChanged = true;
}

if (anyChanged) {
    console.log('\n  Some files need formatting.');
    console.log('  In CI: run `rhost-testkit fmt --check *.mush` to fail the build.');
} else {
    console.log('\n  All files are formatted correctly.');
}

console.log('\nDone — no server required.');
