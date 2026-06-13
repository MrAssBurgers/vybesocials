#!/usr/bin/env bash
# Push migrations to linked hprmicwhlaaqfgshucec. Re-run after fixing bootstrap SQL.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "==> Pushing migrations to linked project..."
npx supabase db push --yes
