import { existsSync, readFileSync } from "node:fs";

export function readSecretEnv(name: string) {
  const directValue = process.env[name];
  if (directValue && directValue.trim()) {
    return directValue.trim();
  }

  const filePath = process.env[`${name}_FILE`];
  if (!filePath || !filePath.trim() || !existsSync(filePath)) {
    return undefined;
  }

  const fileValue = readFileSync(filePath, "utf8").trim();
  return fileValue || undefined;
}
