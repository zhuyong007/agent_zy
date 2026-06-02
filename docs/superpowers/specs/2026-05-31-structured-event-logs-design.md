# 结构化事件日志设计

## 目标

为本地控制面新增可检索的结构化日志能力，串联前端关键操作、API 请求、任务执行、Agent worker 和模型调用。日志用于排查历史知识生成偶发失败，也供其他模块复用。

## 架构

- 日志独立写入 `.agent-zy-data/logs/events.jsonl`，不进入 `AppState`。
- 控制面 `event-log-service` 负责追加、脱敏、摘要截断、查询、14 天清理和清空。
- Fastify hook 自动记录业务 API 请求；orchestrator、worker pool、model runtime 记录内部关键阶段。
- 前端使用轻量 helper 上报生成、刷新、同步、重启和模型测试等关键用户动作。
- `/logs` 页面提供筛选、详情、自动刷新和二次确认清空。

## 数据结构

每条事件包含 `id`、`timestamp`、`level`、`category`、`action`、`message`，并允许附加 `taskId`、`agentId`、`requestId`、`durationMs` 和 `details`。

模型调用只保存供应商、模型、耗时、状态、字符数和截断摘要。`apiKey`、`authorization`、`token`、`secret` 等敏感字段和值统一替换为 `[redacted]`。

## 边界

- 日志写入失败不得阻断业务。
- 查询遇到损坏 JSONL 行时跳过该行并返回警告。
- `/api/logs`、`/api/stream` 和健康检查不参与 API hook 记录，避免递归和噪声。
- 清空结构化日志不删除现有 `dev-*.log`、任务记录或业务状态。

