#!/usr/bin/env bash
# ตัวรันภายใน network namespace เท่านั้น ห้ามใช้แทนด่านตรวจฐานข้อมูลจริง
set -euo pipefail

QA_NODE_BIN=${1:?ต้องระบุ path ของ Node.js}
: "${QA_ARTIFACT_DIR:?ต้องระบุโฟลเดอร์ผลตรวจ}"
ip link set lo up
mkdir -p "$QA_ARTIFACT_DIR"
"$QA_NODE_BIN" tools/qa/suites/syntax.js | tee "$QA_ARTIFACT_DIR/syntax.log"

# เก็บรหัสออกจริงของด่าน แม้การถ่ายภาพภายหลังผ่าน ก็ห้ามกลบผลแดง
set +e
QA_SQL_STATUS=0
if [ -f tools/qa/sql/brief32-pglite.mjs ]; then
  "$QA_NODE_BIN" tools/qa/sql/brief32-pglite.mjs 2>&1 | tee "$QA_ARTIFACT_DIR/sql.log"
  QA_SQL_STATUS=${PIPESTATUS[0]}
else
  printf 'ยังไม่มีตัวรัน SQL ใน commit นี้\n' > "$QA_ARTIFACT_DIR/sql.log"
fi
"$QA_NODE_BIN" tools/qa/run.js 2>&1 | tee "$QA_ARTIFACT_DIR/full-qa.log"
QA_SUITE_STATUS=${PIPESTATUS[0]}
set -e

python3 -m http.server 8123 --bind 127.0.0.1 > "$QA_ARTIFACT_DIR/server.log" 2>&1 &
QA_SERVER_PID=$!
trap 'kill "$QA_SERVER_PID" 2>/dev/null || true' EXIT
set +e
"$QA_NODE_BIN" tools/qa/ci-visual.js 2>&1 | tee "$QA_ARTIFACT_DIR/visual.log"
QA_VISUAL_STATUS=${PIPESTATUS[0]}
set -e
printf 'sql=%s\nfull_qa=%s\nvisual=%s\n' "$QA_SQL_STATUS" "$QA_SUITE_STATUS" "$QA_VISUAL_STATUS" > "$QA_ARTIFACT_DIR/status.txt"
if [ "$QA_SQL_STATUS" -ne 0 ]; then exit "$QA_SQL_STATUS"; fi
if [ "$QA_SUITE_STATUS" -ne 0 ]; then exit "$QA_SUITE_STATUS"; fi
exit "$QA_VISUAL_STATUS"
