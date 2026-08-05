# OpenAI 兼容模型管理后台设计

- 日期：2026-08-06
- 部署形态：单机或单容器
- 管理员形态：单一用户名与密码
- 目标：通过可视化后台配置、验证和热切换任意兼容 OpenAI Chat Completions 协议的模型供应商，并查看基础用量。

## 1. 范围与成功标准

第一版管理后台必须提供：

1. 管理员登录、会话检查与退出。
2. 新建、编辑、删除、启用模型供应商配置。
3. DeepSeek、MiniMax、GLM、OpenAI 快捷模板，以及完全自定义的兼容端点。
4. 自动调用兼容 `/models` 接口发现模型；发现失败时仍可手动维护任意模型 ID。
5. 使用选定模型发送最小 Chat Completions 请求进行连接测试。
6. 激活供应商和模型后，新游戏请求无需重启后端即可使用新配置。
7. 展示请求数、成功率、失败数、平均延迟、估算输入/输出 Token，支持按供应商和模型聚合。
8. API Key 只在服务端加密保存，任何读取接口和日志都不得返回完整密钥。
9. 未配置数据库模型时，保留现有环境变量模型配置作为兼容回退。
10. 使用模拟 OpenAI 兼容端点完成自动化全流程，并在真实浏览器中展示管理页面。

第一版不包含多管理员、用户管理、计费扣款、举报处置、复杂权限角色或多实例同步。

## 2. 方案选择

采用现有 FastAPI 与 React 应用内集成的单体方案。FastAPI 负责认证、加密、SQLite 持久化和供应商调用；React 在 `/admin` 提供独立管理界面。该方案沿用现有部署链路，满足单机热切换，同时把数据库和客户端工厂隔离在清晰接口之后，便于未来迁移 PostgreSQL。

环境变量仅作为启动密钥和兼容回退，不作为日常模型配置界面。独立管理服务与 PostgreSQL 对当前单机范围过重，不纳入第一版。

## 3. 系统组件

### 3.1 AdminSettings

从环境变量读取：

- `ADMIN_USERNAME`：管理员用户名。
- `ADMIN_PASSWORD`：管理员密码；生产环境至少 12 个字符。
- `ADMIN_SESSION_SECRET`：签名管理员会话；生产环境至少 32 个字符。
- `MODEL_CONFIG_ENCRYPTION_KEY`：Fernet 主密钥，用于加密供应商 API Key。
- `MODEL_CONFIG_DB_PATH`：SQLite 文件位置，默认 `data/model-config.db`。
- `ALLOW_PRIVATE_MODEL_ENDPOINTS`：仅开发环境可选，用于测试本机兼容端点。

生产环境缺少或不合格的关键配置时必须启动失败。示例文件只放占位符，不放可用生产密钥。

### 3.2 AdminSessionManager

用户名使用常量时间比较，密码使用 `hashlib.scrypt` 派生值后常量时间比较。登录成功后签发带过期时间和随机会话 ID 的 HMAC Token，通过 HttpOnly Cookie 传递；Cookie 使用 `SameSite=Lax`，生产环境启用 `Secure`。所有写操作校验管理员会话和请求 Origin。

连续登录失败受独立固定窗口限流保护。认证失败统一返回 401，不区分用户名或密码错误。

### 3.3 ModelConfigRepository

SQLite 使用标准库 `sqlite3`，事务范围短，不引入 ORM。仓储拥有以下表：

#### `model_providers`

| 字段 | 含义 |
|---|---|
| `id` | UUID |
| `name` | 管理员可读名称，唯一 |
| `preset` | `openai`、`deepseek`、`minimax`、`glm` 或 `custom` |
| `base_url` | OpenAI 兼容 API 根地址 |
| `api_key_ciphertext` | Fernet 加密值 |
| `api_key_last4` | 仅用于界面确认 |
| `models_json` | 手动或发现的模型 ID 列表 |
| `active_model` | 当前选择模型 |
| `is_enabled` | 是否允许连接、测试和激活 |
| `is_active` | 全局仅允许一条为真 |
| `created_at`、`updated_at` | UTC 时间 |

