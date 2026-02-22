# 霍格沃茨：无名之书 - 技术架构与多智能体协作路线图

本现有技术路线图展示了系统如何通过 **Local-First** 架构与 **Multi-Agent** 协作机制，实现沉浸式的 AI 跑团体验。

## 1. 系统架构图 (System Architecture)

```mermaid
graph TD
    %% Define Styles
    classDef client fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef gateway fill:#fff9c4,stroke:#fbc02d,stroke-width:2px;
    classDef agent fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    classDef storage fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;

    subgraph Client_Side [客户端 (Browser/React)]
        User((玩家 User))
        UI[游戏界面 UI]
        LocalDB[(Dexie.js\n本地数据库)]
        ContextAssembler[上下文组装器]
        TagParser[状态解析器\nTag Parser]
    end

    subgraph Gateway_Layer [网关层 (Golang)]
        APIGateway[API Gateway\n(Gin/Fiber)]
        RuleInjector[规则注入器\nRule Injector]
        PromptBuilder[动态 Prompt 构建]
    end

    subgraph Intelligent_Layer [智能层 (Python/LangGraph)]
        Supervisor{任务分发\nSupervisor}
        
        subgraph Agents [Agent Swarm]
            IntentAgent[意图识别\nIntent Analysis]
            SimulatorAgent[数值模拟器\nSimulator (D100/Rules)]
            NarratorAgent[叙事者\nNarrator (Story Generation)]
            StateManager[状态管理器\nState Manager]
        end
    end

    %% Data Flow - Request
    User -->|输入指令| UI
    UI -->|触发| ContextAssembler
    LocalDB -->|读取角色/剧情/世界状态| ContextAssembler
    ContextAssembler -->|完整 Context + Input| APIGateway
    
    APIGateway -->|鉴权 & 转发| RuleInjector
    RuleInjector -->|加载 Core/Prologue Rules| PromptBuilder
    PromptBuilder -->|构建 System Prompt| Supervisor

    %% Agent Collaboration Flow
    Supervisor -->|1. 分析意图| IntentAgent
    IntentAgent -->|2. 动作判定请求| SimulatorAgent
    SimulatorAgent -->|3. 检定结果 (成功/失败/反噬)| NarratorAgent
    NarratorAgent -->|4. 生成剧情 (2000字)| StateManager
    StateManager -->|5. 封装状态变更| Supervisor

    %% Data Flow - Response
    Supervisor -->|流式 SSE (Text + Tags)| APIGateway
    APIGateway -->|SSE Stream| TagParser
    TagParser -->|解析 <state_update>| LocalDB
    TagParser -->|实时文本渲染| UI
    LocalDB -->|更新状态| UI

    %% Styling
    class User,UI,ContextAssembler,TagParser client;
    class APIGateway,RuleInjector,PromptBuilder gateway;
    class Supervisor,IntentAgent,SimulatorAgent,NarratorAgent,StateManager agent;
    class LocalDB storage;
```

## 2. 多智能体协作流程详解 (Multi-Agent Collaboration Flow)

### 阶段 1: 意图识别 (Intent Analysis)
*   **输入**: 用户输入的自然语言指令（如 "我要对巨怪使用漂浮咒"）。
*   **处理**: `IntentAgent` 分析用户意图是 "剧情行动"、"系统指令" 还是 "闲聊"。
*   **输出**: 结构化意图对象 (Action Type: Spell_Cast, Target: Troll)。

### 阶段 2: 数值模拟 (Simulation)
*   **输入**: 意图对象 + 当前角色属性 (Knowledge=15) + 核心规则 (`system_core_rules.md`)。
*   **处理**: `SimulatorAgent` 执行 D20/D100 检定。
    *   检查法术等级限制。
    *   投掷骰子 (Roll Dice)。
    *   判定结果 (Success/Failure/Critical Failure)。
*   **输出**: 模拟结果 (Result: Failure, Reason: Rolled 95 > Skill 80)。

### 阶段 3: 叙事生成 (Narration)
*   **输入**: 模拟结果 + 上下文历史。
*   **处理**: `NarratorAgent` 负责根据结果编写剧情。
    *   **要求**: 必须输出 2000 字以上。
    *   **结构**: 场景铺陈 -> 核心冲突 -> 判定过程描述 -> 结果反馈 -> 悬念收束。
*   **输出**: 纯文本剧情流。

### 阶段 4: 状态封装 (State Management)
*   **输入**: 剧情中发生的数值变动 (HP-10, Gold-5)。
*   **处理**: `StateManager` 将变动封装为标准 JSON 格式。
*   **输出**: `<state_update>{"hp": -10, "gold": -5}</state_update>`。

## 3. 技术栈图谱

*   **前端**: React, TypeScript, Tailwind CSS, Dexie.js (IndexedDB)
*   **后端网关**: Golang (Gin), Server-Sent Events (SSE)
*   **AI 编排**: Python, LangGraph, LangChain
*   **大模型**: Claude 3.5 Sonnet / GPT-4o (作为底层推理引擎)

---
*Generated for Hogwarts Simulator Project*
