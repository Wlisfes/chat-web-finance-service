# Repository instructions

本文件在本仓库内独立生效，不依赖 `F:/chat-web-service/AGENTS.md` 或其他工作区文件。

## 通用工程规则

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

## 单机部署规则

- 本服务只部署到当前主机 `chat-home-server`，原另一台部署机器已废弃并下线，不得再为废弃机器创建部署任务或多机矩阵。
- GitHub Actions 使用 `chat-home-server` Runner 标签和 `production-home` Environment，只构建并发布一次完整 Git SHA 镜像，然后部署到 `/opt/chat-web-finance-service`。
- 当前主机安装本仓库专用的 Self-hosted Runner，不得与其他服务共用 Runner 注册或部署目录。
- 服务加入外部 Docker 网络 `chat-web-infrastructure`，Compose 项目名使用 `chat-web-service`。不得重建、删除或接管 MySQL、Redis、RabbitMQ、Nacos 等基础设施容器。
- 部署必须包含容器健康检查、部署后端点验证和失败自动回滚，不得使用 `--remove-orphans`。

## 部署变更记录

任何会影响 Docker 构建、服务启动、运行参数、Nacos、端口、健康检查、Runner、部署目录或外部网络的修改，都必须在同一次改动中更新 `deploy/CHANGELOG.md`。

变更记录至少包含：日期、影响机器、关联版本、变更内容、机器侧操作、验证命令和回滚方法。禁止在文档中记录密码、Token、私钥或完整 `.env`。

## 共享 Schema 依赖联动

- `chat-web-base-schema` 变更发布后，本服务必须升级到明确版本并使用共享 Entity，禁止复制表定义。
- 所有财务业务表使用自增 `key_id`；账号 UID 只作为明确的跨服务引用或审计字段。
- TypeORM 必须保持 `synchronize: false` 和 `migrationsRun: false`，表结构只由共享 Schema SQL 发布。

## 服务数据边界

- 本服务独占 MySQL 数据库 `chat_web_finance` 和独立账号。运行与 Schema 升级账号只能访问 `chat_web_finance.*`，不得拥有全局权限、Account 库权限或跨库角色；数据库由外部基础设施预创建，升级器不得执行 `CREATE DATABASE`。
- 本服务独占 Redis index `3`。Redis 库号以 Nacos `redis.database` 为准，部署不得通过 `.env` 覆盖为其他业务服务的库号。
- 认证归 `chat-web-auth-service`。禁止导入 Account Entity、连接 `chat_web_account`、读取登录会话存储或持有 `security.jwt.*`；只导入共享包 `AuthModule`，由它通过 `/internal/auth/token/introspect` 内部协议校验令牌，共享包 `auth-session` 子路径只允许鉴权服务导入。
- 跨服务业务数据访问必须使用共享包的强类型 Feign 客户端。账号服务的 `/feign/*` 接口使用 `resolveFeignServiceAuthorization` 组装的服务间凭据，不得转发终端用户令牌；把用户令牌用于这些接口会因权限码和数据范围校验被拒绝。禁止在本仓库重复定义账号服务的 Feign 客户端。
- 需要把操作人 UID 渲染为姓名工号时，统一使用共享客户端的 `batchResolveUsers` 批量接口，禁止在列表查询中按行发起单条查询。
- 跨服务地址和超时统一读取 Nacos `feign.chat-web-*.url/timeout`，服务间凭据读取 `feign.service_token`；不得在部署 `.env` 固定业务 URL 或超时。本服务必须配置 `feign.chat-web-auth.url` 和 `feign.chat-web-auth.timeout`。

## HTTP 模块分层与接口实现

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

## 分支生命周期

- 远程仓库只保留 `main`、`developer` 两个长期分支；临时需求分支必须先合并到 `developer`，发布时同步合并到 `main`，合并并验证通过后立即删除远程和本地临时分支。

## Git 提交规范

- 所有提交信息必须使用 Conventional Commits 类型前缀，格式固定为 `<type>: 中文摘要`；如需填写作用域，使用 `<type>(<scope>): 中文摘要`。
- `type` 只能使用以下类型：`init`（项目初始化）、`feat`（添加新特性）、`fix`（修复缺陷）、`docs`（仅修改文档）、`style`（仅调整格式或样式）、`refactor`（代码重构）、`perf`（性能优化）、`test`（增加或调整测试）、`build`（构建或依赖变更）、`ci`（持续集成或部署配置）、`chore`（工程工具或其他维护性变更）。
- 提交摘要、正文和脚注必须使用中文；类型前缀保留上述英文小写关键字，代码标识符、命令和版本号可按实际需要保留原文。
- 每个提交应聚焦单一目的，摘要使用动词开头并准确说明影响范围，禁止使用 `update`、`modify` 等无意义描述或整句英文提交信息。
- 示例：`feat: 新增客户归属人筛选`、`fix: 修复 Nacos 服务注册失败`、`docs: 补充部署回滚说明`。
