# 部署变更记录

## 2026-09-05：适配鉴权服务拆分并修复跨服务操作人查询

- 影响机器：`chat-home-server`。
- 关联版本：共享包升级到 `@wlisfes/chat-web-base-schema@1.5.2`。
- 变更内容：
    - 令牌校验改由新增的 `chat-web-auth-service` 承担；`FinanceAuthGuard` 逻辑不变，底层 `JwtAuthGuard` 改走鉴权服务内部内省协议。
    - 删除本地 `AccountUserFeignClient`，品牌列表的操作人还原改用共享包 `/feign/user/batch/resolver`：单次列表查询由最多 100 次跨服务请求收敛为 1 次。
    - 该调用改用 `feign.service_token` 服务凭据，不再转发终端用户令牌，修复了无 `account:user:list` 权限的操作员打开品牌列表时被账号服务拒绝的问题。
- 机器侧操作：在 Nacos `chat-web-finance-service.yaml` 新增 `feign.chat-web-auth.url`（`http://chat-web-auth-service:5050`）与 `feign.chat-web-auth.timeout`（`3000`）；确认 `feign.service_token` 与账号、鉴权服务一致。必须先部署鉴权服务和账号服务。
- 验证命令：`yarn format:check && yarn test && yarn build`；部署后用非超级管理员账号验证品牌分页返回操作人姓名。
- 回滚方法：恢复上一版完整 Git SHA 并回退共享包依赖；Nacos 新增字段可保留。

## 2026-09-04：兼容历史 Nacos 凭据字段并保留示例配置

- 影响范围：Finance 本地启动与 `chat-home-server` 部署镜像。
- 变更内容：服务间凭据优先读取 Nacos `feign.service_token`，同时兼容历史 `security.serviceToken`；数据库 `name` 字段仅在进程内映射，不修改远端配置；恢复环境示例中原有注册开关、权重字段和中文注释。
- 机器侧操作：无需修改 Nacos；继续使用现有 Data ID、字段名、注释和凭据。
- 验证命令：执行 `yarn build`、`yarn tsc -p tsconfig.json --noEmit` 和 `yarn test:unit`。

## 2026-09-04：升级共享运行时并统一 Nacos 配置读取

