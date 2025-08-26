# OmniFocus MCP Server – Whole-Database Pattern Analysis Blueprint

This document outlines how to enable an LLM to analyze patterns across an entire OmniFocus database without exceeding context limits.

---

## Goal
Allow the LLM to **find patterns across all projects and tasks** while keeping context usage efficient.

---

## High-Level Approach
1. **Normalize & slim the data** (fast local pass).  
2. **Compute durable signals offline** (counts, graphs, embeddings).  
3. **Build hierarchical summaries** (map → reduce → reduce).  
4. **Use retrieval + hydration** for drill-downs.  
5. **Stream "shards" through the model** for global scans when needed.  

---

## 1) Data Model & Slimming (Local)
Create a compact JSON row per task:

```json
{
  "id": "of:task/…",
  "project": "…",
  "tags": ["…","…"],
  "status": "available|blocked|waiting|done|dropped",
  "dates": { "added":"YYYY-MM-DD", "defer":"…", "due":"…", "completed":"…" },
  "est": 15,
  "prio": "low|med|high",
  "note_head": "first 160 chars",
  "note_keys": ["key","phrases"],
  "links": ["omnifocus:///task/…"]
}
```

Target size: ≤ 60–80 tokens per task.
- 3,000 tasks → ~180k–240k tokens.
- Fits into shards but not a single pass.

---

## 2) Durable Signals (Precomputed Locally)

Compute once and store:
- Task frequencies per tag, project, status, week.
- Aging of projects/tasks.
- Tag/project co-occurrence graphs.
- Cycle times (added → completed).
- Burndown/throughput trends.
- Embeddings of short task text for similarity search.
- Anomaly baselines (e.g., oversized projects, overdue clusters).

Store in SQLite or DuckDB, with optional FAISS/sqlite-vss for vectors.

---

## 3) Hierarchical Summarization (Map-Reduce)
- **Map** (per project): summarize tasks → project_summ.md.
- **Reduce** (per area): synthesize area insights from project summaries.
- **Global reduce**: combine area summaries + durable signals → portfolio patterns.

Keeps each step under 10–20k tokens.

---

## 4) Retrieval + Hydration (MCP Endpoints)

Proposed endpoints:
- `of.index.scan` → slimmed rows (paginated).
- `of.index.signals` → durable signals.
- `of.summarize.project[{id}]` → cached project summary.
- `of.summarize.area[{id}]` → area summary.
- `of.summarize.global` → global synthesis.
- `of.hydrate.task[{id}]` → full task details.
- `of.search.query{q, filters}` → hybrid keyword/vector search.

---

## 5) Sharded Global Scans
- Partition tasks into shards of ~2–5k tokens.
- Analyze each shard with a rubric (duplicates, stale items, dependencies, due dates).
- Reduce shard outputs → global findings.

---

## 6) Pattern Recipes
- **Duplicate/overlap detection**.
- **Dormant projects**.
- **Tag audits** (entropy, synonyms, unused).
- **Deadline health** (overdue %, due-date bunching).
- **Waiting-For drag analysis**.
- **Estimation bias**.
- **Next-actions clarity**.
- **Review cadence gaps**.

---

## 7) Token Budgeting (Rule-of-Thumb)
- Per task (slim): 60–80 tokens.
- 3,000 tasks: 180k–240k tokens (shard required).
- Project pass: 6k–24k tokens.
- Area reduce: 3k–12k tokens.
- Global reduce: 5k–20k tokens.

---

## 8) UX Ideas
- Health dashboard from signals + summaries.
- Drill-down chips that trigger hydration.
- One-click refactor suggestions (merge/split projects, tag cleanup).
- What-if prompts (e.g., WIP limits).

---

## 9) Privacy & Safety
- Redact PII before embedding.
- Keep embeddings local.
- Scope analyses to work/personal subsets as needed.

---

## 10) Minimal Viable Build Order
1. Export → slim rows → store in SQLite.
2. Compute signals + TF-IDF keyphrases.
3. Implement project summarization (map).
4. Area + global reduce passes.
5. Add hydration & vector search.
6. Add sharded global scans for heavy audits.

---

## Implementation Status

### Phase 1: Basic Pattern Detection (v2.1)
- [ ] Slimmed data export format
- [ ] Duplicate/overlap detection
- [ ] Dormant project identification
- [ ] Tag audit patterns
- [ ] Basic signals computation

### Phase 2: Hierarchical Analysis (v2.2)
- [ ] Project-level summarization
- [ ] Area-level rollups
- [ ] Global pattern synthesis
- [ ] Caching layer for summaries

### Phase 3: Advanced Analytics (v3.0)
- [ ] SQLite/DuckDB storage
- [ ] Embedding generation
- [ ] Vector similarity search
- [ ] Sharded global scans
- [ ] Interactive drill-down API