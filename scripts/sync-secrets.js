import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Universal Secret Injector for ShelfSync
 * Works on Windows, WSL, and native Linux (Ubuntu, Arch, etc.)
 */

const ENV = "prod";
const PROJECT_ID = "b5af8dff-e2cd-492a-bf10-a71ce71deb58";

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf-8" }).trim();
  } catch (_e) {
    return null;
  }
}

/** Build infisical command with project context for machine identity auth */
function infisicalCmd(baseCmd) {
  // If INFISICAL_TOKEN is set in env (machine identity), add --projectId
  const tokenFlag = process.env.INFISICAL_TOKEN ? ` --token ${process.env.INFISICAL_TOKEN} --projectId ${PROJECT_ID}` : "";
  return `${baseCmd}${tokenFlag}`;
}

// Check for Infisical CLI
if (!run("infisical --version")) {
  console.error("Error: Infisical CLI not found.");
  console.error("Please install it: https://infisical.com/docs/cli/overview");
  process.exit(1);
}

console.log("--- ShelfSync Secret Sync ---");

/**
 * Recreates a file from its Base64 secret in Infisical
 * @param {string} secretName
 * @param {string} targetPath
 * @param {string} secretsPath
 */
function syncBinaryFile(secretName, targetPath, secretsPath = "/") {
  const value = run(
    infisicalCmd(`infisical secrets get ${secretName} --env=${ENV} --path=${secretsPath} --plain`),
  );
  if (value) {
    const dir = dirname(targetPath);
    if (dir !== "." && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(targetPath, Buffer.from(value, "base64"));
    console.log(`[√] Recreated ${targetPath}`);
  } else {
    console.warn(
      `[!] Warning: Secret ${secretName} not found in Infisical at path ${secretsPath}.`,
    );
  }
}

// 1. Recreate keystore.properties from the /android folder
console.log("Exporting keystore.properties from /android...");
const props = run(infisicalCmd(`infisical export --env=${ENV} --path=/android --format=dotenv`));
if (props) {
  const propsPath = join("src-tauri", "gen", "android", "app", "keystore.properties");
  const propsDir = dirname(propsPath);
  if (!existsSync(propsDir)) mkdirSync(propsDir, { recursive: true });
  writeFileSync(propsPath, props);
  console.log(`[√] Recreated ${propsPath}`);
}

// 2. Recreate Android Keystore from /android
syncBinaryFile("SHELF_KEYSTORE_BASE64", "shelfsync-release.jks", "/android");

// 3. Recreate Tauri Updater Private Key from /tauri
syncBinaryFile("TAURI_UPDATER_PRIVATE_KEY_BASE64", join("keys", "updater"), "/tauri");

console.log("-----------------------------");
console.log("Secret injection complete.");
