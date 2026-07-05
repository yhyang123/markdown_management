# NAS Deployment

本文档说明如何把 Markdown Manager 部署到 NAS，尤其是绿联 NAS 的 Docker 图形界面。

## 运行方式

Markdown Manager 的网页服务运行在容器内部 `3000` 端口。NAS 对外暴露一个主机端口，例如 `8732`。

推荐配置：

```text
NAS 主机端口：8732
容器端口：3000
协议：TCP
```

访问地址：

```text
http://NAS-IP:8732
```

## 数据目录

容器内数据目录固定建议为：

```text
/data
```

环境变量：

```text
DATA_DIR=/data
PORT=3000
```

NAS 上选择一个持久化目录映射到 `/data`，例如：

```text
/volume1/docker/markdown-manager-data -> /data
```

资料库文件会保存为：

```text
/data/library.json
```

更新镜像或重建容器时，只要不删除 NAS 上的数据目录，文档就会保留。

## Docker Compose 部署

项目自带 `docker-compose.yml`：

```bash
docker compose up -d
```

默认映射：

```text
8732 -> 3000
./nas-data -> /data
```

## NAS 图形界面部署

如果 NAS Docker 界面支持从镜像 tar 导入：

1. 在本地构建并导出对应架构的镜像 tar。
2. 在 NAS Docker 界面选择「导入镜像」。
3. 使用导入后的镜像创建容器。
4. 设置端口、环境变量和目录映射。
5. 启动容器。

linux/arm64 NAS 镜像构建命令：

```bash
docker buildx build --platform linux/arm64 -t markdown-manager:1.4.1 --load .
docker save -o releases/v1.4.1/markdown-manager-1.4.1-arm64.tar markdown-manager:1.4.1
```

linux/amd64 NAS 镜像构建命令：

```bash
docker buildx build --platform linux/amd64 -t markdown-manager:1.4.1 --load .
docker save -o releases/v1.4.1/markdown-manager-1.4.1-amd64.tar markdown-manager:1.4.1
```

## 创建容器参数

```text
镜像：markdown-manager:1.4.1
容器名称：markdown-manager
容器端口：3000
NAS 主机端口：8732
协议：TCP
环境变量：
  DATA_DIR=/data
  PORT=3000
目录映射：
  NAS 数据目录 -> /data
重启策略：
  unless-stopped / 自动重启
```

## 更新镜像

1. 修改 `package.json` 版本号，例如 `1.4.0` -> `1.4.1`。
2. 构建新镜像，例如：

```bash
docker buildx build --platform linux/arm64 -t markdown-manager:1.4.1 --load .
docker save -o releases/v1.4.1/markdown-manager-1.4.1-arm64.tar markdown-manager:1.4.1
```

3. 在 NAS 导入新镜像。
4. 停止并删除旧容器。
5. 使用新镜像重新创建容器，保持原来的端口、环境变量和目录映射。

核心原则：

```text
镜像可以换，容器可以删，数据目录不要删。
```

## Tailscale 访问

如果 NAS 已加入 Tailscale 网络，可以尝试：

```text
http://NAS-Tailscale-IP:8732
```

如果 Tailscale 容器无法访问 NAS 主机端口，需要配置 Tailscale subnet router，或在 Tailscale 侧转发到 NAS 主机端口。

## 排查

确认端口是否可访问：

```bash
curl -I http://NAS-IP:8732
```

正常响应：

```text
HTTP/1.1 200 OK
```

确认 API：

```bash
curl http://NAS-IP:8732/api/library
```

正常响应会返回 `folders` 和 `documents`。

容器日志中应该有：

```text
Markdown Manager web server listening on http://0.0.0.0:3000
Data directory: /data
```
