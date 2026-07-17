# 公开 MVP 验收矩阵

- 基线日期：2026-07-17
- 执行负责人：TBD（QA）
- 状态枚举：Not Run / Pass / Fail / Blocked
- 证据要求：每项必须关联自动化测试、截图、日志或评审记录之一。

## A. 进入、角色与存档

| ID | 验收场景 | 预期结果 | 类型 | 负责人 | 状态 |
|---|---|---|---|---|---|
| A-001 | 首次访问并点击开始旅程 | 进入角色选择页，无控制台严重错误 | E2E | TBD | Not Run |
| A-002 | 连续创建三个不同角色 | 三个角色同时存在且均可选择 | E2E | TBD | Not Run |
| A-003 | 已有三个角色时尝试创建第四个 | 前后端均拒绝并给出明确提示 | Integration | TBD | Not Run |
| A-004 | 新建第二个角色 | 第一个角色及其日志、世界线保持不变 | E2E | TBD | Not Run |
| A-005 | 删除第二个角色 | 只删除目标角色及其关联数据 | Integration | TBD | Not Run |
| A-006 | 刷新角色选择页 | 所有角色卡和最近游玩时间正确恢复 | E2E | TBD | Not Run |
| A-007 | 从旧版数据库启动应用 | 数据成功迁移，或在不破坏旧数据的情况下阻止进入 | Migration | TBD | Not Run |
| A-008 | 两个角色分别触发世界线变动 | 世界线互不串档 | Integration | TBD | Not Run |

## B. 角色创建与初始状态

| ID | 验收场景 | 预期结果 | 类型 | 负责人 | 状态 |
|---|---|---|---|---|---|
| B-001 | 缺少必填字段提交 | 客户端阻止提交并定位到错误字段 | UI | TBD | Not Run |
| B-002 | 绕过前端提交非法字段 | 服务端返回结构化 4xx，不创建角色 | API | TBD | Not Run |
| B-003 | 创建合法角色 | 返回稳定角色 UUID，并写入统一 Schema | Integration | TBD | Not Run |
| B-004 | 检查 Turn 1 初始数值 | HP、MP、金币和基础属性符合序章规则 | Rules | TBD | Not Run |
| B-005 | 创建完成后刷新页面 | 角色和 Turn 1 内容均可恢复 | E2E | TBD | Not Run |

## C. 九回合序章

| ID | 验收场景 | 预期结果 | 类型 | 负责人 | 状态 |
|---|---|---|---|---|---|
| C-001 | 执行 Turn 1 | 只描写送信；金币为0；初始化状态合法 | E2E | TBD | Not Run |
| C-002 | 执行 Turn 2 | 只推进家庭讨论，结束时进入8月W1 | E2E | TBD | Not Run |
| C-003 | 执行 Turn 3 | 进入魔法世界并按血统发放启动资金 | E2E | TBD | Not Run |
| C-004 | 执行 Turn 4 | 扣除费用并添加魔杖/购物结果 | E2E | TBD | Not Run |
| C-005 | 执行 Turn 5 | 只执行一个假期选择并推进至8月31日 | E2E | TBD | Not Run |
| C-006 | 执行 Turn 6 | 到达车站并限制列车互动选择范围 | E2E | TBD | Not Run |
| C-007 | 执行 Turn 7 | 列车社交和消费正确影响状态 | E2E | TBD | Not Run |
| C-008 | 执行 Turn 8 | 玩家可决定学院，学院写入标准值 | E2E | TBD | Not Run |
| C-009 | 执行 Turn 9 | 完成晚宴、室友初始化并切换到weekly | E2E | TBD | Not Run |
| C-010 | 任一序章回复尝试跨越两个 Turn | 系统测试判定失败，不允许发布 | Rules | TBD | Not Run |

## D. Weekly Mode 与 Event Mode

| ID | 验收场景 | 预期结果 | 类型 | 负责人 | 状态 |
|---|---|---|---|---|---|
| D-001 | 序章结束后开始新回合 | 进入9月第1周并初始化7 AP | E2E | TBD | Not Run |
| D-002 | 选择总计不超过7 AP的行动 | 正确结算，剩余 AP 用于日常休息与社交 | Rules | TBD | Not Run |
| D-003 | 透支1–3 AP | 本周允许行动，下周最大 AP 等量下降 | Rules | TBD | Not Run |
| D-004 | 月份从第4周推进 | 进入下月第1周，不生成第5周 | Rules | TBD | Not Run |
| D-005 | 触发生命威胁事件 | 切换event，时间锁定，选项不消耗 AP | E2E | TBD | Not Run |
| D-006 | Event Mode事件结束 | 下一轮恢复weekly并继续剩余周结算 | E2E | TBD | Not Run |
| D-007 | 玩家错过原著事件 | 事件按世界线发生，玩家只获得传闻 | Rules | TBD | Not Run |
| D-008 | 玩家改变原著结果 | 变动写入当前角色世界线并影响后续 | E2E | TBD | Not Run |

## E. 状态协议与数据一致性

