# Chat Web 微服务工程规约（仓库内置版）

## 适用范围与工程基准

- 本文件已经复制到每个仓库内，独立生效；根目录 `AGENTS.md` 已废弃，不再作为开发依据。
- 用户明确点名服务、仓库或目录时，只修改点名目标；不得因共享包联动、依赖检查或关联关系擅自改动其他项目。发布共享包后，只更新用户明确要求联动的消费服务。
- `chat-web-account-service` 是微服务工程结构、编码格式和命名方式的基准项目。
- `chat-web-base-schema` 由本仓库内更具体的 Schema 规则和 `docs/schema-conventions.md` 管理。
- 新建服务时先复制基准工程配置，再删除不需要的业务模块；不要重新发明一套工程格式。

## 工程与工具链

- 使用 Node.js 22、Yarn 1.22.22、NestJS 11 和 TypeScript。
- `tsconfig.json`、`tsconfig.build.json`、`nest-cli.json`、`.prettierrc`、`.gitignore`、`.gitattributes` 和 `.dockerignore` 与账号服务保持一致。
- 内部源码使用 `@/*` 路径别名；同一项目不要混用多套别名前缀。
- 统一使用 4 空格、无分号、单引号、`printWidth: 140`、无尾随逗号。
- 源码和脚本使用 UTF-8；Shell、YAML、Dockerfile 提交为 LF。
- 业务源码和配置文件必须编写清晰、必要的中文注释；新增配置项必须同步说明用途，修改或格式化时必须保留既有注释，不得删除、覆盖或改写；注释中不得出现真实密码、Token、私钥等敏感信息。

## 目录与文件命名

- 通用入口固定为 `src/main.ts` 和 `src/app.module.ts`。
- 业务或基础设施模块放在 `src/modules/<module-name>/`。
- 文件名使用小写 kebab-case，并使用职责后缀：
  - `*.module.ts`
  - `*.controller.ts`
  - `*.service.ts`
  - `*.middleware.ts`
  - `*.interface.ts`
  - `*.constants.ts`
  - `*.options.ts`
- 一个模块的接口、常量和配置构造分别放入对应后缀文件，不与实现类混放。
- 测试文件与被测文件同名并使用 `*.spec.ts`；禁止提交生成目录、依赖目录和真实 `.env`。

## TypeScript 与 NestJS 命名

- 类、接口、类型、枚举和装饰器使用 PascalCase。
- 变量、函数、方法、参数和实例属性使用 camelCase。
- 常量和注入 Token 使用 UPPER_SNAKE_CASE。
- 环境变量使用 UPPER_SNAKE_CASE，并优先添加所属服务或模块前缀，例如 `ACCOUNT_*`、`GATEWAY_*`。
- NestJS 类使用明确职责后缀，例如 `AccountService`、`GatewayController`、`NacosModule`。
- 禁止无意义的导出别名，例如 `export { TbAccountUser as tbAccountUser }`。
- 日志、校验消息、Swagger 描述和面向维护者的错误信息使用中文；代码标识符使用英文。

## 模块边界

- 网关只负责统一入口、路由、认证基础能力、限流、日志和服务发现，不连接业务数据库。
- 业务服务独立管理数据库连接；TypeORM 必须保持 `synchronize: false` 和 `migrationsRun: false`，数据库和表结构由外部 Schema SQL 管理。
- TypeORM Entity、完整字段 DTO 和表 SQL 统一由 `chat-web-base-schema` 管理，业务服务只安装并使用该包。
- 数据库和表由外部 SQL 创建或变更，服务启动过程不得自动建表或改表。
- Nacos 相关代码统一位于 `src/modules/nacos/`，配置项命名在所有服务中保持一致。
- 所有公开微服务路由和跨域白名单统一维护在 Nacos `chat-web-gateway-service.yaml`；新增服务必须追加 `gateway.routes`，不在网关源码中硬编码新代理。
- Nacos 配置中的 `gateway.cors.allowedOrigins` 使用完整 HTTP(S) Origin，禁止填写带路径的 URL；生产环境不得使用 `*`。

