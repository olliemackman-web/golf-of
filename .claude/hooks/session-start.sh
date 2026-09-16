#!/bin/bash
# Installs what `npm run lint` / `npm test` / `npm run test:browser` need when a session starts
# in Claude Code on the web. Does nothing on a local machine.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# eslint, globals, playwright (dev) and the node_modules/three -> vendor/three link.
# The web environment already has a Chromium at $PLAYWRIGHT_BROWSERS_PATH, so no browser download.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --no-audit --no-fund --prefer-offline

echo "session-start: dependencies ready (node $(node --version), $(npx eslint --version))"
