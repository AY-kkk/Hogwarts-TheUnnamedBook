# AI disclosure, age gate and content safety baseline

## User controls

- Before entering the AI flow, users confirm the configured minimum age or guardian awareness/consent.
- Privacy/model-transfer consent remains a separate required decision.
- Every AI narrative is labelled `AI 生成内容` in the active story and archive.
- Local JSON exports include an explicit generated-content notice and retain `type=ai` on generated logs.
- Each saved AI response has a report action. Reports send character/log/request references, category and an optional user-written note; the story body is not automatically uploaded.

## Safety layers

1. Server-side input checks run before budget reservation and model invocation.
2. Prompt-injection attempts, sensitive identifiers, actionable self-harm/high-risk weapon instructions and sexual content involving minors are rejected with a user-facing explanation.
3. Generated output receives the same high-severity check before streaming. Blocked output is replaced by a safe notice and cannot carry a state update.
4. React renders story content as text nodes rather than raw HTML. Active script markers are blocked as an additional defence.
5. Safety blocks and reports emit category-only metrics/logs; story bodies and user inputs are excluded.

The keyword layer is a deterministic P0 backstop, not a complete moderation classifier. Before public production, the named safety owner must test Chinese/English evasion cases, configure the provider's moderation controls where available, review false-positive rates and approve the minimum-age threshold for every launch region.

## Report operations

`POST /api/report` returns a unique tracking ID with HTTP 202. Production log routing must send `content_report_submitted` events into the case queue.

| Severity | Example | Initial response target | Action |
|---|---|---:|---|
| Critical | Sexual content involving minors, credible imminent harm | 1 hour | Restrict content/session, preserve references, escalate safety/legal |
| High | Personal data exposure, actionable harm instructions | 4 hours | Remove/restrict, investigate request and model path |
| Standard | Offensive, inaccurate or IP-scope concern | 2 business days | Review, classify, respond and feed QA cases |

Every case records report ID, request ID, disposition, reviewer and closure time. Appeal and user-response channels use the published privacy/contact endpoint until a dedicated support portal exists.
