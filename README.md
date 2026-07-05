# Markdown Manager

Markdown Manager 是一个 Markdown 文档管理工具，支持 macOS 桌面版和 NAS 网页版两种运行方式。它可以新建、导入、编辑、预览 Markdown 文档，并用树形文件夹统一管理文档。

## 功能

- 新建 Markdown 文档，输入或粘贴 Markdown 文本后实时渲染预览。
- 导入 `.md` / `.markdown` / `.mdown` / `.mkd` 文件。
- 导入 ZIP 文件，自动解压其中的 Markdown 文件并保留目录层级。
- 将全部文档导出为 ZIP 文件，并保留当前文件夹结构。
- 编辑文档内容、标题和所属文件夹，自动保存到资料库。
- 支持树形文件夹、新建文件夹、重命名、删除、拖动排序和层级移动。
- 支持右键菜单管理文件夹和文档。
- 支持全文搜索文档标题和正文。
- 支持拖动调整目录栏、编辑栏和预览栏宽度。
- 支持一键收起编辑栏，让预览区域占满空间。
- 支持打包为 macOS DMG 安装包。
- 支持 Docker 部署到 NAS，通过浏览器访问，数据保存在 NAS 映射目录中。

## 技术栈

- Electron：macOS 桌面应用。
- Express：NAS / Docker 网页服务。
- Marked + DOMPurify：Markdown 渲染和 HTML 清理。
- AdmZip：ZIP 导入导出。
- Docker：NAS 部署。

## 本地开发

安装依赖：

```bash
npm install
```

运行桌面版：

```bash
npm start
```

运行网页版：

```bash
npm run web
```

默认网页地址：

```text
http://127.0.0.1:3000
```

网页版默认数据目录是项目下的 `data/`。可以用环境变量指定数据目录：

```bash
DATA_DIR=/path/to/markdown-data PORT=3000 npm run web
```

## Docker / NAS

项目包含 `Dockerfile` 和 `docker-compose.yml`。

本地构建当前机器架构镜像：

```bash
docker build -t markdown-manager:1.4.1 .
```

为 linux/arm64 NAS 构建并导出镜像：

```bash
docker buildx build --platform linux/arm64 -t markdown-manager:1.4.1 --load .
docker save -o releases/v1.4.1/markdown-manager-1.4.1-arm64.tar markdown-manager:1.4.1
```

容器配置：

```text
容器端口：3000
NAS 主机端口：8732
环境变量：DATA_DIR=/data, PORT=3000
目录映射：NAS 数据目录 -> /data
```

访问地址：

```text
http://NAS-IP:8732
```

更完整的 NAS 部署和更新流程见 [docs/NAS_DEPLOYMENT.md](docs/NAS_DEPLOYMENT.md)。

## 打包 macOS DMG

```bash
npm run dist
```

按架构打包：

```bash
npm run dist:mac:arm64
npm run dist:mac:x64
npm run dist:mac:universal
```

生成并归档版本安装包：

```bash
npm run release
```

归档目录：

```text
releases/v版本号/
```

发布流程见 [docs/RELEASE.md](docs/RELEASE.md)。

## 数据存储

桌面版数据保存在 Electron 的 `userData` 目录下，文件名为 `library.json`。

Docker / NAS 网页版数据保存在 `DATA_DIR` 指定目录下，文件名同样为 `library.json`。只要保留该数据目录，就可以删除旧容器并使用新镜像重新创建容器。

## 提交前检查

```bash
npm run lint
npm audit --omit=dev
```

## 版本

当前版本：`1.4.1`

变更记录见 [CHANGELOG.md](CHANGELOG.md)。
