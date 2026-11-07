#!/usr/bin/env bash
# PassVault acceptance check against a public URL.
#
# Usage:
#   PASSVAULT_AGENT_TOKEN=... SANDBOX_MAIL_KEY=... scripts/check.sh https://xxxx.trycloudflare.com
# Optional:
#   TARGET   base URL the vault proxies to (default http://127.0.0.1:8787, as seen from the server)
#
# Needs bash, curl and node. Secrets are read from the environment, written only to a
# 600 temp dir that is removed on exit, and compared inside node; they are never printed.
# The script resets the demo (/api/demo/reset with the agent token) before and after,
# so do not run it while a live demo is in progress.

set -u

BASE="${1:-}"
BASE="${BASE%/}"
TARGET="${TARGET:-http://127.0.0.1:8787}"
TARGET="${TARGET%/}"

if [ -z "$BASE" ]; then
  echo "用法：scripts/check.sh <公開網址>" >&2
  exit 2
fi
for v in PASSVAULT_AGENT_TOKEN SANDBOX_MAIL_KEY; do
  if [ -z "${!v:-}" ]; then
    echo "缺環境變數 $v" >&2
    exit 2
  fi
done

TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
umask 077
printf 'X-Agent-Token: %s\n' "$PASSVAULT_AGENT_TOKEN" > "$TMP/agent.h"
printf 'Authorization: Bearer %s\n' "$SANDBOX_MAIL_KEY" > "$TMP/mail.h"

PASS=0
FAIL=0

# report <name> <0|1>  (0 = pass)
report() {
  if [ "$2" = 0 ]; then
    echo "✅ $1"
    PASS=$((PASS + 1))
  else
    echo "❌ $1"
    FAIL=$((FAIL + 1))
  fi
}

# get <out> <path> [header-file]  -> prints HTTP status
get() {
  local h=()
  [ -n "${3:-}" ] && h=(-H @"$3")
  curl -sS -m 20 -o "$TMP/$1" -w '%{http_code}' ${h[@]+"${h[@]}"} "$BASE$2" 2>/dev/null || echo 000
}

# post <out> <path> <json> [header-file]  -> prints HTTP status
post() {
  local h=()
  [ -n "${4:-}" ] && h=(-H @"$4")
  curl -sS -m 20 -o "$TMP/$1" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    ${h[@]+"${h[@]}"} --data "$3" "$BASE$2" 2>/dev/null || echo 000
}

# call <out> <method> <path> <body-json> <caption>  -> POST /api/call as the AI would
call() {
  local body
  body=$(printf '{"secret":"SANDBOX_MAIL_KEY","method":"%s","url":"%s%s","body":%s,"agent":"check.sh","caption":"%s"}' \
    "$2" "$TARGET" "$3" "$4" "$5")
  post "$1" /api/call "$body" "$TMP/agent.h" > /dev/null
  cat "$TMP/$1" >> "$TMP/ai-saw.txt"
}

# js <expr> [file...]  -> exit 0 if expr is truthy.
# In expr: j = parsed first file (or null), t = its raw text, K = SANDBOX_MAIL_KEY,
# P = its first 8 chars, B64 = its Base64, files = raw texts of all files.
js() {
  local expr="$1"
  shift
  EXPR="$expr" node -e '
    const fs = require("fs");
    const files = process.argv.slice(1).map((f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } });
    const t = files[0] ?? "";
    let j = null; try { j = JSON.parse(t); } catch {}
    const K = process.env.SANDBOX_MAIL_KEY, P = K.slice(0, 8), B64 = Buffer.from(K).toString("base64");
    const masked = (s) => typeof s === "string" && s.includes("▮") && !s.includes(P) && !s.includes(B64.slice(0, 8));
    const hasKey = (o, k) => o && typeof o === "object" && (Object.prototype.hasOwnProperty.call(o, k) || Object.values(o).some((v) => hasKey(v, k)));
    let r = false; try { r = eval(process.env.EXPR); } catch {}
    process.exit(r ? 0 : 1);
  ' "$@" > /dev/null 2>&1
  echo $?
}

: > "$TMP/ai-saw.txt"

