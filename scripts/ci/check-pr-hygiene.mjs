import fs from "node:fs";
import path from "node:path";

const allowNonPr = process.argv.includes("--allow-non-pr");
const eventName = process.env.GITHUB_EVENT_NAME || "";
const eventPath = process.env.GITHUB_EVENT_PATH || "";
const reportPath =
  process.env.PR_HYGIENE_REPORT_PATH || path.join("tmp", "ci", "pr-hygiene-report.json");

fs.mkdirSync(path.dirname(reportPath), { recursive: true });

if (!["pull_request", "pull_request_target"].includes(eventName)) {
  if (allowNonPr) {
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          skipped: true,
          reason: `event ${eventName || "unknown"} does not provide pull request metadata`
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  console.error("PR hygiene check only supports pull_request or pull_request_target events.");
  process.exit(1);
}

if (!eventPath || !fs.existsSync(eventPath)) {
  console.error("GITHUB_EVENT_PATH is required for PR hygiene validation.");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
const pullRequest = payload.pull_request || {};
const title = String(pullRequest.title || "").trim();
const body = String(pullRequest.body || "");

const errors = [];
const conventionalTitlePattern =
  /^(?:\[(?:codex|hotfix|release|security|docs|infra)\]\s+.+|(?:feat|fix|chore|docs|refactor|test|build|ci|perf|security)(?:\([^)]+\))?:\s+.+)$/i;
const bannedTitles = [/^wip$/i, /^draft$/i, /^update$/i, /^fix$/i, /^changes$/i, /^misc$/i];

function getSectionContent(markdown, heading) {
  const lines = markdown.split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex === -1) {
    return "";
  }

  const sectionLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      break;
    }
    sectionLines.push(lines[index]);
  }

  return sectionLines.join("\n").trim();
}

function getMeaningfulBullets(section, ignoredPhrases) {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0)
    .filter((line) => !ignoredPhrases.includes(line.toLowerCase()));
}

if (title.length < 15) {
  errors.push("Pull request title must be descriptive and at least 15 characters long.");
}

if (bannedTitles.some((pattern) => pattern.test(title))) {
  errors.push("Pull request title is too vague. Use a specific, reviewer-friendly title.");
}

if (!conventionalTitlePattern.test(title)) {
  errors.push(
    'Pull request title must follow a professional format such as "fix(auth): handle refresh" or "[codex] govern CI/CD".'
  );
}

for (const heading of ["## Summary", "## Validation", "## Notes"]) {
  if (!new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "im").test(body)) {
    errors.push(`Pull request body must include the heading "${heading}".`);
  }
}

const summarySection = getSectionContent(body, "## Summary");
const validationSection = getSectionContent(body, "## Validation");
const notesSection = getSectionContent(body, "## Notes");

const summaryBullets = getMeaningfulBullets(summarySection, [
  "what changed",
  "why it changed",
  "what risk area this touches (`ui`, `api`, `auth`, `deploy`, `security`, `docs`)",
]);
const notesBullets = getMeaningfulBullets(notesSection, [
  "deployment impact",
  "migration or env requirements",
  "follow-up work if any",
  "reviewer callouts or codeowners you expect to review this",
]);
const validationChecklistItems = validationSection
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => /^- \[[ xX]\]/.test(line));

if (summaryBullets.length < 2) {
  errors.push("Summary section must include at least two meaningful bullet points.");
}

if (notesBullets.length < 1) {
  errors.push("Notes section must include at least one meaningful bullet point.");
}

if (validationChecklistItems.length < 3) {
  errors.push("Validation section must include at least three checklist items.");
}

if (!validationChecklistItems.some((line) => /^- \[[xX]\]/.test(line))) {
  errors.push("Validation section must mark at least one checklist item as completed.");
}

const report = {
  title,
  errors,
  valid: errors.length === 0
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
