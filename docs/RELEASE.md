# Release

本文档说明 Markdown Manager 的版本发布流程。

## 版本号

版本号保存在 `package.json`：

```json
"version": "1.4.1"
```

发布新版本前，先更新 `package.json` 和 `package-lock.json` 中的版本号。

建议规则：

```text
补丁修复：1.4.0 -> 1.4.1
功能更新：1.4.0 -> 1.5.0
重大改动：1.4.0 -> 2.0.0
```

## 提交前检查

```bash
npm run lint
npm audit --omit=dev
```

## macOS DMG

生成 DMG：

```bash
npm run dist
```

生成并归档：

```bash
npm run release
```

归档目录：

```text
releases/v版本号/
```

归档内容：

```text
Markdown Manager-版本号-mac-arm64.dmg
Markdown Manager-版本号-mac-arm64.dmg.blockmap
manifest.json
README.md
```

`manifest.json` 会记录文件大小和 SHA-256。

## Docker 镜像

linux/arm64：

```bash
docker buildx build --platform linux/arm64 -t markdown-manager:版本号 --load .
docker save -o releases/v版本号/markdown-manager-版本号-arm64.tar markdown-manager:版本号
```

linux/amd64：

```bash
docker buildx build --platform linux/amd64 -t markdown-manager:版本号 --load .
docker save -o releases/v版本号/markdown-manager-版本号-amd64.tar markdown-manager:版本号
```

示例：

```bash
docker buildx build --platform linux/arm64 -t markdown-manager:1.4.1 --load .
docker save -o releases/v1.4.1/markdown-manager-1.4.1-arm64.tar markdown-manager:1.4.1
```

## GitHub 提交建议

提交源码时包含：

```text
src/
scripts/
docs/
Dockerfile
docker-compose.yml
package.json
package-lock.json
README.md
CHANGELOG.md
LICENSE
.gitignore
.dockerignore
```

不要提交：

```text
node_modules/
dist/
releases/
data/
nas-data/
*.tar
*.dmg
```

大型安装包和 Docker 镜像 tar 建议放到 GitHub Releases。