## HTTP 接口与日志

- Controller 只使用 `GET`、`POST`；禁止 `PUT`、`PATCH`、`DELETE` 和 `/:uid`、`/:keyId` 等路径参数。
- `GET` 只通过 `query` 接收入参，`POST` 只通过 `body` 接收入参；入参字段超过 3 个时必须使用 `POST` 和 `body`。
- 多选配置必须使用数组字段并通过 `POST` `body` 传输，禁止逗号分隔字符串。
- 分页接口统一使用 `page`（从 1 开始）和 `size`（默认 50、最大 100），响应统一使用 `page`、`size`、`total`、`list`；禁止使用 `pageSize`、`items`、`records` 或 `rows` 作为同义字段。
- 路由使用单数业务模块和动作式后缀，例如 `user/resolver`、`user/column`、`role/update/menu`；Controller 方法使用与 `nest-platform-service` 一致的 `httpBase<Service><Action><Resource>` 风格。
- 管理端 `src/api/**/modules/*.service.ts` 必须保持为干净的传输层：接口函数接收与后端协议一致的类型，只负责发起请求并原样传递 `query`/`body`，禁止在 API 层做参数归一化、字段改名、默认值注入、类型转换、响应映射或响应包装。
- 管理端页面字段与接口字段不一致时，转换、兼容和业务默认值必须放在页面/业务域层（如 composable、store 或业务 service）；不得在 API 文件中增加私有转换函数、Adapter 或隐式适配逻辑。服务端协议转换应放在 DTO/业务层。
- HTTP 服务统一接入 `chat-web-base-schema` 的请求上下文和请求日志中间件；日志必须包含请求 ID、方法、URL、状态码、来源、入参和耗时，并隐藏密码、Token 等敏感字段。
- Docker Compose 统一使用 `json-file` 日志驱动，单文件最大 `20m`、保留 `30` 个文件；排障和轮转验证命令写入各服务 `deploy/RUNBOOK.md`。

## NestJS 业务接口编码基准

