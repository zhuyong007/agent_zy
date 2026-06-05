import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const lockfilePath = resolve(process.cwd(), "package-lock.json");
const blockedHosts = ["npm.100tal.com"];

if (!existsSync(lockfilePath)) {
  process.exit(0);
}

const lockfile = readFileSync(lockfilePath, "utf8");
const matchedHosts = blockedHosts.filter((host) => lockfile.includes(host));

if (matchedHosts.length === 0) {
  process.exit(0);
}

console.error("Detected blocked registry host(s) in package-lock.json:");
for (const host of matchedHosts) {
  console.error(`- ${host}`);
}
console.error("");
console.error("Please regenerate the lockfile with the project registry before installing:");
console.error("1. Stop running dev processes");
console.error("2. Delete node_modules and package-lock.json");
console.error("3. Run npm install again");

process.exit(1);
