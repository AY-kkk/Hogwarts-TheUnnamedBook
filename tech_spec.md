# 技术规格说明书 (Tech Spec)

| 项目名称 | 霍格沃茨：无名之书 (Hogwarts: The Unnamed Book) |
| :--- | :--- |
| **版本** | V1.0 |
| **日期** | 2026-02-16 |
| **状态** | 草案 |

## 1. 系统架构概览

本项目采用 **Local-First (本地优先)** 架构，结合 **Multi-Agent** 决策系统，打造去中心化、高隐私、强规则约束的沉浸式 AI 跑团体验。

### 1.1 技术栈选型

| 模块 | 技术栈 | 选型理由 |
| :--- | :--- | :--- |
| **前端 (FE)** | **React** + **Vite** + **Tailwind CSS** | 组件化开发，高性能构建，快速 UI 迭代。 |
| **本地存储** | **Dexie.js** (IndexedDB 封装) | 浏览器端高性能 NoSQL 数据库，支持大文本存储与快速检索，不仅限于简单的 Key-Value。 |
| **网关 (Gateway)** | **Golang** (Gin / Fiber) | 高并发、低延迟，负责鉴权、规则注入与流式转发，不存储业务数据。 |
| **AI Agent** | **Python** (LangGraph / LangChain) | 强大的 LLM 编排能力，支持多 Agent 协作（Narrator, Simulator, Critic）。 |
| **部署** | **Vercel** (FE) + **Docker** (BE/Agent) | 快速部署与弹性扩展。 |

### 1.2 数据流向 (Data Flow)

1.  **用户输入**: 前端捕获用户指令 (e.g., "对巨怪使用漂浮咒")。
2.  **上下文组装 (FE)**: 前端从 IndexedDB 读取 `Character Profile` (角色卡), `World Status` (世界状态), `Recent Logs` (最近对话)。
3.  **请求转发 (Gateway)**: 前端将组装好的 Context + User Input 发送至 Golang 网关。网关注入 `System Prompt` (核心规则 & 序章规则)。
4.  **智能决策 (Agent)**: Python Agent 接收请求：
    *   **Simulator**: 进行数值检定 (D100/属性比对)。
    *   **Narrator**: 基于检定结果生成剧情 (流式输出)。
    *   **State Manager**: 生成 `<state_update>` JSON。
5.  **流式响应**: 文本通过 SSE (Server-Sent Events) 推送回前端。
6.  **状态同步 (FE)**: 前端解析 `<state_update>`，更新 IndexedDB，触发 UI 变更 (如 HP 扣减、物品获得)。

## 2. 详细设计

### 2.1 前端设计 (Local Game Engine)

*   **本地数据库模式 (Dexie.js Schema)**
    ```javascript
    const db = new Dexie('HogwartsDB');
    db.version(1).stores({
      settings: 'key', // 存储 API Key, 模型偏好
      character: 'id', // 存储 Name, House, Status JSON (HP, MP, Gold...), Summary
      logs: '++id, turn_id, content, type', // 存储完整对话历史 (type: user/ai/system)
      world_log: '++id, event_name, timestamp' // 存储世界线变动
    });
    // 安全策略: 敏感字段 (如 gold, hp) 存储前进行 Base64 + Salt 混淆，防止控制台直接修改。
    ```

*   **数据备份与恢复 (Risk Mitigation)**
    *   **存档文件 (Save File)**:
        *   格式: `.hws` (Hogwarts Save) - **JSON + Base64**
        *   内容: 完整的 `character` + `logs` 表快照（含 `<state_update>` 标签）。
        *   用途: **恢复游戏进度**，机器可读，严禁修改。
    *   **剧情导出 (Story Export)**:
        *   格式: `.md` (Markdown) - **纯文本**
        *   内容: 仅包含 `logs.content` 中的文本部分。
        *   处理逻辑:
            1.  正则移除 `<state_update>...</state_update>`。
            2.  将 `<system_hint>...</system_hint>` (若有) 转换为 `*斜体*`。
            3.  按 `turn_id` 自动添加 `## 第X章` 标题。
        *   用途: **分享阅读**，人类可读。

*   **状态解析器 (Tag Parser)**
    *   **职责**: 监听 SSE 流，实时提取并处理 XML/JSON 标签。
    *   **核心逻辑**:
        *   正则匹配 `<state_update>{...}</state_update>`。
        *   解析 JSON 内容。
        *   原子化更新 Dexie.js 中的 `character` 表。
        *   分发事件 `EVENT_STATE_UPDATED` 通知 UI 组件重绘。

### 2.2 后端网关设计 (Rule Gateway - Golang)

