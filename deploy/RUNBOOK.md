# 财务服务运行手册

| 项目 | 基线 |
| --- | --- |
| 容器 | `chat-web-finance-service` |
| 容器端口 | `3010` |
| Nacos Data ID | `chat-web-finance-service.yaml` |
| Nacos 服务名 | `chat-web-finance-service` |
| 数据库 | `chat-web-finance` |
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

首次部署要求 `/opt/chat-web-account-service/.env` 已存在且 Runner 可读。流水线只同步 JWT、Redis、Nacos 连接参数，不复制 Account 数据库变量；Finance Nacos Data ID 只在不存在时根据 Account 配置派生，已有配置不会被覆盖。

部署失败时先检查 Actions 的 `Ensure Finance Nacos config`、Schema 应用和容器健康检查步骤。镜像回滚由 `deploy.sh` 自动执行；已创建的数据库与数据不会自动删除。
