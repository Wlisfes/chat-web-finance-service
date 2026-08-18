# chat-web-finance-service

财务中心微服务，兼容旧管理端 `/api/windows/finance/**` 接口，负责品牌、币种、汇率、国家地区、消费客户和短信基础价格。

```bash
yarn install
yarn test
yarn schema:apply
```

旧财务库迁移默认 dry-run：

```bash
LEGACY_FINANCE_DATABASE=legacy_windows yarn legacy:migrate
```

确认目标表为空且汇总数量正确后才使用 `--apply`。当前已提供的旧平台导出文件不包含 `tb_windows_*` 财务表，需要另行导出旧财务数据库后才能迁移实际数据。