*   **API 接口**: `POST /api/chat`
*   **Request Payload**:
    ```json
    {
      "user_input": "...",
      "context": {
        "summary": "...",
        "recent_logs": [...],
        "status_snapshot": {...} // 当前 HP, MP, Location 等
      },
      "api_key": "sk-..." // 用户提供的 Key (仅透传)
    }
    ```
*   **规则注入 (Middleware)**:
    *   加载 `system_core_rules.md` 和 `system_prologue_rules.md`。
    *   **Context 动态压缩**: 
        *   Recent Logs 仅保留最近 10-20 轮。
        *   早期 Log 替换为 `Summary` (由后台定期生成或前端合成)。
        *   目标: 保持 Input Token < 4k (OKR 1.2.1)。
    *   根据 `status_snapshot.game_mode` (prologue/weekly) 动态拼接 System Prompt。
    *   **示例 Prompt 结构**:
        ```text
        [Role Definition]
        You are the GM of Hogwarts Simulator...

        [Core Rules]
        {{ system_core_rules_content }}

        [Current Context]
        Summary: {{ summary }}
        Status: {{ status_json }}

        [User Input]
        {{ user_input }}
        ```

### 2.3 AI 服务设计 (Logic Core - Python)

*   **LangGraph 节点编排**:
    1.  **Node 1: Intent Analysis & Guardrail**: 
        *   识别用户意图 (行动/闲聊)。
        *   **Critic 拦截**: 检查输入是否违反跑团世界观 (e.g., "用手机", "召唤高达")。若违规，直接跳转 `Rejection Response`，不进行数值检定。
    2.  **Node 2: Simulator (数值计算)**:
        *   输入: 玩家属性 (Knowledge=15), 动作 ("使用漂浮咒")。
        *   逻辑: 查表 `T1 咒语` 门槛 -> 对比 `Knowledge` -> 投骰子 D100。
        *   输出: `Result: Failure (Backfire)`。
    3.  **Node 3: Narrator (叙事生成)**:
        *   输入: `Result`, `Context`。
        *   执行: 生成 2000字+ 沉浸式描写，包含大标题。
    4.  **Node 4: State Manager (状态封装)**:
        *   执行: 将数值变更封装为 `<state_update>` JSON。

### 2.4 数据交换格式 (Output Protocol)

*   **异常处理 (Error Recovery)**:
    *   若前端解析 `<state_update>` 失败 (JSON 格式错误)，自动触发隐式重试请求 `Retry-Correction`，要求模型仅重新输出 Tag 部分。

*   **SSE Stream**:
    ```text
    data: # 第一章：初入对角巷\n\n
    data: 鹅卵石街道在阳光下闪闪发光... (正文流式输出)
    ...
    data: <state_update>{"status": {"gold": -7}, "inventory_events": [{"op": "add", "item": "冬青木魔杖"}]}</state_update>
    event: close
    ```

## 3. 数据库设计 (MySQL - 仅用于云备份/可选)

*仅在 Phase 4 (云备份) 启用，核心游戏逻辑不依赖此数据库。*

```go
type User struct {
    ID       uint   `gorm:"primaryKey"`
    Username string `gorm:"unique;not null"`
    Password string `gorm:"not null"` // Hash
}

type CloudSave struct {
    ID            uint      `gorm:"primaryKey"`
    UserID        uint      `gorm:"index;not null"`
    CharacterName string    `gorm:"size:64"`
    SaveData      []byte    `gorm:"type:longblob"` // 压缩后的 IndexedDB 导出 JSON
    SnapshotHash  string    `gorm:"size:64"`       // 用于完整性校验
    UpdatedAt     time.Time `gorm:"autoUpdateTime"`
}
```

## 4. 开发路线图 (Roadmap)

详细的技术架构与多智能体协作流程请参考: [architecture_roadmap.md](./architecture_roadmap.md)

| 阶段 | 周期 | 核心任务 | 交付物 |
| :--- | :--- | :--- | :--- |
| **Phase 1: 本地引擎** | Day 1-3 | 前端搭建, Dexie 集成, 基础 UI (羊皮纸风格) | 可运行的纯前端 Demo (无 AI) |
| **Phase 2: 规则链路** | Day 4-6 | Go 网关搭建, Python Agent 基础逻辑, 流式通信打通 | 联调成功的 Chat 闭环 |
| **Phase 3: 游戏性打磨** | Day 7-10 | Prompt 深度调优 (2000字/大标题/规则一致性), 状态解析器完善 | Alpha 测试版本 |
| **Phase 4: 云备份** | Day 11-12 | 导出/导入功能, MySQL 备份接口 | Beta 版本 (含数据迁移) |