- `chat-web-account-service/src/modules/sheet/` 和 `src/modules/dept/` 是菜单、部门模块的 Controller、Service、DTO、Utils Service 与 Module 组织方式基准；下列规则必须完整写入每个 NestJS 仓库自己的 `AGENTS.md`，不得只依赖本工作区文件。
- Controller 必须保持为薄协议层：只声明路由、权限、Swagger/Apifox 元数据，接收 `query`、`body`、当前身份或必要请求/响应上下文，并将参数原样交给同名 Service 方法；禁止解构/改名业务参数、补业务默认值、拼装业务响应、访问 Repository 或编写业务判断。设置 Cookie、响应头、重定向和流式响应等纯 HTTP 协议操作可以保留在 Controller。
- Controller 与对应 Service 的公开接口方法必须统一使用 `public async`，并采用 `httpBase<Service><Action><Resource>` 命名；两层方法名必须完全一致。Controller 不得调用 `create`、`list`、`findOne`、`update` 等另一套简写方法名。
- Controller 的 `GET` 只接收 `@Query()` DTO，`POST` 只接收 `@Body()` DTO；局部变量使用 `query`、`body` 或 `input` 等能够准确表达来源的名称，无请求 DTO 的接口不制造空 DTO。每个接口都必须使用 `ApiServiceDecorator` 完整声明请求来源、请求 DTO、响应 DTO、数组标识和中文说明。
- Service 负责业务编排和事务边界，公开接口方法必须添加简洁中文职责注释并显式声明 `Promise<...>` 返回类型；入参优先接收完整 DTO，不得要求 Controller 拆字段或做协议转换。DTO 在 Service 中优先使用 `import * as XxxDto` 归组引用。
- 分页查询统一返回 `PageResult<Entity>`，使用 `DataBaseService.builder` 构造 QueryBuilder，别名统一为 `t`；筛选、排序、分页和 `getManyAndCount` 应在同一 builder 回调内清晰完成。禁止在业务模块重复封装 QueryBuilder 或创建无意义 Repository Adapter。
- 可复用的实体查找、存在性校验、唯一性校验、树校验、锁表等工具逻辑放入同模块 `<module>.utils.service.ts`，使用 `@Injectable()` 并由 Module 注册注入；主 Service 只保留用例编排。不得把仅调用一次且没有复用价值的简单业务步骤机械拆成工具类。
- 多步写操作、唯一性检查、层级结构调整和关联关系替换必须由 Service 明确建立事务；需要并发保护时通过 Utils Service 锁定相关数据，再执行校验和写入。
- 普通业务入参中可选字段的空值判断统一使用 `class-validator` 的 `isEmpty`、`isNotEmpty`；禁止编写 `input.xxx !== undefined && ...` 或用隐式 truthy/falsy 代替该类入参判空。只有必须区分“字段未传”和“显式传入 null”的三态更新字段可以直接判断 `undefined`，且必须保留该语义说明；实体查询结果、基础设施配置解析、布尔值判断、枚举比较和两个已确认非空值之间的相等性比较不受此限制。
- DTO 必须放在模块 `dto/` 目录，优先通过 `PickType`、`PartialType`、`IntersectionType` 复用 `chat-web-base-schema` DTO；分页 DTO 继承公共 `PageDto`。字段必须具备 Swagger 示例/说明、必要的类型转换和中文校验消息。
- Module 按 `imports`、`controllers`、`providers`、`exports` 组织；新增 Utils Service 必须注册到 `providers`。不得改变既有公开路由、权限、响应结构和业务语义来迎合代码格式。

## Git 提交规范

- 所有提交信息必须使用 Conventional Commits 类型前缀，格式固定为 `<type>: 中文摘要`；如需填写作用域，使用 `<type>(<scope>): 中文摘要`。
- `type` 只能使用以下类型：`init`（项目初始化）、`feat`（添加新特性）、`fix`（修复缺陷）、`docs`（仅修改文档）、`style`（仅调整格式或样式）、`refactor`（代码重构）、`perf`（性能优化）、`test`（增加或调整测试）、`build`（构建或依赖变更）、`ci`（持续集成或部署配置）、`chore`（工程工具或其他维护性变更）。
- 提交摘要、正文和脚注必须使用中文；类型前缀保留上述英文小写关键字，代码标识符、命令和版本号可按实际需要保留原文。
- 每个提交应聚焦单一目的，摘要使用动词开头并准确说明影响范围，禁止使用 `update`、`modify` 等无意义描述或整句英文提交信息。
- 示例：`feat: 新增客户归属人筛选`、`fix: 修复 Nacos 服务注册失败`、`docs: 补充部署回滚说明`。

## 配置、文档与部署

