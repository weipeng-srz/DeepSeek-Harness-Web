# DSH Chat v5 产品文档索引

> 版本：5.0.0 · 日期：2026-10-22  
> 过程：5 轮 ×（20 位体验官 × 50 条）→ 收敛 → PRD → 研发 → QA → PM 验收。

## 先读

1. [`final-report.md`](final-report.md) — 一页结论、五轮主线、指标、最终评分、已知限制。
2. [`release-notes.md`](release-notes.md) — 发布内容、升级步骤、兼容性。
3. [`ROLLBACK.md`](ROLLBACK.md) — 回滚与数据恢复。
4. 各轮过程：
   - [`round-1/`](round-1/PRD.md)：项目空间、权限信任、富内容、可达性。
   - [`round-2/`](round-2/PRD.md)：只读分享、导出、项目文件、记忆隔离、审计。
   - [`round-3/`](round-3/PRD.md)：回答重写/编辑/版本、分享选段与口令、回收站。
   - [`round-4/`](round-4/PRD.md)：项目归档、早期编辑分支、迁移保真、长期使用加固。
   - [`round-5/`](round-5/PRD.md)：大对话分页、项目回收站、分享边界、发布收口。

## 评审方法（诚实说明）

- 20 位“体验官”是 **AI 角色化评审**（persona-grounded heuristic evaluation），不是真人访谈；
  每轮 1000 条意见用于发现缺口、比较趋势，不构成统计显著的人类研究。
- 原始意见：`reports/v5/round-N/panel/*.json`；收敛：`reports/v5/round-N/consolidation.md`。
- 每轮校验：20/20 人、1000/1000 条、0 结构问题（`tools/review/consolidate.mjs --strict`）。
- 所有 P0/P1 进入 PRD 前按当前代码复核；不是每条意见都被实现，未实现项明确列入“已知限制”。

## 复跑

```bash
cd ~/Code/DS/dsh-chat
node tools/qa/run-all.mjs          # 全部套件
node tools/qa/run-all.mjs --quick   # 跳过最慢的 share/trash/baseline
node tools/review/consolidate.mjs round-5 --strict
```

## 目录

```
reports/v5/
├── baseline/        # 初始 UI/接口基线
├── round-1..5/
│   ├── panel/       # 20×50 原始意见
│   ├── consolidated.json
│   ├── consolidation.md
│   └── *-qa.json    # 各轮自动化证据
docs/product/v5/
├── round-1..5/      # PRD / QA / 验收
├── final-report.md
├── release-notes.md
└── ROLLBACK.md
```
