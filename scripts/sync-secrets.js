import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * ShelfSync secret injector.
 *
 * Single source of truth for signing material, used by local development (via
 * `pnpm secrets:fetch`) and by the release workflow, so CI and a developer
 * machine resolve the same secrets into the same file layout.
 *
 * Secrets come from Infisical. Two transports, selected automatically:
 *
 *   - INFISICAL_TOKEN set -> the REST API, so CI needs no CLI installed.
 *   - otherwise           -> the Infisical CLI, using the local login session.
 *
 * Each required value is fetched individually rather than via `infisical
 * export`, because the dotenv exporter quotes its values and that quoting is
 * not guaranteed stable across CLI versions.
 *
 * Fails closed: a missing, unreadable, or malformed secret is an error.
 */

const ENV = process.env.INFISICAL_ENV || "prod";
const PROJECT_ID = process.env.INFISICAL_PROJECT_ID || "b5af8dff-e2cd-492a-bf10-a71ce71deb58";
const INFISICAL_DOMAIN = process.env.INFISICAL_DOMAIN || "https://app.infisical.com";
const ANDROID_SECRETS_PATH = "/android";
const TAURI_SECRETS_PATH = "/tauri";

// The Android Gradle module resolves keystore.properties relative to itself, so
// the properties file and the keystore both live here and the configured
// keystore path stays portable across machines and CI.
const ANDROID_DIR = join("src-tauri", "gen", "android", "app");
const KEYSTORE_FILE_NAME = "shelfsync-release.jks";

const REQUIRED_ANDROID_KEYS = [
  "SHELF_KEYSTORE_BASE64",
  "shelfsync.key.alias",
  "shelfsync.key.password",
  "shelfsync.keystore.password",
];

// A keystore container is either a JKS (magic 0xFEEDFEED) or a PKCS12, which is
// a DER SEQUENCE and therefore starts with 0x30. Modern `keytool -genkeypair`
// defaults to PKCS12, which is what this project's keystore is.
const JKS_MAGIC = Buffer.from([0xfe, 0xed, 0xfe, 0xed]);

function looksLikeKeystore(buffer) {
  if (buffer.length < 8) return false;
  return buffer.subarray(0, 4).equals(JKS_MAGIC) || buffer[0] === 0x30;
}

function cliGetSecret(key, path) {
  // --projectId is required for machine-identity access. Authentication itself
  // is left to the CLI, which handles whichever local login method exists.
  const args = ["secrets", "get", key, "--path", path, "--plain", "--env", ENV, "--silent"];
  args.push("--projectId", PROJECT_ID);
  if (process.env.INFISICAL_TOKEN) {
    args.push("--token", process.env.INFISICAL_TOKEN);
  }
  return execFileSync("infisical", args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

async function apiGetSecret(key, path, token) {
  const url = new URL(`/api/v4/secrets/${encodeURIComponent(key)}`, INFISICAL_DOMAIN);
  url.searchParams.set("projectId", PROJECT_ID);
  url.searchParams.set("environment", ENV);
  url.searchParams.set("secretPath", path);

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return (body.secret?.secretValue ?? "").trim();
}

async function requireSecret(key, path) {
  const token = process.env.INFISICAL_TOKEN;
  const via = token ? "the REST API" : "the Infisical CLI";

  let value;
  try {
    value = token ? await apiGetSecret(key, path, token) : cliGetSecret(key, path);
  } catch (error) {
    console.error(
      `Error: could not read ${key} from ${path} (env ${ENV}) via ${via}: ${error.message}`,
    );
    process.exit(1);
  }

  if (!value) {
    console.error(`Error: secret ${key} at ${path} is empty.`);
    process.exit(1);
  }
  console.log(`[OK] Fetched ${key}`);
  return value;
}

function ensureDir(dir) {
  if (dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load key=value pairs from a local, gitignored file so `pnpm secrets:fetch`
 * works without an interactive CLI session. Real environment variables always
 * win, so CI and shell overrides are unaffected.
 */
function loadLocalTokenFile(file = ".env.infisical") {
  if (!existsSync(file)) return;
  const loaded = [];
  for (const rawLine of readFileSync(file, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
      loaded.push(key);
    }
  }
  if (loaded.length > 0) {
    console.log(`[i] Loaded ${loaded.join(", ")} from ${file}`);
  }
}

async function main() {
  loadLocalTokenFile();
  console.log("--- ShelfSync Secret Sync ---");
  console.log(
    process.env.INFISICAL_TOKEN
      ? `[i] Reading secrets from the Infisical REST API (env ${ENV}).`
      : `[i] No INFISICAL_TOKEN set; using the Infisical CLI login session (env ${ENV}).`,
  );

  // 1. Android signing material
  const android = {};
  for (const key of REQUIRED_ANDROID_KEYS) {
    android[key] = await requireSecret(key, ANDROID_SECRETS_PATH);
  }

  const keystoreBytes = Buffer.from(android.SHELF_KEYSTORE_BASE64, "base64");
  if (!looksLikeKeystore(keystoreBytes)) {
    console.error(
      "Error: SHELF_KEYSTORE_BASE64 did not decode to a JKS or PKCS12 keystore " +
        `(got ${keystoreBytes.length} bytes with an unrecognised header).`,
    );
    process.exit(1);
  }

  ensureDir(ANDROID_DIR);
  const keystorePath = join(ANDROID_DIR, KEYSTORE_FILE_NAME);
  writeFileSync(keystorePath, keystoreBytes);
  console.log(`[OK] Wrote ${keystorePath} (${keystoreBytes.length} bytes)`);

  // The keystore path is a bare filename so the same value works locally and in
  // CI. Gradle resolves it relative to this module directory.
  const properties = [
    `shelfsync.key.alias=${android["shelfsync.key.alias"]}`,
    `shelfsync.key.password=${android["shelfsync.key.password"]}`,
    `shelfsync.keystore.password=${android["shelfsync.keystore.password"]}`,
    `shelfsync.keystore.path=${KEYSTORE_FILE_NAME}`,
  ];
  const propertiesPath = join(ANDROID_DIR, "keystore.properties");
  writeFileSync(propertiesPath, `${properties.join("\n")}\n`);
  console.log(`[OK] Wrote ${propertiesPath}`);

  // 2. Tauri updater private key
  const updaterBytes = Buffer.from(
    await requireSecret("TAURI_UPDATER_PRIVATE_KEY_BASE64", TAURI_SECRETS_PATH),
    "base64",
  );
  const updaterPath = join("keys", "updater");
  ensureDir(dirname(updaterPath));
  writeFileSync(updaterPath, updaterBytes);
  console.log(`[OK] Wrote ${updaterPath} (${updaterBytes.length} bytes)`);

  console.log("-----------------------------");
  console.log("Secret injection complete.");
}

await main();
