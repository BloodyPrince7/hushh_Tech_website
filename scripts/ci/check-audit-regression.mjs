import fs from "node:fs";
import path from "node:path";

const reportFile = process.argv[2] || path.join("tmp", "ci", "npm-audit-report.json");
const budgetFile = path.join("scripts", "ci", "security-budget.json");

if (!fs.existsSync(reportFile)) {
  console.error(`Audit report not found: ${reportFile}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const budget = JSON.parse(fs.readFileSync(budgetFile, "utf8"));
const current = report.metadata?.vulnerabilities || {};
const errors = [];

for (const severity of ["low", "moderate", "high", "critical"]) {
  const actual = Number(current[severity] || 0);
  const allowed = Number(budget[severity] || 0);
  if (actual > allowed) {
    errors.push(
      `${severity} vulnerabilities regressed above baseline: allowed ${allowed}, found ${actual}.`
    );
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