- 影响范围：Finance 本地开发与 `chat-home-server` 部署。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.25`。
- 变更内容：移除旧版数据库和 Feign 环境变量覆盖，改为直接读取 Nacos `database.chat-web-finance` 与 `feign.chat-web-account`；删除重复的本地 Feign 配置同步模块；历史数据库 `name` 字段仅在运行时读取时兼容，并统一按 `database` 使用。
- 机器侧操作：确认 Finance Nacos 已配置数据库、Redis 和 Feign 节点；无需新增业务环境变量，真实凭据继续只保存在 Nacos/部署主机。
- 验证命令：执行 `yarn build`、`yarn tsc -p tsconfig.json --noEmit`、`yarn test:unit`，并在 Docker 网络中验证 `/health/live`。
- 回滚方法：恢复上一版 Finance 完整 SHA 镜像和共享 Schema 依赖；Nacos 配置不回滚。

## 2026-09-03：本地 Nacos 客户端端口冲突自动避让

- 影响范围：Finance 本地开发启动；`chat-home-server` 的生产容器启动命令不变。
- 关联版本：Finance 本次 `developer` 分支提交。
- 变更内容：`yarn dev` 和 `yarn start` 启动前检测 Nacos Node 客户端默认端口 `7777`，冲突时在 `20000-45000` 中随机选择本机可用端口并仅注入当前子进程；不修改 `.env`、Nacos 或 Docker 配置。
- 机器侧操作：无需配置固定 `NODE_CLUSTER_CLIENT_PORT`；继续按现有 Nacos 启动参数运行。
- 验证命令：执行 `yarn prettier --check scripts/start-with-cluster-port.cjs`、`yarn tsc -p tsconfig.json --noEmit`、`yarn build`，并分别验证默认端口空闲和占用场景。
- 回滚方法：恢复本次提交前的 `package.json` 并删除启动包装器；Nacos 与业务数据无需回滚。

## 2026-09-04：部署 Schema 使用临时单库账号

- 影响范围：Finance `chat-home-server` 部署流水线的 Schema 阶段。
- 关联版本：Finance 本次 `developer` 分支修复提交。
- 变更内容：部署前从 Nacos 读取现有数据库连接；若连接账号已仅授权 Finance 数据库则直接执行增量 Schema，只有管理员或跨库账号才创建仅授权 Finance 数据库的随机临时迁移账号，执行后立即删除，避免权限隔离检查失败；不修改 Nacos 配置。
- 机器侧操作：无需新增环境变量、数据库账号或手工 SQL；确认 Nacos 中已有可连接目标库且具备创建/授权临时账号的管理员权限。
- 验证命令：执行 `yarn format:check`、`yarn tsc -p tsconfig.json --noEmit`、`yarn build`、`yarn test:full`；部署后检查 `/health/live` 和 Schema 迁移台账。
- 回滚方法：恢复上一版 Finance 镜像和 `deploy/deploy.sh`；已完成的幂等 Schema 迁移无需回滚，临时账号会在脚本结束时清理。

## 2026-09-03：适配嵌套 Feign 配置并停止部署回写 Nacos

- 影响机器：`chat-home-server`。
- 关联版本：Finance 本次完整 Git SHA 镜像。
- 变更内容：启动时将 Nacos `feign.chat-web-*.url/timeout` 映射为共享客户端兼容键，服务凭据读取 `feign.service_token`；部署前脚本改为只读校验，不再清理或回写人工配置。
- 机器侧操作：确认 Finance Nacos 已配置 `server.port`、`database.chat-web-finance`、`redis` 及 Account/CRM/Skyline Feign 节点；`.env` 仅保留 Nacos 启动参数。
- 验证命令：执行 `yarn build`、`yarn tsc -p tsconfig.json --noEmit` 和 `node --test test/*.test.cjs`；部署后检查 `/health/live`、远程 Account 鉴权和 Feign 调用。
- 回滚方法：恢复上一版 Finance 镜像和部署脚本；Nacos 配置不回滚。

## 2026-09-03：兼容私有 Schema 包锁文件地址

- 影响范围：Finance Docker 依赖安装阶段；本次仅提交 `developer`，未合并 `main`、未触发部署。
- 关联版本：服务版本 `0.0.1`；共享 Schema 版本由 `package.json` 依赖声明决定。
- 变更内容：Dockerfile 根据 `npm view` 返回的 tarball 地址更新 `yarn.lock` 时，同时兼容 GitHub Packages 的 `/download/...` 地址和旧版 `/-/...tgz` 地址，并在安装前校验替换确实生效，避免干净构建继续使用失效链接。
- 机器侧操作：无需修改 Nacos、数据库、Redis、Runner 或部署目录；发布前确认构建密钥仍通过 BuildKit Secret 提供。
- 验证命令：执行 `yarn format:check`、`yarn tsc -p tsconfig.json --noEmit`、`yarn build`、`yarn test:full`；构建日志确认私有 Schema 包安装成功。
- 回滚方法：切换到上一版健康 Finance 镜像；本次仅影响依赖下载阶段，不涉及数据库或业务数据变更。

## 2026-09-03：兼容汇率日期列迁移状态

- 影响范围：Finance Schema 增量迁移执行器；本次仅提交 `developer`，未合并 `main`、未触发部署。
- 关联版本：服务版本 `0.0.1`，共享 Schema 迁移文件校验和保持不变。
- 变更内容：执行 `rate_date` 重命名迁移前检查目标表字段；已由完整建表 SQL 创建 `date` 列时记录迁移并跳过重复 DDL，旧列存在时继续执行重命名，同时对双列或缺列状态报出明确错误。
- 机器侧操作：发布前确认 `tb_finance_currency_exchange` 仅存在 `rate_date` 或 `date` 其中一列；无需修改 Nacos、Redis 或业务数据。
- 验证命令：执行 `yarn prettier --check "src/**/*.ts" "test/**/*.cjs"`、`yarn build` 和 `node test/finance-service.test.cjs`；发布后执行 `SHOW COLUMNS FROM tb_finance_currency_exchange` 与 `yarn schema:apply`。
- 回滚方法：切换到上一版健康 Finance 镜像；已执行的列重命名不可通过镜像回滚恢复，必要时使用备份验证后的反向 DDL 并同步回退共享 Schema 版本。

## 2026-09-03：保留 Finance 服务间 Nacos 凭据

- 影响范围：Finance 部署脚本生成和清理 Nacos 配置；本次仅提交 `developer`，未合并 `main`、未触发部署。
- 变更内容：清理历史配置时仅保留顶层 `security.serviceToken`，继续移除 Account/JWT 等无关安全字段；缺少服务凭据时删除整个 `security` 段，避免误开放匿名访问。
- 机器侧操作：发布前确认 Finance 与 Skyline 的 Nacos 配置使用同一服务凭据；不得将真实凭据提交到仓库或写入日志。
- 验证命令：执行 `yarn format:check`、`yarn tsc -p tsconfig.json --noEmit`、`yarn build` 和 `node --test --experimental-test-isolation=none test/finance-service.test.cjs test/api-documentation.test.cjs`。
- 回滚方法：切换到上一版健康 Finance 镜像，并按需恢复上一版 Nacos 配置；不回滚已写入的汇率数据。

