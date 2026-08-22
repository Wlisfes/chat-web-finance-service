# chat-web-finance-service

财务中心微服务，负责品牌、币种、汇率、国家地区和短信基础价格。外部客户由账号服务的 `tb_account_consumer` 统一管理。

```bash
yarn install
yarn test
yarn schema:apply
```

旧财务库中的财务基础数据迁移默认 dry-run：

```bash
LEGACY_FINANCE_DATABASE=legacy_windows yarn legacy:migrate
```

确认目标表为空且汇总数量正确后才使用 `--apply`。该命令只迁移品牌、币种、汇率、国家地区和短信基础价格；旧客户数据必须迁入账号服务的 `tb_account_consumer`，禁止再次写入 Finance 数据库。
