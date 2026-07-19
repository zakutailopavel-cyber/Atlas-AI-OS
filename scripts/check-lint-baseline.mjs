import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const baselinePath = new URL("../.github/lint-baseline.json", import.meta.url);
const eslintPath = new URL("../node_modules/eslint/bin/eslint.js", import.meta.url);
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

const run = spawnSync(
  process.execPath,
  [eslintPath.pathname, ".", "--format", "json"],
  { encoding: "utf8" },
);

if (run.error) {
  console.error("Unable to run ESLint:", run.error.message);
  process.exit(1);
}

let results;
try {
  results = JSON.parse(run.stdout);
} catch {
  console.error("ESLint did not return valid JSON.");
  if (run.stdout) console.error(run.stdout);
  if (run.stderr) console.error(run.stderr);
  process.exit(1);
}

const actual = { errors: {}, warnings: {} };
for (const file of results) {
  for (const message of file.messages) {
    const bucket = message.severity === 2 ? "errors" : "warnings";
    const rule = message.ruleId ?? "<fatal>";
    actual[bucket][rule] = (actual[bucket][rule] ?? 0) + 1;
  }
}

let failed = false;
for (const bucket of ["errors", "warnings"]) {
  const known = baseline[bucket] ?? {};
  const rules = new Set([...Object.keys(known), ...Object.keys(actual[bucket])]);

  for (const rule of [...rules].sort()) {
    const allowed = known[rule] ?? 0;
    const found = actual[bucket][rule] ?? 0;
    const status = found > allowed ? "REGRESSION" : found < allowed ? "IMPROVED" : "UNCHANGED";
    console.log(`${bucket}: ${rule}: ${found}/${allowed} ${status}`);
    if (found > allowed) failed = true;
  }
}

const totals = Object.fromEntries(
  Object.entries(actual).map(([bucket, rules]) => [
    bucket,
    Object.values(rules).reduce((sum, count) => sum + count, 0),
  ]),
);
console.log(`ESLint totals: ${totals.errors} errors, ${totals.warnings} warnings.`);

if (failed) {
  console.error("Lint regression detected. Fix the new finding; do not increase the baseline.");
  process.exit(1);
}

console.log("Lint non-regression baseline passed.");
