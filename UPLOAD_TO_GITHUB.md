# Upload this version to GitHub

## Option A: overwrite current repo files

1. Unzip this package.
2. Copy all files into your existing `mcp-install-guard` repository.
3. Run:

```bash
npm run check
npm test
npm run demo
npm run gate:demo
```

4. Commit and push:

```bash
git add .
git commit -m "Upgrade MCP Install Guard to security gate"
git push
```

## Option B: create a clean branch

```bash
git checkout -b security-gate-upgrade
# copy files into repo
npm run check
npm test
git add .
git commit -m "Upgrade MCP Install Guard to security gate"
git push -u origin security-gate-upgrade
```

## Publish beta

```bash
npm publish --tag beta --access public
```

If npm returns 403, fix your npm automation token first.