- Company 部署机和 `chat-server-company` Runner 已废弃；所有 Docker 服务只部署到当前主机 `chat-home-server`，不得再为 Company 创建部署任务、矩阵项或恢复等待队列。
- GitHub Actions 的 Self-hosted Runner 选择标签统一使用 `chat-home-server`，部署环境继续使用 `production-home`；每个仓库仍使用独立 Runner 注册和独立 `/opt/<repository-name>` 部署目录。
- 流水线只构建并发布一次完整 Git SHA 镜像，然后部署到 `chat-home-server`；不得保留无实际目标的多机器部署矩阵。
- `chat-home-server` 上的部署必须执行容器健康检查、部署后端点验证和失败自动回滚；历史废弃机器的配置仅作为变更记录保留，不得作为当前运行基线。
- 每个环境变量都必须同时写入 `.env.example`；部署变量还要写入 `deploy/.env.example` 并提供中文说明。
- `.env.example` 只作为配置项清单，值使用稳定示例或明确占位符；只要求配置项不缺失，不得为了同步某台机器的 Namespace ID、端口或其他真实运行值而反复修改示例文件。
- `.env.example` 只保留连接 Nacos 所必需的启动参数和当前机器特有的覆盖项；端口、业务连接、路由、跨域、限流、超时、发现分组及服务名称放入对应 Nacos YAML。
- 真实密钥、Token 和生产 `.env` 不得提交；构建密钥使用 BuildKit Secret 或 GitHub Actions Secret。
- 每个服务提供 `/health`，容器健康检查优先使用不依赖下游服务的 `/health/live`。
- 每个 HTTP 服务提供 Swagger；公开路由、环境变量和部署方式必须同步更新 README。
- Docker 容器使用非 root 用户；所有业务服务归属同一个 `chat-web-service` Compose 项目并接入 `chat-web-infrastructure` 外部网络。
- 各服务由独立 Compose 文件部署时禁止使用 `--remove-orphans`，避免部署一个服务时删除同组的其他微服务。

## 代码验证与分支规则

- 日常开发使用 `developer` 分支；新服务合并到 `main` 后触发构建部署流水线。
- 远程仓库只保留 `main`、`developer` 两个长期分支；需求开发使用的临时分支必须先合并到 `developer`，发布时同步合并到 `main`，两边合并并验证通过后立即删除临时分支（远程和本地），不得保留其他长期或已完成分支。
- 单个小功能、样式调整或普通缺陷修复完成后，只提交并推送到 `developer`，不得立即合并 `main` 或触发构建部署流水线；应累计一批已完成且验证通过的改动后统一发布。只有用户明确要求发布/部署，或确属需要立即上线的紧急修复时，才允许单独合并 `main` 并触发流水线。
- 至少执行格式检查、TypeScript 类型检查和 Nest 构建。
- 涉及代理、数据库、服务发现或部署时，必须增加对应的运行级验证。
- 修改公共工程规约时，同步检查所有现有微服务，避免只修新项目而留下配置分叉。

## 本仓库专属补充规约

以下规则在通用规约基础上适用于本仓库；如涉及本仓库专属边界，以本节的具体约束为准。

### 本仓库工程补充规则

- 使用 Node.js 22、Yarn 1.22.22、NestJS 11 和 TypeScript；源码使用 UTF-8，Shell、YAML 和 Dockerfile 使用 LF。
- 统一使用 4 空格、无分号、单引号、`printWidth: 140`、无尾随逗号；内部源码统一使用 `@/*` 路径别名。
- 文件名使用小写 kebab-case 和职责后缀；类、接口、枚举使用 PascalCase，变量、函数使用 camelCase，常量和注入 Token 使用 UPPER_SNAKE_CASE。
- 日志、校验消息、Swagger 描述和面向维护者的错误信息使用中文，代码标识符使用英文。
- 业务源码和配置文件必须编写清晰、必要的中文注释；配置文件包括 Nacos YAML、Compose、Dockerfile、Actions 和 `.env.example`。新增配置项必须同步说明用途，修改或格式化时必须保留既有注释，不得删除、覆盖或改写；注释中不得出现真实密码、Token、私钥等敏感信息。
- HTTP Controller 只允许 GET、POST；GET 使用 query，POST 使用 body；多选参数必须是数组，禁止使用 `/:uid` 等路径参数。
- 分页接口统一使用 `page`（从 1 开始）和 `size`（默认 50、最大 100）作为入参，响应统一返回 `page`、`size`、`total`、`list`；禁止使用 `pageSize`、`items`、`records` 或 `rows` 作为同义字段。
- 请求日志必须包含 logId、方法、URL、状态码、来源、入参和耗时，并脱敏密码、Token 等敏感字段。
- TypeORM 必须保持 `synchronize: false` 和 `migrationsRun: false`；Finance 不得连接其他业务数据库或读取其他服务 Redis。
- `.env.example` 只列出启动所需参数和明确占位符；真实密钥、Token、私钥和生产 `.env` 不得提交。
- 每次改动至少执行格式检查、TypeScript 类型检查和 Nest 构建；涉及数据库、代理、服务发现或部署时增加运行级验证。