## 2026-09-02：新增汇率批量同步接口

- 影响范围：Finance 币种汇率 HTTP 接口；本次仅提交 `developer`，未合并 `main`、未触发部署。
- 关联版本：服务当前版本 `0.0.1`，共享 Schema 依赖沿用已发布版本。
- 变更内容：新增受 Bearer 鉴权保护的 `POST /currency/exchange/sync`，按“币种 + 日期”幂等写入汇率，供 Skyline 定时任务通过 Feign 调用；请求和响应 DTO 补充字段类型、示例与校验。
- 机器侧操作：发布时按正常 Finance 镜像更新流程滚动替换，无需修改 Nacos、数据库结构或外部基础设施。
- 验证命令：执行 `yarn prettier --check "src/**/*.ts" "test/**/*.cjs"`、`yarn build`、`node --test --experimental-test-isolation=none test/finance-service.test.cjs` 和 `node --test --experimental-test-isolation=none test/api-documentation.test.cjs`；部署后使用有效 Bearer 调用同步接口并检查 `tb_finance_currency_exchange` 的日期唯一记录。
- 回滚方法：切换到上一版健康 Finance 镜像；已写入的汇率记录按日期保留，不执行破坏性回滚。

## 2026-09-02：限制汇率同步写入范围并支持服务凭据

- 影响范围：Finance 汇率同步接口鉴权和币种过滤；本次仅提交 `developer`，未合并 `main`、未触发部署。
- 关联版本：服务当前版本 `0.0.1`，共享 Schema 依赖不变。
- 变更内容：同步接口继续接受有效 Account Bearer Token，并额外允许与 Nacos `security.serviceToken`（或 `FINANCE_SERVICE_TOKEN`）完全匹配的服务间 Bearer；未配置服务凭据时不会开放匿名访问。写入前只保留已启用币种，USD 仅在请求明确提供时作为特殊基础币种保留。
- 机器侧操作：在 Skyline 与 Finance 的 Nacos 配置中使用同一服务凭据，禁止写入仓库或日志；无需修改数据库结构和外部基础设施。
- 验证命令：执行 `yarn prettier --check "src/**/*.ts" "test/**/*.cjs"`、`yarn tsc -p tsconfig.json --noEmit`、`yarn build` 及 Finance 单元/API 文档测试。
- 回滚方法：切换到上一版健康 Finance 镜像；服务凭据配置保持不变。

## 2026-09-02：统一汇率日期列名

- 影响范围：Finance 数据库结构及演示/旧数据迁移脚本；本次仅提交 `developer`，未合并 `main`、未触发部署。
- 关联版本：等待 `@wlisfes/chat-web-base-schema` 发布包含 `20260902090000__tb_finance_currency_exchange__rename_rate_date_to_date.sql` 的新版本。
- 变更内容：`tb_finance_currency_exchange.rate_date` 重命名为 `date`；共享 Entity 仍以 `rateDate` 作为兼容的 TypeScript 属性，种子数据和旧库迁移改为写入新的物理列名。
- 机器侧操作：发布共享包后先升级 Finance 依赖，再执行 `yarn schema:apply`；确认列、唯一索引和普通索引均指向 `date` 后再重启服务。已执行的历史增量 SQL 不得修改。
- 验证命令：执行 `yarn format:check`、`yarn build`、`yarn test`；运行级验证执行 `SHOW COLUMNS FROM tb_finance_currency_exchange`、`SHOW INDEX FROM tb_finance_currency_exchange` 和 `/health/live`。
- 回滚方法：增量 DDL 执行后不可通过镜像回滚恢复旧列名；如需回滚，使用经备份验证的反向 DDL 并同步回退共享包和 Finance 镜像。

## 2026-08-31：修复 Redis 共享模块接入

