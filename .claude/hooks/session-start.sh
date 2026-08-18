#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs frontend and backend dependencies so linters/builds work in a
# fresh remote session. Idempotent and non-interactive.
set -euo pipefail

# Only run in the remote (web) execution environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

echo "[session-start] Installing frontend dependencies..."
if [ -f "$ROOT/frontend/package.json" ]; then
  ( cd "$ROOT/frontend" && npm install --no-audit --no-fund )
fi

echo "[session-start] Installing backend dependencies..."
if [ -f "$ROOT/backend/package.json" ]; then
  ( cd "$ROOT/backend" && npm install --no-audit --no-fund )
fi

echo "[session-start] Dependencies ready."
