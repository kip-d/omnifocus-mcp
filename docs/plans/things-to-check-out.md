# Things to Check Out

> **Note:** Completed investigations archived to `.archive/completed-investigations-2025-12.md`

---

## 10. Pending Utility Integration (2025-12-10)

Remaining items from merged utility PRs.

### 10.1: Branded Types Extension

**Status:** Integrated in `ManageTaskTool.ts`. Extend to other tools only if ID mixup bugs occur.

**Open question:** Current validation accepts 8-50 char IDs. OmniFocus IDs are typically 11 chars. May need adjustment.

### 10.2: withRetry Function

**Location:** `src/utils/error-recovery.ts`

**Status:** Function exists but not wired into any tool. Integrate if transient errors become common.

```typescript
// Available but unused
import { withRetry } from './utils/error-recovery.js';
await withRetry(() => someOperation(), { maxRetries: 3 });
```