### 部署变更记录

任何会影响 Docker 构建、服务启动、运行参数、Nacos、端口、健康检查、Runner、部署目录或外部网络的修改，都必须在同一次改动中更新 `deploy/CHANGELOG.md`。

变更记录至少包含：日期、影响机器、关联版本、变更内容、机器侧操作、验证命令和回滚方法。禁止在文档中记录密码、Token、私钥或完整 `.env`。

### 共享 Schema 依赖联动

- `chat-web-base-schema` 变更发布后，本服务必须升级到明确版本并使用共享 Entity，禁止复制表定义。
- 所有财务业务表使用自增 `key_id`；账号 UID 只作为明确的跨服务引用或审计字段。
- TypeORM 必须保持 `synchronize: false` 和 `migrationsRun: false`，表结构只由共享 Schema SQL 发布。

### 服务数据边界

- 本服务独占 MySQL 数据库 `chat_web_finance` 和独立账号。运行与 Schema 升级账号只能访问 `chat_web_finance.*`，不得拥有全局权限、Account 库权限或跨库角色；数据库由外部基础设施预创建，升级器不得执行 `CREATE DATABASE`。
- 本服务独占 Redis index `3`。Redis 库号以 Nacos `redis.database` 为准，部署不得通过 `.env` 覆盖为其他业务服务的库号。
- 认证归 `chat-web-auth-service`。禁止导入 Account Entity、连接 `chat_web_account`、读取登录会话存储或持有 `security.jwt.*`；网关调用鉴权服务的 `/internal/auth/token/introspect` 后向本服务签发身份上下文，Finance 只通过共享 `GatewayPrincipalModule` 校验该上下文，共享包 `auth-session` 子路径只允许鉴权服务导入。
- 跨服务业务数据访问必须使用共享包的强类型 Feign 客户端。所有 `/feign/*` 调用都使用 `resolveFeignServiceAuthorization` 组装的服务间凭据，不得转发终端用户令牌；Gateway 对 `/feign/**` 只负责路由，不调用 Auth 用户鉴权。禁止在本仓库重复定义其他服务的 Feign 客户端。
- 需要把操作人 UID 渲染为姓名工号时，统一使用共享客户端的 `batchResolveUsers` 批量接口，禁止在列表查询中按行发起单条查询。
- 跨服务客户端统一通过 Gateway，地址和超时读取 Nacos `gateway.feign.url/timeout`，服务间凭据读取 `gateway.feign.service_token`。Finance 不得在本服务 Nacos 或部署 `.env` 中维护未使用的目标服务 URL、用户 Token 或历史凭据别名。
- 汇率同步的外部数据拉取、响应解析、启用币种过滤和财务数据库持久化全部由 Finance 负责；Skyline 只通过无业务请求体的 `/feign/finance/currency/exchange/sync` 触发任务。Open Exchange Rates App ID 读取 Nacos 必需项 `integration.openExchangeRates.appid`，请求超时读取可选项 `integration.openExchangeRates.timeout`；汇率表只允许新增，不得更新已入库记录。

### HTTP 模块分层与接口实现

