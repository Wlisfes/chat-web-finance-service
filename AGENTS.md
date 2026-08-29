# Repository instructions

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
- 本服务独占 Redis index `1`。部署必须显式设置 `REDIS_DATABASE=1`，即使 `REDIS_URL` 自带其他库号也不得降级到 Account 的 index `0`。
- 禁止导入 Account Entity、连接 `chat_web_account`、读取 Account Redis 会话或持有 Account JWT 密钥。鉴权通过 `AccountAuthClient` 把 Bearer Token 转发到 Account `/auth/token/introspect`，其他跨服务数据访问也使用强类型 HTTP 客户端 Provider。

## Git 提交规范

- 所有提交信息必须使用 Conventional Commits 类型前缀，格式固定为 `<type>: 中文摘要`；如需填写作用域，使用 `<type>(<scope>): 中文摘要`。
- `type` 只能使用以下类型：`init`（项目初始化）、`feat`（添加新特性）、`fix`（修复缺陷）、`docs`（仅修改文档）、`style`（仅调整格式或样式）、`refactor`（代码重构）、`perf`（性能优化）、`test`（增加或调整测试）、`build`（构建或依赖变更）、`ci`（持续集成或部署配置）、`chore`（工程工具或其他维护性变更）。
- 提交摘要、正文和脚注必须使用中文；类型前缀保留上述英文小写关键字，代码标识符、命令和版本号可按实际需要保留原文。
- 每个提交应聚焦单一目的，摘要使用动词开头并准确说明影响范围，禁止使用 `update`、`modify` 等无意义描述或整句英文提交信息。
- 示例：`feat: 新增客户归属人筛选`、`fix: 修复 Nacos 服务注册失败`、`docs: 补充部署回滚说明`。
