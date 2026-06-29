#!/usr/bin/env bash
set -euo pipefail
ROOT="/Users/munmunmiao/Documents/web/zen-kit"

echo "=== Stale API references in user docs ==="
rg -n "\bSchema\b|\.tag\(|\btag\.|requireTag|@mobily/ts-belt|setPathParam\b|setQueryParam\b|setHeader\b" \
  "$ROOT/doc" \
  "$ROOT/packages/core/README.md" \
  "$ROOT/packages/core/design.md" \
  "$ROOT/packages/core/core-minimalism-implementation-plan.md" \
  "$ROOT/packages/core/research" \
  "$ROOT/docs/superpowers/specs" \
  "$ROOT/docs/superpowers/plans" \
  "$ROOT/docs/2026-06-19-struct-json-requiretag-analysis.md" \
  --glob '*.md' || true

echo "=== Old SSE build pattern ==="
rg -n "build:\s*\(\s*\{[^}]*\}\s*\)\s*=>\s*\{[^}]*params" "$ROOT/doc" --glob '*.md' || true