- 影响范围：Finance 本地构建与后续 `chat-home-server` 部署；本次不合并 `main`、不触发部署。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.19`。
- 变更内容：移除共享 `RedisModule` 不支持的 `forRoot` 调用，恢复为直接导入全局模块；Redis index 继续由 Nacos `redis.database: 1` 管理，不在应用代码中写死。
- 机器侧操作：无需修改 `.env`、Nacos、Redis 数据或容器参数。
- 验证命令：执行 `yarn build` 和单元测试；发布时检查 `/health` 中 Redis 状态及日志中的 `database=1`。
- 回滚方法：恢复上一条可正常构建的健康 Finance 镜像；Nacos 配置和 Redis 数据不回滚。

## 2026-08-31：拆分快速单测与完整校验

- 影响范围：Finance 本地测试命令与 GitHub Actions 验证阶段；部署机器运行参数不变。
- 关联版本：服务版本 `0.0.1`。
- 变更内容：`yarn test` 改为快速单测，新增 `yarn test:unit`；完整构建与测试使用 `yarn test:full`，流水线改用完整命令。
- 机器侧操作：无需额外操作。
- 验证命令：`yarn test:unit`、`yarn test:full`。
- 回滚方法：恢复本次变更前的 `package.json` 与 Workflow 文件。

## 2026-08-31：Redis 改用 Nacos 嵌套配置并固定 index

- 影响范围：Finance 本地运行与后续部署；Redis index 固定为 `1`。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.19`。
- 变更内容：Finance 使用 `RedisModule.forRoot({ database: 1 })`；Redis 连接在 Nacos 配置加载后创建，并从 `redis.host`、`redis.port`、`redis.database`、`redis.tls` 和 `redis.connectTimeoutMs` 读取，凭据仍只放在 Nacos。旧 `REDIS_*` 变量仅保留为应急覆盖。
- 机器侧操作：发布共享包并升级 Finance 后，在本服务 Data ID 中维护 `redis.database: 1`；不要把 Redis 运行字段补回 `.env`。
- 验证命令：执行 `yarn build && yarn test`，并检查 `/health` 与 Nacos 中的 Redis index。
- 回滚方法：恢复上一条健康 Finance 镜像及共享包版本；Nacos 配置和 Redis 数据不回滚。

## 2026-08-31：升级共享基础包并统一本地依赖认证

