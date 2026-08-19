# 部署变更记录

## 2026-08-19：共享运行时模块接入

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.1.1`；财务服务本次完整 Git SHA 镜像。
- 变更内容：删除财务服务内重复的 Auth、Redis、Nacos 和数据库配置实现，改用共享 `SessionAuthModule`、Redis/Nacos 模块及 MySQL 配置工厂。账号服务签发的 JWT、Redis 会话键、Nacos Data ID、注册名、端口 3010、财务数据库覆盖项和 `decimalNumbers` 行为保持不变。
- 机器侧操作：无需修改 `.env`、Nacos、Redis、数据库、端口、Runner、部署目录或外部网络；合并后由现有双机矩阵部署同一完整 SHA。
- 验证命令：`yarn format:check && yarn test`；部署后分别执行 `docker inspect chat-web-finance-service --format '{{.Config.Image}} {{.State.Health.Status}}'`、`curl -fsS http://127.0.0.1:3010/health`，并通过网关携带账号 Token 调用财务查询接口。
- 回滚方法：将两台机器恢复到上一条健康财务服务 SHA；不回滚数据库、Nacos 或 Redis 会话数据。

## 2026-08-18：Home 隔离 Docker 配置补齐 Compose 插件

- 影响机器：Home；Company 保持兼容。
- 关联版本：Finance 服务本次流水线修复提交；业务镜像仍为 `260bd2fd2df4b9b07d01dcfaf73264fdbcd6f319`。
- 变更内容：部署校验创建隔离 `DOCKER_CONFIG` 后，如果 Runner 持久卷中存在预装的 Docker Compose 插件，则将其复制到隔离配置的 `cli-plugins` 目录，再执行 `docker compose version`。这样既保留 GHCR 登录信息隔离，又让容器化 Home Runner 能使用已安装插件；Company 的系统级 Compose 路径不受影响。
- 机器侧操作：无需安装软件或修改 `.env`；合并后重新运行同一 Finance 精确 SHA 的部署流水线，Home Runner 会自动复用持久卷内插件。
- 验证命令：确认 `Validate local Docker host` 输出 Compose 版本；确认 Company/Home 的部署任务均成功；在两台机器分别执行 `docker inspect chat-web-finance-service --format '{{.Config.Image}} {{.State.Health.Status}}'` 和容器内 `/health` 检查。
- 回滚方法：回滚本次工作流提交即可；复制出的插件只位于每次任务的临时 `DOCKER_CONFIG`，任务结束后清理，不修改 Runner 持久卷和已运行服务。

## 2026-08-18：财务微服务首次部署

- 影响范围：Company、Home；Company 为当前本地联调目标。
- 关联版本：`@wlisfes/chat-web-base-schema@1.0.8` 与财务服务首个版本。
- 变更内容：新增 `chat-web-finance-service`，容器端口 3010，注册名 `chat-web-finance-service`，Nacos Data ID 为 `chat-web-finance-service.yaml`；单次构建同一完整 SHA 并通过矩阵部署到 Company/Home。部署从本机 Account 环境安全同步 JWT、Redis、Nacos 连接参数；Finance Data ID 不存在时从 Account 数据库配置派生一次，随后部署前自动创建并升级 `chat-web-finance` 数据库。提供旧 `tb_windows_*` 财务数据 dry-run/显式提交迁移工具。
- 机器侧操作：两台机器安装本仓库专用 Runner，标签分别为 `chat-server-company`、`chat-server-home`；确认 `/opt/chat-web-account-service/.env` 可由 Runner 读取、`chat-web-infrastructure` 网络存在。网关增加 `/api/windows/finance` 路由。
- 健康检查：使用共享 1.0.8 的运行时请求标记保留真实 HTTP 503，并在响应 `data` 中返回数据库、Redis、JWT 就绪详情；普通业务异常仍使用 HTTP 200 与响应体 `code`。
- WSL/Docker Desktop：Nacos 引导脚本通过 stdin 传给临时 Node 容器，避免 Docker 守护进程无法挂载 WSL `/opt` 文件导致首次部署失败。

### 验证

```bash
docker inspect chat-web-finance-service --format '{{.Config.Image}} {{.State.Health.Status}}'
curl -fsS http://127.0.0.1:3010/health
docker logs --tail 100 chat-web-finance-service
curl -fsS http://127.0.0.1:3010/health
```

### 回滚

- 将 compose 的镜像恢复为上一条健康 SHA 后重新启动服务。
- 首次部署尚无旧镜像时停止并删除财务服务容器，同时从网关移除财务路由；保留财务数据库，确认无新数据后再备份删除。
- 数据迁移默认回滚；执行 `--apply` 前必须备份旧库和目标库。
