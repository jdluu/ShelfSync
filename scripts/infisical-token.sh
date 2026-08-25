#!/usr/bin/env bash
# Fetch a fresh Infisical machine-identity access token from repo-local credentials.
#
# Portable across machines — resolution order:
#   1. INFISICAL_CLIENT_ID / INFISICAL_CLIENT_SECRET in the environment
#   2. ./.env.infisical (gitignored) with those two keys
#   3. BWS (Hermes mini PC only — last resort)
#
# Prints the raw JWT to stdout.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

get_cred() {
  local key="$1" val=""
  val="${!key:-}"
  if [ -z "$val" ] && [ -f "$SCRIPT_DIR/.env.infisical" ]; then
    val="$(grep "^${key}=" "$SCRIPT_DIR/.env.infisical" | head -1 | cut -d= -f2-)"
  fi
  printf '%s' "$val"
}

CLIENT_ID="$(get_cred INFISICAL_CLIENT_ID)"
CLIENT_SECRET="$(get_cred INFISICAL_CLIENT_SECRET)"

# Last resort: BWS (Hermes-managed, this machine only)
if [ -z "$CLIENT_ID" ] && command -v bws >/dev/null 2>&1; then
  BWS_ACCESS_TOKEN="${BWS_ACCESS_TOKEN:-$(grep '^BWS_ACCESS_TOKEN=' "$HOME/.hermes/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)}"
  export BWS_ACCESS_TOKEN
  if [ -n "$BWS_ACCESS_TOKEN" ]; then
    creds=$(bws secret list 7729b035-d169-41d8-b791-b4580176656b 2>/dev/null | python3 -c "
import sys, json
try:
    secrets = {s['key']: s['value'] for s in json.load(sys.stdin)}
    print(secrets.get('INFISICAL_CLIENT_ID',''), secrets.get('INFISICAL_CLIENT_SECRET',''))
except Exception:
    pass" || true)
    CLIENT_ID="${creds%% *}"
    CLIENT_SECRET="${creds##* }"
  fi
fi

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "error: no Infisical credentials found." >&2
  echo "Create .env.infisical in the repo root with:" >&2
  echo "  INFISICAL_CLIENT_ID=..." >&2
  echo "  INFISICAL_CLIENT_SECRET=..." >&2
  exit 1
fi

curl -s --max-time 15 -X POST 'https://app.infisical.com/api/v1/auth/universal-auth/login' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "clientId=${CLIENT_ID}" \
  --data-urlencode "clientSecret=${CLIENT_SECRET}" \
| python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])"