- 影响范围：Finance 本地开发与后续部署构建。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.18`。
- 变更内容：Finance 依赖安装统一通过 `scripts/yarn-auth.cjs` 临时读取 GitHub CLI 凭据，避免 GitHub Packages 返回 401；不保存真实 Token。
- 验证命令：`yarn install`、`yarn build`、`yarn test`。
- 回滚方法：恢复上一版 package.json/yarn.lock 与依赖认证脚本。

## 2026-08-29：部署前清理旧版 Nacos 覆盖项

- 变更内容：部署流水线自动从主机 `.env` 移除 `NACOS_REQUEST_TIMEOUT`、`NACOS_REGISTER_PORT`、`NACOS_REGISTER_IP`、`NACOS_REGISTER_REQUIRED`、`NACOS_GROUP` 和 `NACOS_CONFIG_GROUP`，统一使用共享包默认值。
- 修复原因：历史 `.env` 残留字段会覆盖新的端口和分组默认值，导致服务注册信息与实际监听配置不一致。
- 影响范围：仅修改 Finance 部署主机的启动覆盖项，不影响 Nacos 远端业务配置。

## 2026-08-29：统一 Nacos 启动参数转换

- 影响机器：`chat-home-server`；本次仅改造调用代码，不触发镜像构建或线上部署。
- 关联版本：等待 `@wlisfes/chat-web-base-schema` 发布包含 `forRootNacosRuntimeOptions` 的新版本。
- 变更内容：Finance 改为直接调用 `NacosModule.forRoot(forRootNacosRuntimeOptions(process.env))`，移除逐字段环境变量映射。
- 机器侧操作：共享包发布并升级后再重建 Finance；现有 Nacos 配置、端口和数据库不变。
- 验证命令：共享包发布后执行 `yarn build && yarn test`，再按本服务健康检查验证。
- 回滚方法：恢复上一版共享包并还原旧的 `createNacosRuntimeOptions` 调用。

## 2026-08-29：统一服务监听端口为 5030

- 影响机器：`chat-home-server`；Company Runner 当前离线，本次不等待其部署结果。
- 关联版本：Finance 本次 `developer` 配置提交；未合并 `main`，不触发镜像构建或线上部署。
- 变更内容：Finance 容器、Nacos 注册和健康检查端口由 `3010`/`4010` 统一为 `5030`；云端生产与 development Data ID 的 `server.port` 已同步为 `5030`，Account 后备地址同步为 `5010`。
- 机器侧操作：下次部署重新创建 Finance 容器，使 `PORT=5030` 生效；数据库、Redis index `1`、Nacos 命名空间和网络不变。
- 验证命令：检查 `docker inspect` 中的 `PORT=5030`、访问容器 `/health/live`，并确认 Nacos 注册实例端口为 `5030`。
- 回滚方法：恢复上一条健康 Finance 完整 SHA，并将 Nacos `server.port` 与注册端口恢复为旧值。

## 2026-08-29：统一环境示例并补充 Nacos 鉴权读取

- 影响机器：`chat-home-server`；Company Runner 当前离线，本次不等待其部署结果。
- 关联版本：Finance 本次 `developer` 配置提交；未合并 `main`，不触发镜像构建或线上部署。
- 变更内容：根目录与部署目录 `.env.example` 统一只描述启动和 Nacos 参数，业务数据库、Redis、Account 地址继续由云端 Nacos 管理；Schema、历史迁移、演示数据 CLI 和 Nacos 引导脚本读取/发布配置时增加登录令牌。
- 机器侧操作：无需迁移数据库或修改 Redis index `1`；确认部署主机 `.env` 保留 Nacos 用户名和密码，真实密钥不得提交仓库。
- 验证命令：执行 `yarn build`；使用鉴权令牌读取 Finance Data ID，并检查 `/health/live` 和 Nacos 服务注册。
- 回滚方法：恢复上一条健康 Finance 完整 SHA；Nacos、数据库和 Redis 数据均不回滚。

## 2026-08-29：部署拓扑收敛到 chat-home-server

- 影响机器：仅 `chat-home-server`；原另一台部署机器已废弃并下线，不再创建部署任务。
- 关联版本：Finance 本次 `developer` 配置提交；未合并 `main`，不触发镜像构建或线上部署。
- 变更内容：删除 Company/Home 双机矩阵，Runner 选择标签统一为 `chat-home-server`，继续使用 `production-home` Environment 和 `/opt/chat-web-finance-service` 部署目录；移除无意义的演示数据目标选择。
- 机器侧操作：Finance 仓库在线 Runner 的自定义标签已由 `chat-server-home` 更新为 `chat-home-server`，systemd 服务保持运行；废弃机器的离线 Runner 登记已从 GitHub 删除，若要恢复只能使用新 Token 重新注册。无需修改 `.env`、Nacos、数据库、Redis index `1`、Account 上游、端口或 Docker 网络。
- 验证命令：校验 Actions YAML，确认现行配置不再引用 `chat-server-company`、`chat-server-home`、`production-company`、`seedDemoDataTarget` 或部署矩阵。
- 回滚方法：若新标签无法调度，仅把当前单机任务和在线 Runner 的自定义标签临时改回 `chat-server-home`；不得恢复废弃机器的部署任务，业务数据不回滚。

## 2026-08-28：统一可读日志与显式 Nacos 运行参数

- 影响机器：Home；Company Runner 当前离线，本次不等待其部署结果，恢复后继续兼容同一完整 SHA。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.15`、Finance 本次完整 Git SHA 镜像。
- 变更内容：统一使用共享 `ReadableConsoleLogger` 和请求日志默认过滤规则；请求日志只保留 `logId`，本地 JSON 保留缩进、生产 JSON 压缩为单物理行。按新版公共包契约显式映射现有 `NACOS_*` 启动参数，并向 Swagger 启动器传入 `NODE_ENV`。
- 机器侧操作：无需新增或修改 `.env`、Nacos Data ID、Finance 数据库、Redis index `1`、Account 上游地址、端口、Runner、部署目录或外部网络。
- 验证命令：执行 `yarn format:check && yarn tsc -p tsconfig.json --noEmit && yarn test`；部署后检查 `/health/live`、`/health`、Nacos 注册实例及 `docker logs --tail 100 chat-web-finance-service`。
- 回滚方法：恢复上一条健康 Finance 完整 SHA 镜像；Nacos、数据库和 Redis 数据均不回滚。

## 2026-08-26：根目录运行配置收口到 Nacos

- 影响机器：Company、Home；容器部署参数和双机矩阵不变。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.10`、Finance 本次完整 Git SHA 镜像；Nacos Data ID `chat-web-finance-service.yaml`。
- 变更内容：根目录 `.env.example` 仅保留 `NODE_ENV`、`PORT` 和 Nacos 建连字段；Finance 专属 MySQL、Redis index `1`、Account 上游地址与超时继续由远端 Data ID 提供，不新增第二份本地 YAML。
- 机器侧操作：各环境继续在自己的 Namespace 中维护真实 Finance 数据库、Redis 和 Account 上游配置。服务器 `deploy/.env` 仍由现有部署引导使用，不复制根目录示例。
- 验证命令：执行 `yarn format:check && yarn test`；确认根 `.env.example` 的有效键只有 `NODE_ENV`、`PORT`、`NACOS_SERVER`、`NACOS_NAMESPACE`，并核对 Nacos Redis index 为 `1`、Account 地址指向 HTTP 服务。
- 回滚方法：恢复上一条健康 Finance 完整 SHA；Nacos 真实配置与数据库、Redis 数据均不回滚。

## 2026-08-26：显式注入完整 Nacos 运行参数

- 影响机器：Company、Home；两台机器继续部署同一个 Finance 完整 Git SHA 镜像。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.9`；Finance 本次完整 Git SHA 镜像。
- 变更内容：由 base 内的 `NacosModule.forRoot` 统一把扁平化 `.env` 转换为完整 `NacosRuntimeOptions`；Finance 只传入服务名和注册端口，不再调用环境转换方法。环境示例补充认证、请求超时及每项默认行为。
- 机器侧操作：确认 `/opt/chat-web-finance-service/.env` 显式包含本机 `NACOS_SERVER`、`NACOS_NAMESPACE`；现有其他 `NACOS_*` 可保留，省略时按示例注释使用默认值。无需修改数据库、Redis index `1`、Account 上游地址、端口、Runner、部署目录或外部网络。
- 验证命令：执行 `yarn format:check && yarn test` 和 `IMAGE=example.invalid/chat-web-finance-service:compose-check docker compose --env-file deploy/.env.example -f deploy/compose.yml config --quiet`；部署后检查 `/health/live`、`/health` 及 Nacos 中 `chat-web-finance-service:3010` 实例。
- 回滚方法：恢复上一条健康 Finance 完整 SHA 镜像，并保留原服务器 `.env`；无需回滚数据库、Redis 或 Nacos 数据。

