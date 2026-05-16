#!/usr/bin/env bash
# =============================================================================
# scripts/restore-research.sh
#
# Restore the local-only competitor probe artifacts to .research/ from
# git history. Used when:
#   - Fresh clone of the repo (no .research/ exists)
#   - .research/ was accidentally deleted locally
#   - Need to compare current planning vs the pre-scrub probe text
#
# The probe artifacts are immutable history in commit 99c7e4d^; only the
# PUBLISHED tree was scrubbed. .research/ is .gitignore'd by design — its
# contents reference specific commercial grid libraries and must not land
# in the published tree per the clean-room MIT discipline.
#
# See .research/README.md for the full policy.
# =============================================================================

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

PROBE_REF="99c7e4d^"

if ! git rev-parse "$PROBE_REF" >/dev/null 2>&1; then
  echo "ERROR: ref $PROBE_REF not in this clone — fetch all refs first?"
  exit 1
fi

mkdir -p .research/grids

# Top-level files
for f in RESEARCH.md docs/feature-matrix.md; do
  out=".research/$(basename "$f")"
  git show "$PROBE_REF:$f" > "$out" 2>/dev/null && echo "  $out"
done

# Per-library files
for f in $(git show 99c7e4d --stat 2>/dev/null | awk '/^ docs\/grids/{print $1}'); do
  base=$(basename "$f")
  out=".research/grids/$base"
  git show "$PROBE_REF:$f" > "$out" 2>/dev/null && echo "  $out"
done

echo
echo "Restored to .research/ — local-only, .gitignore'd."
echo "See .research/README.md for the discipline rules."
