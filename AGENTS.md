# Repository instructions

## 默认双机部署规则

- 本服务默认同时部署到 Company 和 Home 两台独立机器。Company Runner 标签固定为 `chat-server-company`，Home Runner 标签固定为 `chat-server-home`。只有用户明确批准单机例外时，才允许移除其中一台。
- GitHub Actions 只构建并发布一次镜像，并将同一个完整 Git SHA 镜像部署到两台机器；禁止两台机器各自构建可能不同的 `latest` 版本。
- 部署阶段使用矩阵，包含 `company / chat-server-company / production-company` 和 `home / chat-server-home / production-home`。矩阵必须设置 `fail-fast: false`，并使用按机器隔离的 `deploy-${server}` concurrency。
- 两台机器分别安装本仓库专用的 Self-hosted Runner，部署目录固定为 `/opt/chat-web-finance-service`；不得与其他服务共用部署目录。
- 服务加入外部 Docker 网络 `chat-web-infrastructure`，Compose 项目名使用 `chat-web-service`。不得重建、删除或接管 MySQL、Redis、RabbitMQ、Nacos 等基础设施容器。
- 两台机器的部署都必须包含容器健康检查、部署后端点验证和失败自动回滚，并部署同一个精确 SHA。

## 部署变更记录

任何会影响 Docker 构建、服务启动、运行参数、Nacos、端口、健康检查、Runner、部署目录或外部网络的修改，都必须在同一次改动中更新 `deploy/CHANGELOG.md`。

变更记录至少包含：日期、影响机器、关联版本、变更内容、机器侧操作、验证命令和回滚方法。禁止在文档中记录密码、Token、私钥或完整 `.env`。

## 共享 Schema 依赖联动

- `chat-web-base-schema` 变更发布后，本服务必须升级到明确版本并使用共享 Entity，禁止复制表定义。
- 所有财务业务表使用自增 `key_id`；账号 UID 只作为明确的跨服务引用或审计字段。
- TypeORM 必须保持 `synchronize: false` 和 `migrationsRun: false`，表结构只由共享 Schema SQL 发布。