## 2026-08-25：移除 OpenTelemetry 运行依赖

- 影响机器：Home；Company 当前离线，本次不等待其部署结果。
- 关联版本：Finance 本次完整 Git SHA 镜像。
- 变更内容：移除 OpenTelemetry 自动插桩、OTLP Trace/指标导出和 Alloy 地址配置；保留单行 JSON、请求 ID 与 Docker 日志轮转。
- 机器侧操作：部署脚本会从现有 `.env` 自动移除遗留 `OTEL_*` 和 OpenTelemetry `NODE_OPTIONS`；无需修改 Nacos、数据库、Redis、端口或网络。
- 验证命令：执行 `yarn format:check && yarn test` 和 Compose 配置校验；部署后确认容器环境中不存在 `NODE_OPTIONS`、`OTEL_*`，并验证 `/health/live`。
- 回滚方法：恢复上一条健康 Finance 完整 SHA 镜像；业务数据不回滚。

## 2026-08-23：接入统一日志、指标与链路追踪

- 影响机器：Home；Company 当前离线，本次不等待其部署结果。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.6`、`@opentelemetry/auto-instrumentations-node@0.79.0`；Finance 本次完整 Git SHA 镜像。
- 变更内容：Nest 启动与请求日志统一输出单行 JSON，并关联 `requestId`、`traceId`、`spanId`；自动采集 HTTP、Nest、跨服务调用、MySQL、Redis 和 Node 运行指标，通过 Alloy OTLP/HTTP 上报到 Tempo 与 Prometheus；部署脚本把镜像完整 SHA 写入 `service.version`。
- 机器侧操作：先部署 `chat-web-observability`，确认 `chat-web-alloy:4318` 在 `chat-web-infrastructure` 网络内可达；现有 `.env` 无需新增必填项，默认环境标识为 `production-home`。
- 验证命令：执行 `yarn format:check && yarn test` 和 `docker compose --env-file deploy/.env.example -f deploy/compose.yml config --quiet`；部署后验证 `http://127.0.0.1:3010/health/live`，并在 Grafana 查询 `service=chat-web-finance-service` 的日志、指标和 Trace。
- 回滚方法：恢复上一条健康 Finance 完整 SHA 镜像；无需回滚数据库、Redis、Nacos 或观测平台数据。

## 2026-08-23：补全财务接口文档模型

- 影响机器：Home；Company 当前离线，本次不等待其部署结果。
- 关联版本：`@wlisfes/chat-web-base-schema@1.4.2`；Finance 本次完整 Git SHA 镜像。
- 变更内容：品牌、国家地区、币种汇率和短信基础价格接口统一使用聚合 Swagger/Apifox 装饰器，补齐请求字段示例、分页/下拉/批量响应类型，并将更新接口的 `keyId` 明确为可写整数入参。
- 机器侧操作：无需修改 Nacos、`.env`、数据库、Redis、端口、Runner、部署目录或网络。
- 验证命令：执行 `yarn format:check --end-of-line auto && yarn test`；部署后检查 `/api/swagger-json`、`/health`、品牌分页、汇率解析和短信价格批量接口。
- 回滚方法：恢复上一条健康 Finance 完整 SHA 镜像；无需回滚数据库、Redis、Nacos 或共享 Schema SQL。