#### `model_usage`

记录请求时间、端点、供应商 ID、供应商名称、模型、结果、延迟、估算输入 Token、估算输出 Token和请求 ID。不得记录用户输入、故事正文或 API Key。

#### `admin_audit`

记录登录、供应商增删改、发现、测试和激活操作，只保存操作类型、目标 ID、结果和时间，不保存密钥或请求正文。

仓储初始化时创建表和必要索引。API Key 只在需要建立上游客户端时解密；列表与详情返回 `has_api_key` 和末四位。

### 3.4 EndpointPolicy

供应商 URL 必须是无用户名、密码、查询参数和片段的 HTTP(S) URL。生产环境仅允许 HTTPS，并在解析 DNS 后拒绝 loopback、link-local、私网、保留和未指定地址，降低 SSRF 风险。开发测试只有在 `ALLOW_PRIVATE_MODEL_ENDPOINTS=true` 时才允许本机 HTTP 地址。

Base URL 保留供应商要求的路径，例如 `/v1`；调用层统一去除末尾斜杠，不猜测或强制添加版本路径。

### 3.5 OpenAICompatibleClient

统一封装官方 `openai` Python SDK：

- `list_models` 调用 `GET /models` 并返回去重排序后的模型 ID。
- `test_chat` 调用 `POST /chat/completions`，发送最短系统/用户消息，`max_tokens` 为小值。
- 供应商不实现 `/models` 时，返回结构化失败，管理员仍可手动填模型。
- 上游错误转换为安全、可操作的错误码，不把响应中的认证信息或完整正文写日志。
- 请求超时由服务端统一控制。

DeepSeek、MiniMax、GLM 和 OpenAI 模板只预填名称与常见 Base URL，不限制模型清单。任何兼容供应商均可使用 `custom`。

### 3.6 RuntimeModelResolver

`LLMFactory.create_llm()` 每次调用时查询当前激活配置；有激活配置时创建 `ChatOpenAI`，传入解密后的 Key、精确 Base URL 和模型 ID。无激活配置时沿用现有环境变量逻辑。

意图 Agent 和叙事 Agent 不得在模块导入或构造时永久缓存 LLM。它们在每次分析或叙事调用时从工厂获得客户端，因此后台切换只影响后续请求，进行中的请求继续使用创建时的配置。

运行时解析结果包含供应商 ID、供应商名和模型名，供生成元数据、预算记录和用量统计使用。

### 3.7 UsageRecorder

沿用现有可观测性预算结算点，在请求完成、失败、超时或取消时写入一条脱敏用量记录。Token 使用现有字符估算方法，界面明确标注为估算值；连接测试单独标记，不混入玩家故事用量。

管理 API 提供最近 24 小时、7 天和 30 天聚合，返回总请求、成功率、失败数、平均延迟、输入/输出 Token，以及按供应商/模型分组数据。

## 4. 管理 API

所有响应使用 JSON；除登录外均要求管理员 Cookie。

| 方法与路径 | 行为 |
|---|---|
| `POST /api/admin/session` | 登录并设置 Cookie |
| `GET /api/admin/session` | 返回登录状态和用户名 |
| `DELETE /api/admin/session` | 退出并清除 Cookie |
| `GET /api/admin/providers` | 返回脱敏供应商列表 |
| `POST /api/admin/providers` | 新建供应商 |
| `PATCH /api/admin/providers/{id}` | 编辑供应商；空 Key 表示保留旧值 |
| `DELETE /api/admin/providers/{id}` | 删除非激活供应商 |
| `POST /api/admin/providers/{id}/discover` | 自动发现并保存模型列表 |
| `POST /api/admin/providers/{id}/test` | 测试指定或当前模型 |
| `POST /api/admin/providers/{id}/activate` | 原子激活供应商和模型 |
| `GET /api/admin/usage?window=24h` | 返回基础用量聚合 |
| `GET /api/admin/audit` | 返回最近脱敏管理操作 |