- 所有公开 HTTP 模块必须以 `chat-web-account-service/src/modules/sheet/` 的 Controller、Service、Utils Service、Module 和 DTO 分层为唯一实现基准；新模块不得自行设计另一套调用结构。
- Controller 必须保持为薄传输层，只保留路由、鉴权、接口文档等装饰器，使用 `@Query()` 或 `@Body()` 接收入参，并调用同名 Service 方法；禁止在 Controller 中查询数据库、转换参数、拼装响应或执行业务校验。
- Cookie 读写、Header 解析、流或文件响应、重定向等依赖 Express 的纯 HTTP 协议适配允许保留在 Controller；禁止把 `Request`、`Response`、Cookie、Header 或响应发送逻辑传入业务 Service，协议例外必须写中文职责注释。
- Controller 与对应 Service 的公开接口方法统一声明为 `public async`；CRUD、列表等通用动作通常使用 `httpBaseFinance<Action><Resource>`，Tree、Resolver 等资源专属读取语义可使用 `httpBaseFinance<Resource><Action>`，命名语义参考基准模块的 `httpBaseAccountSheetTree`、`httpBaseAccountSheetResolver`。两层方法名必须完全一致，不得只为统一单词顺序而机械倒装；Controller 不得再调用 `create`、`list`、`update`、`select` 等短方法名。
- 每个公开 Service 方法必须添加简洁中文职责注释并声明明确的 `Promise<...>` 返回类型；分页结果使用共享 `PageResult<T>`，对外扩展字段使用独立响应 DTO，禁止依赖隐式推断掩盖响应结构变化。
- 请求 DTO 必须位于模块自己的 `dto/*.dto.ts`，Controller 和 Service 共同使用同一协议类型；禁止在 Controller、Service 或装饰器配置中声明临时匿名 DTO。
- 业务 Service 引用本模块请求 DTO 时统一使用 `import * as <Module>Dto` 命名空间归组，并通过 `<Module>Dto.<Type>` 标注参数；响应 DTO 继续按需使用命名导入，禁止把请求与响应协议混在同一组散乱导入中。
- 每个接口必须通过 `ApiServiceDecorator` 完整声明请求的 `source`、`type` 和响应的 `type`、`isArray`（数组响应时）及中文说明；确实无入参的接口直接省略 request 配置，禁止为文档形式制造空 DTO。
- DTO 字段必须提供 Swagger 示例/说明、必要的类型转换和中文校验消息；优先使用 `PickType`、`PartialType`、`IntersectionType` 复用共享 DTO，分页 DTO 继承公共 `PageDto`。
- 查询优先通过共享 `DataBaseService.builder()` 统一创建 QueryBuilder，QueryBuilder 别名固定为 `t`；Service 负责业务流程与结果组装，可复用的详情查找、唯一性校验、批量存在性校验和锁操作必须抽入 `<module>.utils.service.ts`，Utils Service 使用 `@Injectable()` 并由 Module 注册注入。仅调用一次且无复用价值的简单步骤不得机械拆成 Utils Service。
- 多步校验后写入、唯一性校验后写入和批量关系变更必须由 Service 建立 TypeORM 事务；Utils 方法参与事务时接收 `EntityManager` 并始终使用该 Manager 的 Repository，需要并发保护时先锁定相关数据。Module 按 `imports`、`controllers`、`providers`、`exports` 组织。
- 普通可选字段和跨服务入参判空统一使用 `class-validator` 的 `isEmpty`、`isNotEmpty`；禁止使用 `value === undefined`、`value === null` 或一般性的隐式 truthy 判断代替判空。TypeORM 的 `getOne()` / `findOne()` 实体结果允许使用 `if (!entity)` 完成 TypeScript 空值收窄，布尔条件和集合长度判断应表达真实业务语义。
- 三态字段必须保留“未传、显式 null、具体值”的差异；确需区分 `undefined` 与 `null` 时允许明确判断，但必须添加注释说明协议语义，禁止用 `isEmpty` 合并三态。
- 重构不得改变现有路由、HTTP 方法、鉴权要求、请求字段、响应结构、异常信息、事务边界或业务行为；完成后至少运行格式检查、TypeScript 类型检查、完整测试和 Nest 构建。
