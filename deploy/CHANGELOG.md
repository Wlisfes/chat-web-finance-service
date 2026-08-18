# 部署变更记录

## 2026-08-18：财务微服务首次部署

- 影响范围：Company、Home；Company 为当前本地联调目标。
- 关联版本：`@wlisfes/chat-web-base-schema@1.0.8` 与财务服务首个版本。
- 变更内容：新增 `chat-web-finance-service`，容器端口 3010，注册名 `chat-web-finance-service`，Nacos Data ID 为 `chat-web-finance-service.yaml`；单次构建同一完整 SHA 并通过矩阵部署到 Company/Home。部署从本机 Account 环境安全同步 JWT、Redis、Nacos 连接参数；Finance Data ID 不存在时从 Account 数据库配置派生一次，随后部署前自动创建并升级 `chat-web-finance` 数据库。提供旧 `tb_windows_*` 财务数据 dry-run/显式提交迁移工具。
- 机器侧操作：两台机器安装本仓库专用 Runner，标签分别为 `chat-server-company`、`chat-server-home`；确认 `/opt/chat-web-account-service/.env` 可由 Runner 读取、`chat-web-infrastructure` 网络存在。网关增加 `/api/windows/finance` 路由。
- 健康检查：使用共享 1.0.8 的运行时请求标记保留真实 HTTP 503，并在响应 `data` 中返回数据库、Redis、JWT 就绪详情；普通业务异常仍使用 HTTP 200 与响应体 `code`。

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
