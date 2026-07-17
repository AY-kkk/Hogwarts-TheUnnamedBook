# P0 自动化验证报告

- 执行日期：2026-07-17
- 分支：`codex/p0-launch-readiness`
- 自动化结论：Pass
- 公开上线结论：No-Go，等待本文末尾的外部门禁完成

## 可重复验证

在已安装 `backend/requirements-dev.txt` 与前端锁文件依赖的环境中，从仓库根目录运行：

```bash
npm run quality
```

本地通过证据：

| 检查 | 结果 |
|---|---|
| 后端 API、规则、安全、可观测性、配置测试 | 45 passed |
| 前端角色隔离、原子状态、年龄门槛和组件测试 | 21 passed |
| Python 编译与依赖一致性 | Pass |
| Python 已知漏洞审计 | 0 known vulnerabilities |
| ESLint 与 TypeScript/Vite 生产构建 | Pass |
| Node 全依赖审计 | 0 vulnerabilities |
| 源码与生产包高置信度密钥扫描 | Pass |
| CI、Release、Dependabot YAML 解析 | Pass |
| 受保护发布配置结构与边界 | Pass |

GitHub Actions 的 `quality` job 会在 Linux/Python 3.12 上运行同一条命令，随后 `container` job 构建非 root 后端容器。发布工作流在部署前也会重跑同一门禁，并保留前后端回滚入口。

## 已自动覆盖的关键验收

- 角色最多三个、角色级日志/世界线隔离及级联删除。
- 状态包字段、范围、原子事务、幂等、非法包保留最后合法快照。
- 九回合序章不可跳回合，周历不可出现第 5 周，12 月可跨年。
- Weekly AP 最多透支 3 点，Event Mode 冻结日历与 AP，高阶咒语门槛失败不可改判。
- 会话鉴权、限流、CORS、输入长度、内容安全、匿名举报追踪。
- Prompt/规则/状态版本加载与编排路径。
- 年龄确认、生产配置年龄范围、隐私/AI 数据门禁。

## 仍需人工或真实环境完成

| 阻塞项 | 负责人 | 截止日 | 解除证据 |
|---|---|---|---|
| 填入书面 IP 授权编号并完成法务终审 | TBD（商务/法务） | 公开发布前 | `IP_AUTHORIZATION_REFERENCE`、`LEGAL_REVIEW_REFERENCE` 与签字记录 |
| 配置生产域名、Vercel/GHCR/后端部署密钥和模型供应商密钥 | TBD（技术/运维） | 预发前 | GitHub Environment 审核与成功部署日志 |
| 指定值班人、告警接收方并执行一次回滚演练 | TBD（运营/运维） | 公开发布前 | 告警截图、演练时间和恢复版本 |
| 使用真实供应商完成 Turn 1 到 Weekly 的连续 E2E | TBD（QA） | 公开发布前 | 脱敏日志、版本元数据与测试记录 |
| 在 360/768/1440 宽度及目标浏览器执行可访问性/视觉验收 | TBD（设计/QA） | 灰度前 | 截图与缺陷清单 |

这些项目依赖真实授权编号、生产账户、密钥或人工签字，不能由仓库代码代替。任一项未完成时，`go_no_go_checklist.md` 的公开发布结论必须保持 No-Go。

## 已知非阻塞项

- FastAPI/Starlette 的同步 `TestClient` 对当前 httpx 适配层发出弃用警告；不影响运行结果，后续可迁移到异步测试客户端。
- 本地无法执行容器构建，因为当前机器未安装 Docker；同一 Dockerfile 由 GitHub Actions 的 `container` job 强制构建。
