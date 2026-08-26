# chat-web-finance-service

财务中心微服务，负责品牌、币种、汇率、国家地区和短信基础价格。外部客户由账号服务的 `tb_account_consumer` 统一管理。

```bash
yarn install
yarn test
yarn schema:apply
```

根目录 `.env` 只提供 `NODE_ENV`、`PORT` 和 Nacos 连接参数。数据库、Redis index `1`、Account 上游地址及超时统一维护在 Nacos 远端 `chat-web-finance-service.yaml`；实际凭据不得提交到仓库。

旧财务库中的财务基础数据迁移默认 dry-run：

```bash
LEGACY_FINANCE_DATABASE=legacy_windows yarn legacy:migrate
```

确认目标表为空且汇总数量正确后才使用 `--apply`。该命令只迁移品牌、币种、汇率、国家地区和短信基础价格；旧客户数据必须迁入账号服务的 `tb_account_consumer`，禁止再次写入 Finance 数据库。

空库可使用固定 Faker 种子生成演示数据。默认命令只显示计划写入的数量，不修改数据库：

```bash
yarn seed:demo
yarn seed:demo --apply
```

初始化器会同时检查品牌、币种、汇率、国家地区和短信基础价格五张表；任一表已有数据即拒绝写入。旧 `tb_finance_client*` 表由 Schema 增量直接删除，不会生成客户演示数据。

## 可观测性

Docker 部署输出结构化单行 JSON 日志，日志包含 `requestId` 并支持通过容器标准输出直接排障，完整命令见 `deploy/RUNBOOK.md`。
