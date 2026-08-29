# 财务服务运行手册

## 日志排障

容器日志为单行 JSON，日志中的 `requestId` 可串联网关和业务服务。容器启动后可直接检查标准输出和日志轮转配置：

```bash
docker logs --tail 100 chat-web-finance-service
docker inspect chat-web-finance-service --format '{{json .HostConfig.LogConfig}}'
```

| 项目             | 基线                                                        |
| ---------------- | ----------------------------------------------------------- |
| 容器             | `chat-web-finance-service`                                  |
| 容器端口         | `5030`                                                      |
| Nacos Data ID    | `chat-web-finance-service.yaml`                             |
| Nacos 服务名     | `chat-web-finance-service`                                  |
| 数据库           | `chat_web_finance`                                          |
| MySQL 授权边界   | 仅 `chat_web_finance.*`                                     |
| Redis index      | `1`                                                         |
| Account 鉴权地址 | `http://chat-web-account-service:5010`                      |
| 部署目录         | `/opt/chat-web-finance-service`                             |
| Docker 网络      | `chat-web-infrastructure`                                   |
| 部署主机         | `chat-home-server`                                           |
| Runner           | `chat-home-server`（标签 `chat-home-server`）                |

Runner 作为 `chat-home-server` 上的 Ubuntu WSL 主机服务运行，安装目录为 `/home/runner/actions-runner-finance`，现有 systemd 单元为 `actions.runner.Wlisfes-chat-web-finance-service.chat-server-home-finance.service`，调度标签为 `chat-home-server`。禁止重新创建 Docker Runner 容器；Runner 用户必须属于 `docker` 组并可写 `/opt/chat-web-finance-service`。

常用排障命令：

```bash
docker inspect chat-web-finance-service --format '{{.State.Health.Status}}'
docker inspect chat-web-finance-service --format '{{json .HostConfig.LogConfig}}'
docker logs --tail 100 chat-web-finance-service
curl -fsS http://127.0.0.1:5030/health
```

日志配置预期为 `json-file`、`max-size=20m`、`max-file=30`。请求日志应包含 `logId`、方法、URL、状态码、来源和耗时，密码及 Token 等敏感字段必须脱敏。

Finance 部署不读取 Account 的 `.env`、JWT 密钥或 Redis 会话。`/opt/chat-web-finance-service/.env` 只配置 NODE_ENV、PORT 和 Nacos 连接/注册参数；Redis index `1`、Redis 认证及 `ACCOUNT_SERVICE_URL` 全部由云端 Nacos 提供。

共享包包含 `forRootNacosRuntimeOptions` 后，Finance 在 `AppModule` 中直接调用 `NacosModule.forRoot(forRootNacosRuntimeOptions(process.env))`，由 base 统一把环境变量转换为完整 `NacosRuntimeOptions`。服务器 `.env` 必须显式提供 `NACOS_SERVER`、`NACOS_NAMESPACE`、`NACOS_SERVICE_NAME` 和 `PORT`；其余字段均由共享包提供默认值，只有确需覆盖时才配置。修改启动连接参数后必须重新创建容器，不能再依赖 Nacos 远端配置反向改变启动连接或注册参数。

仓库根目录 `.env.example` 只用于本地进程启动和 Nacos 建连；Finance 数据库、Redis index `1`、Account 上游地址和超时直接读取远端 `chat-web-finance-service.yaml`。服务器 `deploy/.env.example` 还服务于 Compose 和数据库引导，不得用根示例覆盖。

Finance Nacos Data ID 由运维预先在云端 Nacos 创建并维护，包含 Finance 专用数据库、Redis 和 Account 上游配置；部署不会从服务器 `.env` 生成或覆盖业务配置。数据库 `chat_web_finance` 必须由外部基础设施预创建。

使用 Finance 连接参数进入 MySQL 后核对：

```sql
SELECT DATABASE(), CURRENT_USER();
SHOW GRANTS FOR CURRENT_USER();
```

Schema 升级器会自动执行同一授权检查；除 `USAGE ON *.*` 外出现全局权限、其他数据库权限或角色授权时，部署会在切换容器前失败。真实用户名和密码不得写入仓库、命令日志或完整 `.env` 示例。

业务请求的 Bearer Token 由 `AccountAuthClient` 转发到 `GET /auth/token/introspect`。Account 不可达返回上游不可用，Token 无效返回未授权；Finance 不在本地验签，也不访问 Account Redis index `0`。

Finance 只管理品牌、币种、汇率、国家地区和基础价格。外部客户主表属于 Account 的 `tb_account_consumer`；`tb_finance_client*` 已由 Schema 增量删除，不得重新建表、接入 TypeORM 或恢复业务写入。

空库需要演示数据时，在 Actions 手动运行 `Build and deploy` 并开启 `seedDemoData`。初始化器只在 `chat-home-server` 的五张 Finance 业务表全部为空时以单个事务写入；任一表已有数据都会中止。容器内也可先 dry-run 核对数量，再显式提交：

```bash
docker exec chat-web-finance-service node dist/cli/seed-demo-finance.js
docker exec chat-web-finance-service node dist/cli/seed-demo-finance.js --apply
```

部署失败时先检查 Actions 的 `Ensure Finance Nacos config`、MySQL 授权检查、Schema 应用和容器健康检查步骤。镜像回滚由 `deploy.sh` 自动执行；预创建的数据库与数据不会自动删除。
