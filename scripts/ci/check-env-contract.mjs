import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "scripts", "ci", "env-contract.json");
const exampleEnvPath = path.join(root, ".env.local.example");
const typedEnvPath = path.join(root, "src", "vite-env.d.ts");
const reportPath =
  process.env.ENV_CONTRACT_REPORT_PATH || path.join(root, "tmp", "ci", "env-contract-report.json");

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const exampleEnv = fs.readFileSync(exampleEnvPath, "utf8");
const typedEnv = fs.readFileSync(typedEnvPath, "utf8");
const errors = [];

fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const typedVars = [...typedEnv.matchAll(/readonly\s+([A-Z][A-Z0-9_]+)\??:\s+string;/g)].map(
  ([, name]) => name
);
const exampleVars = [...exampleEnv.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(([, name]) => name);
const typedSet = new Set(typedVars);
const exampleSet = new Set(exampleVars);
const contractClientSet = new Set([...contract.clientRequired, ...contract.clientOptional]);

for (const name of contract.clientRequired) {
  if (!typedSet.has(name)) {
    errors.push(`Typed client env is missing required key ${name}.`);
  }
  if (!exampleSet.has(name)) {
    errors.push(`.env.local.example is missing required client key ${name}.`);
  }
}

for (const name of contract.clientOptional) {
  if (!typedSet.has(name)) {
    errors.push(`Typed client env is missing optional key ${name}.`);
  }
  if (!exampleSet.has(name)) {
    errors.push(`.env.local.example is missing optional client key ${name}.`);
  }
}

for (const name of typedVars) {
  if (!contractClientSet.has(name)) {
    errors.push(`src/vite-env.d.ts contains ${name}, but env-contract.json does not track it.`);
  }
}

for (const name of contract.documentedServerVars) {
  if (!exampleSet.has(name)) {
    errors.push(`.env.local.example is missing documented server key ${name}.`);
  }
}

for (const [name, files] of Object.entries(contract.criticalServerRouteVars)) {
  for (const relativeFile of files) {
    const filePath = path.join(root, relativeFile);
    const contents = fs.readFileSync(filePath, "utf8");
    const supportedPatterns = [
      `process.env.${name}`,
      `env.${name}`,
      `env["${name}"]`,
      `env['${name}']`,
    ];
    const hasReference = supportedPatterns.some((pattern) => contents.includes(pattern));
    if (!hasReference) {
      errors.push(
        `${relativeFile} no longer references ${name} through an approved env access path; update env contract.`
      );
    }
  }
}

for (const workflowFile of contract.buildWorkflowFiles) {
  const contents = fs.readFileSync(path.join(root, workflowFile), "utf8");
  for (const name of contract.clientRequired) {
    if (!contents.includes(name)) {
      errors.push(`${workflowFile} does not reference required build env ${name}.`);
    }
  }
}

for (const workflowFile of contract.deployWorkflowFiles) {
  const contents = fs.readFileSync(path.join(root, workflowFile), "utf8");
  for (const name of contract.deployRuntimeRequired) {
    if (!contents.includes(name)) {
      errors.push(`${workflowFile} does not reference required runtime env ${name}.`);
    }
  }
}

for (const workflowFile of contract.policyWorkflowFiles) {
  const contents = fs.readFileSync(path.join(root, workflowFile), "utf8");
  for (const name of contract.forbiddenProductionBrowserSecrets) {
    if (contents.includes(name)) {
      errors.push(`${workflowFile} references forbidden production browser secret ${name}.`);
    }
  }

  for (const [name, expectedValue] of Object.entries(contract.unsafeBooleanFlags)) {
    const allowTruePattern = new RegExp(`${name}[=:][^\\n]*true`, "i");
    if (allowTruePattern.test(contents)) {
      errors.push(`${workflowFile} enables unsafe flag ${name}=true.`);
    }

    if (
      workflowFile.endsWith("ci.yml") ||
      workflowFile.endsWith("main-post-merge-smoke.yml")
    ) {
      const explicitValuePattern = new RegExp(`${name}[" :]+${expectedValue}`, "i");
      if (!explicitValuePattern.test(contents)) {
        errors.push(`${workflowFile} must set ${name}=${expectedValue} explicitly.`);
      }
    }
  }
}

fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      typedVars,
      exampleVars,
      errors,
      valid: errors.length === 0
    },
    null,
    2
  )
);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
