import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function collectFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const target = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(target));
      continue;
    }

    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      continue;
    }

    files.push(target);
  }

  return files;
}

const files = collectFiles(join(root, "src"));

const pattern = /#[0-9A-Fa-f]{3,8}\b|rgba?\(/g;
const violations = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const matches = [...source.matchAll(pattern)];

  for (const match of matches) {
    const before = source.slice(0, match.index);
    const line = before.split("\n").length;
    violations.push({
      file: relative(root, file),
      line,
      value: match[0],
    });
  }
}

if (violations.length > 0) {
  console.error("Token color guard failed. Replace literal hex/rgb(a) values with design tokens.");
  for (const violation of violations) {
    console.error(`${join("opslin-dashboard", violation.file)}:${violation.line} -> ${violation.value}`);
  }
  process.exit(1);
}

console.log(`Token color guard passed for ${files.length} files.`);