写接口对名称、URL、模型 ID 数量与长度设置边界。删除激活供应商返回 409；激活不存在于保存列表中的手动模型时，先验证格式再加入列表。

## 5. React 管理后台

访问 `/admin` 时绕过玩家落地页，加载独立 `AdminApp`：

1. **登录页**：用户名、密码、错误提示和登录中状态。
2. **顶部状态区**：当前激活供应商、模型、最近测试状态、退出按钮。
3. **供应商区**：卡片/表格展示名称、模板、Base URL、Key 末四位、模型数和激活状态。
4. **配置抽屉**：模板选择、名称、Base URL、API Key、手动模型 ID；编辑时 Key 留空表示不变。
5. **操作区**：保存、发现模型、连接测试、激活、删除；危险操作二次确认。
6. **用量区**：24 小时/7 天/30 天切换，展示总请求、成功率、平均延迟、估算 Token及按模型表格。
7. **审计区**：展示最近管理操作，不显示秘密。

界面使用现有字体和金色/羊皮纸设计语言，但保持管理工具的信息密度与可读性。桌面使用双栏布局，移动端堆叠。所有表单具备可见标签、键盘焦点、禁用状态与 `aria-live` 错误提示。

## 6. 数据流与错误处理

### 保存与激活

管理员登录 → 提交供应商 → 服务端验证 URL/字段 → 加密 Key → SQLite 事务保存 → 测试连接 → 选择模型激活 → SQLite 事务清除旧激活并设置新激活 → 后续游戏请求读取新配置。

保存不自动激活，测试失败不删除配置。激活要求供应商启用、Key 存在且模型 ID 合法；为了支持部分供应商的非标准模型发现，激活不强制要求最近一次测试成功，但界面展示明确警告。

### 运行时失败

激活配置缺失或无法解密时，模型请求失败关闭，不静默切回另一个供应商。只有数据库完全没有激活配置时才使用环境变量回退。上游 401、429、超时和协议错误映射到现有安全错误事件，并写失败用量。

### 数据恢复

SQLite 文件与 `MODEL_CONFIG_ENCRYPTION_KEY` 必须成对备份；缺少主密钥时不提供绕过解密的恢复方式。更换主密钥不在第一版界面完成。

## 7. 测试策略

实施遵循红-绿-重构：

- 仓储测试：建表、加密非明文、脱敏、原子激活、禁止删除激活项、用量聚合。
- 安全测试：生产必需配置、登录失败、Cookie 过期、管理员限流、URL SSRF 边界、接口不泄密。
- 客户端测试：模拟 OpenAI `/models` 和 `/chat/completions`，覆盖成功、无模型接口、401、429、超时和畸形响应。
- 热切换测试：连续两次工厂解析在激活变更后使用不同 Base URL/模型，证明无重启切换。
- API 集成测试：登录、CRUD、发现、测试、激活、用量与审计完整链路。
- 前端测试：登录、脱敏显示、手动模型、发现失败回退、激活状态、用量窗口和错误提示。
- 浏览器验证：启动本地 FastAPI、模拟兼容供应商和 Vite，在后台完成登录、配置、发现、测试、激活并打开玩家流程；控制台不得有错误。

真实 DeepSeek、MiniMax 或 GLM 调用需要用户自己的有效 API Key，不写入测试或仓库。自动化以协议兼容模拟端点证明产品链路，真实 Key 通过后台完成最后验证。

## 8. 发布与验收

部署时将 SQLite 文件放在持久卷，设置四个管理环境变量并沿用受保护发布流程。健康检查不返回供应商 Key或管理员状态。

完成标准：

- 管理员可在浏览器登录并完成配置、发现或手动模型、连接测试和激活。
- 新游戏 AI 请求在不重启后端的情况下使用激活模型。
- 后台可查看脱敏的基础用量和审计记录。
- API Key 在数据库、接口、日志、前端状态和测试输出中均不以明文出现。
- DeepSeek 模板与任意自定义兼容端点均可配置。
- 全部自动化质量门禁通过，模拟端到端通过，管理后台在浏览器中可见并可操作。
