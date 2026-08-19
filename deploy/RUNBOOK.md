# 财务服务运行手册

| 项目 | 基线 |
| --- | --- |
| 容器 | `chat-web-finance-service` |
| 容器端口 | `3010` |
| Nacos Data ID | `chat-web-finance-service.yaml` |
| Nacos 服务名 | `chat-web-finance-service` |
| 数据库 | `chat_web_finance` |
| MySQL 授权边界 | 仅 `chat_web_finance.*` |
| Redis index | `1` |
| Account 鉴权地址 | `http://chat-web-account-service:3000` |
| 部署目录 | `/opt/chat-web-finance-service` |
| Docker 网络 | `chat-web-infrastructure` |
| Company Runner | `chat-server-company-finance`（标签 `chat-server-company`） |
| Home Runner | `chat-server-home-finance`（标签 `chat-server-home`） |

常用排障命令：

```bash
docker inspect chat-web-finance-service --format '{{.State.Health.Status}}'
docker logs --tail 100 chat-web-finance-service
curl -fsS http://127.0.0.1:3010/health
```

Finance 部署不读取 Account 的 `.env`、JWT 密钥或 Redis 会话。`/opt/chat-web-finance-service/.env` 必须独立配置 Nacos、Redis 地址/认证和 `ACCOUNT_SERVICE_URL`，并固定 `REDIS_DATABASE=1`；即使 `REDIS_URL` 带 `/0`，共享运行时也会用显式 index `1` 覆盖。

Finance Nacos Data ID 不存在时，引导脚本只接受显式 `FINANCE_MYSQL_HOST/PORT/DATABASE/USERNAME/PASSWORD` 并生成最小 Finance 配置，禁止从 Account 配置复制数据库凭据。数据库 `chat_web_finance` 必须由外部基础设施预创建。已有环境若曾从 Account 配置派生，应先创建 Finance 专用 MySQL 账号、仅授权 `chat_web_finance.*`，更新 Finance Nacos 配置；引导脚本会自动移除不属于 Finance 的 Account/security/Redis 节点。

使用 Finance 连接参数进入 MySQL 后核对：

```sql
SELECT DATABASE(), CURRENT_USER();
SHOW GRANTS FOR CURRENT_USER();
```

Schema 升级器会自动执行同一授权检查；除 `USAGE ON *.*` 外出现全局权限、其他数据库权限或角色授权时，部署会在切换容器前失败。真实用户名和密码不得写入仓库、命令日志或完整 `.env` 示例。

业务请求的 Bearer Token 由 `AccountAuthClient` 转发到 `GET /auth/introspect`。Account 不可达返回上游不可用，Token 无效返回未授权；Finance 不在本地验签，也不访问 Account Redis index `0`。

部署失败时先检查 Actions 的 `Ensure Finance Nacos config`、MySQL 授权检查、Schema 应用和容器健康检查步骤。镜像回滚由 `deploy.sh` 自动执行；预创建的数据库与数据不会自动删除。
