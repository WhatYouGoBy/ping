#!/usr/bin/env sh
# Install the repository-managed Git hooks in .githooks.
#
#   scripts/install-hooks.sh              # this clone and all its linked worktrees
#   scripts/install-hooks.sh --worktree   # only the current worktree
#
# The pre-commit hook runs the unit tests, a full type-check, and (when present)
# the sync-backend tests. It fails closed when a required tool is missing.
set -eu

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"
chmod +x .githooks/* 2>/dev/null || true

if [ "${1:-}" = "--worktree" ]; then
  # Worktree-scoped config so the hook does not affect other worktrees.
  git config extensions.worktreeConfig true
  git config --worktree core.hooksPath "$repo_root/.githooks"
  echo "Installed hooks for this worktree only (core.hooksPath=$repo_root/.githooks)"
else
  git config core.hooksPath .githooks
  echo "Installed hooks for this clone (core.hooksPath=.githooks)"
fi