## 2026-08-23：账号鉴权切换为声明式 Feign

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.3.0`；Finance 本次完整 Git SHA 镜像。
- 变更内容：Account Token 内省改由共享 `AccountFeignClient` 声明式接口完成；Finance 的短信批量价格和汇率解析接口同时纳入 `FinanceFeignClient`，供 CRM 强类型调用。服务内不再维护手写 `fetch` 鉴权实现。
- 机器侧操作：继续使用现有 `ACCOUNT_SERVICE_URL` 和超时配置；无需修改 Nacos、`.env`、数据库、Redis、端口、Runner、部署目录或网络。
- 验证命令：执行 `yarn format:check && yarn test`；部署后验证有效/失效 Token、短信批量价格、汇率解析和 `/health`。
- 回滚方法：恢复上一条健康 Finance 镜像，并同步回滚 CRM 到共享包 1.2.2；不回滚数据库和 Nacos。

## 2026-08-23：Home Runner 迁移为主机服务

- 影响机器：Home；Company Runner 离线状态保持不变。
- 关联版本：Finance 本次完整 Git SHA；业务接口、数据库结构和演示数据不变。
- 变更内容：`chat-server-home-finance` 从 `chat-web-finance-runner-home` 容器迁移为 Ubuntu WSL systemd 服务，继续使用仓库级 Runner 身份和 `chat-server-home` 标签。
- 机器侧操作：Runner 安装目录为 `/home/runner/actions-runner-finance`，部署目录迁移到主机 `/opt/chat-web-finance-service`；旧 Runner 容器及 Docker 卷已删除。无需修改 `.env`、Nacos、数据库、Redis、端口或网络。
- 验证命令：检查 systemd 服务为 `active/enabled`、日志包含 `Connected to GitHub` 和 `Listening for Jobs`；以 Runner 用户执行 Docker/Compose 检查，并确认本次 main 发布的 Home 部署和 `/health` 成功。
- 回滚方法：停止主机服务并使用 Finance 仓库生成的新临时 Token 重新注册 Runner；保留部署目录、业务容器及数据库数据。

## 2026-08-23：统一远程账号鉴权模块

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.2.2`；Finance 本次完整 Git SHA 镜像。
- 变更内容：删除 Finance 内重复的 `AccountAuthClient` 和 `AuthModule`，统一导入共享 `AccountRemoteAuthModule`；Bearer Token 仍通过 Account `/auth/token/introspect` 校验，不读取 Account Redis 或持有 JWT 密钥。
- 机器侧操作：无需修改 `.env`、Nacos、数据库、Redis、端口、Runner、部署目录或网络。
- 验证命令：执行 `yarn format:check && yarn test`；部署后检查 `/health`，并通过网关验证有效和失效 Token。
- 回滚方法：恢复上一条健康 Finance 完整 SHA 镜像；无需回滚数据库、Redis 或 Nacos。

## 2026-08-23：CRM 报价聚合接口与共享包升级

- 影响机器：Company、Home；需先于 CRM 首次部署完成。
- 关联版本：`@wlisfes/chat-web-base-schema@1.2.1`；Finance 本次完整 Git SHA 镜像。
- 变更内容：新增 `POST /rates/sms/batch`，按国家/地区主键数组返回基础短信价格；新增 `GET /currency/exchange/resolver` 返回最新汇率；供 CRM 强类型客户端调用，不开放数据库访问。同步升级共享包 1.2.1。
- 机器侧操作：无需修改数据库、Redis、Nacos、端口、Runner、部署目录或外部网络。
- 验证命令：执行 `yarn format:check && yarn test`；部署后携带有效 Token 验证批量价格和汇率接口。
- 回滚方法：回滚 Finance 镜像；CRM 报价初始化在旧接口不可用期间会返回上游异常，数据库无需回滚。

## 2026-08-22：接口方法命名、远程内省路径与请求日志

- 影响机器：Company、Home；需与 Account、Gateway 同一发布窗口部署。
- 关联版本：`@wlisfes/chat-web-base-schema@1.1.7`；Finance 本次完整 Git SHA 镜像。
- 变更内容：Controller 方法统一为 `httpBaseFinance...` 动作式命名，继续只使用 POST body；Account 远程鉴权改为 `GET /auth/token/introspect`。接入共享请求 ID/结构化请求日志并脱敏敏感字段；Compose 新增 `json-file` 日志驱动，单文件 20m、保留 30 个文件。
- 机器侧操作：无需修改 `.env`、Nacos、数据库、Redis、端口、Runner、部署目录或网络；Account 新接口部署后再切换 Finance。
- 验证命令：执行 `yarn format:check && yarn test` 和 `docker compose -f deploy/compose.yml config --quiet`；部署后验证健康、有效/无效 Token、Finance 查询，并检查 `docker inspect chat-web-finance-service --format '{{json .HostConfig.LogConfig}}'`。
- 回滚方法：Finance 与 Account 同步回滚到上一组兼容镜像；不回滚数据库、Redis 或演示数据。

