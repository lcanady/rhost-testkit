/**
 * 14-validator-advanced.ts — Register clobber analysis + dialect compat report
 *
 * Demonstrates the offline validator's two static analysis passes:
 *
 *   1. Register clobber detection — finds setq() inside loop bodies where
 *      concurrent iterations can silently overwrite each other's %q registers.
 *
 *   2. Dialect compatibility report — classifies which functions in an
 *      expression are RhostMUSH-only, which are portable, and which platforms
 *      support each.
 *
 * No server connection required — all analysis is pure static analysis.
 *
 * Run:
 *   npx ts-node examples/14-validator-advanced.ts
 */
import { validate, compatibilityReport } from '../src';

// ---------------------------------------------------------------------------
// Register clobber detection
// ---------------------------------------------------------------------------

console.log('=== Register Clobber Analysis ===\n');

// Safe: setq() outside of any loop
const safe1 = validate('setq(0,add(2,3))');
console.log('setq(0,add(2,3))');
console.log(`  valid: ${safe1.valid}, warnings: ${safe1.diagnostics.filter(d => d.severity === 'warning').length}`);
console.log('  ✓ Safe — setq outside loop\n');

// Safe: setq() inside localize() inside a loop — localize() resets the scope
const safe2 = validate('iter(lnum(1,5),localize(setq(0,##)))');
console.log('iter(lnum(1,5),localize(setq(0,##)))');
console.log(`  valid: ${safe2.valid}`);
const safe2Clobber = safe2.diagnostics.filter(d => d.code === 'W006');
console.log(`  W006 warnings: ${safe2Clobber.length}`);
console.log('  ✓ Safe — localize() scopes the register\n');

// Safe: setq() in the LIST argument (not the body) of iter()
const safe3 = validate('iter(setq(0,lnum(1,5)),%q0)');
console.log('iter(setq(0,lnum(1,5)),%q0)');
console.log(`  valid: ${safe3.valid}`);
const safe3Clobber = safe3.diagnostics.filter(d => d.code === 'W006');
console.log(`  W006 warnings: ${safe3Clobber.length}`);
console.log('  ✓ Safe — setq is in the list arg, not the body\n');

// Dangerous: setq() in the iter BODY — concurrent invocations clobber %q0
const dangerous = validate('iter(lnum(1,10),setq(0,add(##,1)))');
console.log('iter(lnum(1,10),setq(0,add(##,1)))');
console.log(`  valid: ${dangerous.valid}`);
const clobberWarnings = dangerous.diagnostics.filter(d => d.code === 'W006');
console.log(`  W006 warnings: ${clobberWarnings.length}`);
for (const w of clobberWarnings) {
    console.log(`  ⚠  ${w.message}`);
}
console.log('  Fix: wrap body in localize() → iter(lnum(1,10),localize(setq(0,add(##,1))))\n');

// Nested loops
const nested = validate('iter(lnum(1,3),iter(lnum(1,3),setq(0,mul(##,##))))');
console.log('iter(lnum(1,3),iter(lnum(1,3),setq(0,mul(##,##))))');
const nestedWarnings = nested.diagnostics.filter(d => d.code === 'W006');
console.log(`  W006 warnings: ${nestedWarnings.length} (nested loops — both flagged)\n`);

// ---------------------------------------------------------------------------
// Dialect compatibility report
// ---------------------------------------------------------------------------

console.log('=== Dialect Compatibility Report ===\n');

// Fully portable expression
const portableExpr = 'iter(lnum(1,10),add(##,1))';
const r1 = compatibilityReport(portableExpr);
console.log(`Expression: ${portableExpr}`);
console.log(`  portable: ${r1.portable}`);
console.log(`  restricted functions: ${r1.restricted.length === 0 ? 'none' : r1.restricted.map(e => e.name).join(', ')}`);
console.log('  ✓ Runs on RhostMUSH, PennMUSH, and TinyMUX\n');

// RhostMUSH + PennMUSH only (not TinyMUX)
const pennAndRhost = 'localize(setq(0,add(2,3)))';
const r2 = compatibilityReport(pennAndRhost);
console.log(`Expression: ${pennAndRhost}`);
console.log(`  portable: ${r2.portable}`);
for (const entry of r2.restricted) {
    console.log(`  ⚠  ${entry.name} — supported on: ${entry.platforms.join(', ')}`);
}
console.log();

// RhostMUSH-only functions
const rhostOnly = 'encode64(digest(sha256,hello))';
const r3 = compatibilityReport(rhostOnly);
console.log(`Expression: ${rhostOnly}`);
console.log(`  portable: ${r3.portable}`);
for (const entry of r3.restricted) {
    console.log(`  ✗  ${entry.name} — RhostMUSH only`);
}
console.log();

// Mixed: some portable, some not
const mixed = 'iter(lnum(1,5),encode64(json(set,key,##)))';
const r4 = compatibilityReport(mixed);
console.log(`Expression: ${mixed}`);
console.log(`  portable: ${r4.portable}`);
console.log(`  restricted: ${r4.restricted.map(e => `${e.name}(${e.platforms.join('+')})`)
    .join(', ') || 'none'}`);

console.log('\nDone — no server required for any of the above.');