| ID | 验收场景 | 预期结果 | 类型 | 负责人 | 状态 |
|---|---|---|---|---|---|
| E-001 | 更新HP、MP、金币、AP和时间 | 数据库与所有可见面板一致 | Integration | TBD | Not Run |
| E-002 | 添加和移除物品 | 操作原子执行，重复事件不会生成意外副本 | Integration | TBD | Not Run |
| E-003 | 学会咒语并提升熟练度 | 咒语面板立即显示标准化数据 | Integration | TBD | Not Run |
| E-004 | 新建或更新关系 | 关系面板显示等级、标签和描述 | Integration | TBD | Not Run |
| E-005 | 完成分院 | 角色卡、主题和状态使用同一学院枚举 | Integration | TBD | Not Run |
| E-006 | 添加世界线事件 | 事件只写入当前角色且可在上下文恢复 | Integration | TBD | Not Run |
| E-007 | 收到非法JSON状态包 | 正文可保留，状态完全不变并记录错误 | Negative | TBD | Not Run |
| E-008 | 收到越界数值或未知字段 | Schema 拒绝写入，保留最后合法快照 | Negative | TBD | Not Run |
| E-009 | 同一事件重复送达 | 幂等键阻止重复状态结算 | Integration | TBD | Not Run |

## F. AI 编排与叙事

| ID | 验收场景 | 预期结果 | 类型 | 负责人 | 状态 |
|---|---|---|---|---|---|
| F-001 | 普通行动输入 | 顺序经过意图识别、规则模拟、叙事、状态管理 | Trace | TBD | Not Run |
| F-002 | 纯聊天输入 | 跳过数值模拟且不产生无依据状态变化 | Integration | TBD | Not Run |
| F-003 | 现代科技或全能型输入 | 世界观内拒绝，不改变状态 | Safety | TBD | Not Run |
| F-004 | 一年级强行使用高阶咒语 | 规则层判定失败或反噬，叙事不得改判 | Rules | TBD | Not Run |
| F-005 | 生成正常章节 | 一级标题正确显示，正文达到长度门槛 | Content | TBD | Not Run |
| F-006 | 未结识的普通NPC出现 | 正文在获知姓名前保持匿名 | Content | TBD | Not Run |
| F-007 | 回放某一回合 | 可查询所用模型、Prompt、规则和Schema版本 | Trace | TBD | Not Run |

## G. 可靠性、安全与恢复

| ID | 验收场景 | 预期结果 | 类型 | 负责人 | 状态 |
|---|---|---|---|---|---|
| G-001 | 健康检查 | 返回服务、依赖和版本状态，不泄露密钥 | API | TBD | Not Run |
| G-002 | 模型持续生成 | 客户端收到真实流式Token并保留换行 | Performance | TBD | Not Run |
| G-003 | 用户取消生成 | 上游调用终止，不结算未完成状态 | E2E | TBD | Not Run |
| G-004 | 模型超时或429 | 给出可重试提示，不重复写日志或扣费 | Resilience | TBD | Not Run |
| G-005 | 页面在生成中刷新 | 恢复至最后合法回合并说明未完成生成 | Recovery | TBD | Not Run |
| G-006 | 导出后在新浏览器导入 | 角色、有效时间线和状态一致 | Recovery | TBD | Not Run |
| G-007 | 未授权来源调用API | 被CORS、会话认证或限流策略拒绝 | Security | TBD | Not Run |
| G-008 | 客户端检查生产包 | 不包含任何模型供应商密钥 | Security | TBD | Not Run |
| G-009 | 超长输入或高频请求 | 在明确阈值处拒绝并记录指标 | Security | TBD | Not Run |

## H. 合规、设计与运营门禁

| ID | 验收场景 | 预期结果 | 类型 | 负责人 | 状态 |
|---|---|---|---|---|---|
| H-001 | 首次使用生成式AI功能 | 展示隐私告知、第三方数据说明并记录同意 | Compliance | TBD | Not Run |
| H-002 | 查看AI正文和导出故事 | 按适用要求显示AI生成标识 | Compliance | TBD | Not Run |
| H-003 | 未成年人进入 | 展示年龄提示和保护说明 | Compliance | TBD | Not Run |
| H-004 | 用户举报生成内容 | 举报可提交、跟踪和进入处置流程 | Operations | TBD | Not Run |
| H-005 | 360px、768px、1440px访问 | 核心流程无遮挡且输入可用 | Visual | TBD | Not Run |
| H-006 | 仅使用键盘操作 | 可以完成创建角色和发送行动 | Accessibility | TBD | Not Run |
| H-007 | 主分支提交 | CI自动执行构建、测试和安全检查 | CI | TBD | Not Run |
| H-008 | 生产发布失败 | 10分钟内回滚到上一稳定版本 | Drill | TBD | Not Run |
| H-009 | 错误率或成本超阈值 | 告警触达明确值班人并能定位角色/请求 | Monitoring | TBD | Not Run |

## 验收完成规则

1. P0 对应项必须全部 Pass。
2. 不允许以“人工试过一次”替代可重复的自动化证据，法律/业务评审类除外。
3. Fail 必须关联缺陷 ID、负责人和修复版本。
4. Blocked 必须写明外部依赖和解除日期。
5. 任何角色数据丢失、安全高危或未关闭合规阻塞项直接触发 No-Go。