## 2026-08-22：共享分页工具与 Account Consumer 路由

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.1.4`；Finance 本次完整 Git SHA 镜像。
- 变更内容：删除服务内重复的 `src/common/dto/page.dto.ts`，财务分页统一引用共享 `SizePageDto`，继续保持 `page/size` 协议和默认每页 50 条；外部客户入口文档修正为 Account `/api/account/consumer/**`。
- 机器侧操作：无需修改 `.env`、Nacos、Redis、数据库、端口、Runner、部署目录或外部网络；合并后由双机矩阵部署同一完整 SHA。
- 验证命令：执行 `yarn format:check && yarn test`；部署后执行 `docker inspect chat-web-finance-service --format '{{.Config.Image}} {{.State.Health.Status}}'` 和 `curl -fsS http://127.0.0.1:3010/health`。
- 回滚方法：将两台机器恢复到上一条健康 Finance SHA；无需回滚数据库、Nacos、Redis 或演示数据。

## 2026-08-22：客户主表退出 Finance 数据域

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.1.3`；Finance 本次完整 Git SHA 镜像。
- 变更内容：移除 Finance 的 Client 模块、实体和旧客户迁移映射；Schema 直接删除 `tb_finance_client`、标签、共享和设置四张旧表。新增基于 `@faker-js/faker` 固定种子的空库演示数据初始化器，覆盖品牌、币种、汇率、国家地区和短信基础价格；工作流手动输入 `seedDemoData=true` 时在部署后执行，并可通过 `seedDemoDataTarget` 只选择 Company、Home 或双机。
- 机器侧操作：无需修改 `.env`、Nacos、Redis、端口、Runner、部署目录或外部网络；部署前确认 Account 已接管需要保留的客户数据。Schema 升级器删除旧 Finance 客户表；仅当五张 Finance 业务表全部为空时才允许写入演示数据。外部客户后续只通过 Account `/api/account/consumer/**` 和 `tb_account_consumer` 管理。
- 验证命令：执行 `yarn format:check && yarn test`；部署后执行 `docker inspect chat-web-finance-service --format '{{.Config.Image}} {{.State.Health.Status}}'`、`curl -fsS http://127.0.0.1:3010/health`，确认 Finance Swagger 不再暴露 `/client/**`，并查询五张 Finance 业务表的记录数。
- 回滚方法：将 Finance 恢复到上一条健康 SHA；已删除的旧客户表只能从执行 Schema 变更前的数据库备份恢复，演示数据只能在确认没有业务写入后按固定创建账号 UID `2026082200000000001` 清理。禁止恢复旧 Finance Client 接口形成双主数据。

## 2026-08-19：业务数据库、Redis 与鉴权边界隔离

- 影响机器：Company、Home。
- 关联版本：`@wlisfes/chat-web-base-schema@1.1.2`；Finance 本次完整 Git SHA 镜像。
- 变更内容：Finance 移除本地 `SessionAuthModule` 和 JWT 验签，改由强类型 `AccountAuthClient` 转发 Bearer Token 到 Account `/auth/introspect`；独立加载 Redis 并强制 index `1`，显式 index 可覆盖 `REDIS_URL` 内库号。部署不再读取 Account `.env`，首次 Nacos 配置只接受 Finance 独立 MySQL 凭据；Schema 升级器不再建库，并拒绝全局、跨库或角色授权。
- 机器侧操作：两台机器分别确认 `/opt/chat-web-finance-service/.env` 中 Nacos/Redis/Account 地址完整且 `REDIS_DATABASE=1`。由 MySQL 管理员预创建 `chat_web_finance` 和 Finance 专用账号，仅授权 `chat_web_finance.*`；更新 Finance Nacos 配置并移除历史克隆的 Account/security 节点。Company 已完成专用账号创建、Nacos 凭据轮换和授权验证；Home 由部署前隔离引导执行同一规则。使用服务账号执行 `SELECT DATABASE(), CURRENT_USER()` 与 `SHOW GRANTS FOR CURRENT_USER()`，不得记录真实凭据。
- 验证命令：`yarn format:check && yarn test`；部署后执行 `docker inspect chat-web-finance-service --format '{{.Config.Image}} {{.State.Health.Status}}'`、`curl -fsS http://127.0.0.1:3010/health`，并携带同一 Account Token 经网关调用 Finance 接口，确认有效 Token 成功、撤销 Token 立即失败。
- 回滚方法：将两台机器恢复到上一条健康 Finance SHA；独立数据库账号和 Redis index `1` 不回滚。若需回滚到读取 Account Redis 会话的旧 Finance 版本，必须先明确批准临时破坏数据边界并恢复兼容配置。

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