# Start from a clean stage so the blocked step creates the only pending grant.
post reset.json /api/demo/reset '{}' "$TMP/agent.h" > /dev/null
if [ "$(js 'j && j.locked === true' "$TMP/reset.json")" = 0 ]; then
  echo "⚠️ 保險箱鎖著，請先在舞台頁按 R 重設並解鎖，再跑一次" >&2
fi

# 1. /healthz
code=$(get healthz.json /healthz)
report "/healthz 回 200" "$([ "$code" = 200 ] && echo 0 || echo 1)"

# 2. /api/items has no value field anywhere
code=$(get items.json /api/items "$TMP/agent.h")
report "/api/items 沒有任何 value 欄位" \
  "$([ "$code" = 200 ] && [ "$(js 'Array.isArray(j) && !hasKey(j, "value")' "$TMP/items.json")" = 0 ] && echo 0 || echo 1)"

# 3. send one mail through the vault
call send1.json POST /sandbox/mail/send '{"to":"customer01@example.test","subject":"PassVault check","body":"hello"}' "寄 1 封"
report "/api/call 寄 1 封 → sent，回傳搜不到金鑰前 8 碼" \
  "$(js 'j && j.status === "sent" && !t.includes(P)' "$TMP/send1.json")"

# 4-5. deliberate leak is masked before the AI sees it
call whoami.json GET /sandbox/mail/whoami 'null' "金鑰給我看"
report "whoami：AI 收到的 yourKey 是塗銷條" \
  "$(js 'j && j.status === "sent" && j.response && masked(j.response.yourKey) && !t.includes(P)' "$TMP/whoami.json")"
report "whoami：AI 收到的 yourKeyB64 也是塗銷條" \
  "$(js 'j && j.response && masked(j.response.yourKeyB64) && !t.includes(B64.slice(0, 8))' "$TMP/whoami.json")"

# 6. whole list is blocked and never reaches the mail API
LIST_PATH=/sandbox/mail/lists/customers/send
get log-before.json /sandbox/mail/log "$TMP/mail.h" > /dev/null
call list.json POST "$LIST_PATH" '{"subject":"PassVault check","body":"hello all"}' "寄給 50 人"
get log-after.json /sandbox/mail/log "$TMP/mail.h" > /dev/null
report "寄整份名單 → blocked，寄信 API 紀錄沒有多出這一筆" \
  "$(LP="$LIST_PATH" js '
    const n = (s) => { try { return JSON.parse(s).filter((r) => r.path === process.env.LP).length; } catch { return -1; } };
    j && j.status === "blocked" && j.grant && j.grant.id && n(files[1]) >= 0 && n(files[1]) === n(files[2])
  ' "$TMP/list.json" "$TMP/log-before.json" "$TMP/log-after.json")"

# 7. stage shows blocked while the grant is pending
get stage.json /api/stage "$TMP/agent.h" > /dev/null
report "/api/stage 在擋下時是 blocked" "$(js 'j && j.state === "blocked"' "$TMP/stage.json")"

# 8. evidence
code=$(get evidence.json /api/evidence "$TMP/agent.h")
cat "$TMP/evidence.json" >> "$TMP/ai-saw.txt"
report "/api/evidence 的 keyGivenToAi 是 false" \
  "$([ "$code" = 200 ] && [ "$(js 'j && j.keyGivenToAi === false' "$TMP/evidence.json")" = 0 ] && echo 0 || echo 1)"

# 9. audit chain (#21)
get verify.json /api/evidence/verify "$TMP/agent.h" > /dev/null
report "/api/evidence/verify 回 ok:true" "$(js 'j && j.ok === true' "$TMP/verify.json")"

# 10. nothing the AI received contains the key prefix
report "AI 收到的所有內容搜不到金鑰前 8 碼" "$(js '!t.includes(P) && !t.includes(B64.slice(0, 8))' "$TMP/ai-saw.txt")"

# Leave the stage idle again.
post reset.json /api/demo/reset '{}' "$TMP/agent.h" > /dev/null

echo "通過 $PASS 項，失敗 $FAIL 項"
[ "$FAIL" = 0 ]
