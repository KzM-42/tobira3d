#!/usr/bin/env bash
# dist/ を作って gh-pages ブランチのルートに置き、origin に push する（GitHub Pages で公開）。
# main の作業ツリーと .gitignore には触れない。gh-pages は一時的な git worktree で更新する。
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH=gh-pages
SRC_REV=$(git rev-parse --short HEAD)
npm run build

WT=$(mktemp -d "${TMPDIR:-/tmp}/tobira3d-pages.XXXXXX")
cleanup() { git worktree remove --force "$WT" >/dev/null 2>&1 || true; rm -rf "$WT"; }
trap cleanup EXIT

git fetch -q origin "$BRANCH" 2>/dev/null || true
if git show-ref -q --verify "refs/remotes/origin/$BRANCH"; then
  git worktree add -q -B "$BRANCH" "$WT" "origin/$BRANCH"
else
  git worktree add -q --detach "$WT"
  git -C "$WT" checkout -q --orphan "$BRANCH"
fi

# 前の公開物を消して、dist/ の中身と .nojekyll を置く
git -C "$WT" rm -rfq --cached --ignore-unmatch .
find "$WT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R dist/. "$WT"/
touch "$WT/.nojekyll"

git -C "$WT" add -A
if git -C "$WT" diff --cached --quiet; then
  echo "gh-pages: 変更なし"
else
  git -C "$WT" commit -q -m "deploy: main@$SRC_REV"
  echo "gh-pages: main@$SRC_REV をコミット"
fi
git -C "$WT" push -q origin "$BRANCH"
echo "公開: https://kzm-42.github.io/tobira3d/"
