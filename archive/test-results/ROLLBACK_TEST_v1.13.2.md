# OmniFocus MCP v1.13.2 - Complete Rollback Test

## 🚨 Emergency Rollback to Stable Performance

After the hybrid architecture experiment failed catastrophically, v1.13.2 completely reverts to the proven v1.12.0 implementation.

## Setup Instructions

1. **Update to v1.13.2**:
   ```bash
   cd ~/src/omnifocus-mcp
   git pull
   npm install
   npm run build
   ```

2. **Restart Claude Desktop** completely (quit and reopen)

3. **Verify version**: Confirm you're on 1.13.2

## 🎯 Performance Validation Tests

Please run these tests to confirm we're back to acceptable performance levels:

### Test 1: Basic List Operations
```
Use list_tasks with completed=false, limit=50

Expected: <2 seconds (was 5.5s in v1.13.1)
```

### Test 2: Search Performance  
```
Use list_tasks with search="review", limit=50

Expected: 3-5 seconds (was 7.8s in v1.13.0, 2.5s in v1.13.1)
```

### Test 3: Upcoming Tasks
```
Use query_tasks_by_date with queryType="upcoming", days=7, limit=50

Expected: 3-5 seconds (was 22s in v1.13.0, 4.2s in v1.13.1)
```

### Test 4: Overdue Tasks
```
Use query_tasks_by_date with queryType="overdue", limit=100

Expected: 2-4 seconds (was 3.4s in v1.13.0, 7.2s in v1.13.1)
```

### Test 5: Today's Agenda
```
Use todays_agenda with default settings

Expected: <2 seconds
```

### Test 6: Export Tasks
```
Use export_tasks with format="json", filter={completed: false}, limit=100

Expected: 3-5 seconds
```

## 📊 Results Template

```markdown
## v1.13.2 Rollback Test Results

### Environment
- OmniFocus database size: ~X tasks
- Testing date: 2025-08-11

### Performance After Rollback

| Test | v1.13.1 Time | v1.13.2 Time | Acceptable? |
|------|--------------|--------------|-------------|
| Basic List | 5,547ms | XXXms | Yes/No |
| Search | 2,540ms | XXXms | Yes/No |
| Upcoming Tasks | 4,213ms | XXXms | Yes/No |
| Overdue Tasks | 7,178ms | XXXms | Yes/No |
| Today's Agenda | XXXms | XXXms | Yes/No |
| Export | XXXms | XXXms | Yes/No |

### Stability Check
- [ ] No timeout errors
- [ ] All operations complete successfully
- [ ] Performance is predictable and consistent
- [ ] Response times are acceptable for daily use

### Overall Assessment
[Is v1.13.2 stable and usable?]
```

## 🔄 What Changed

### v1.13.2 Changes
- **Complete reversion** to v1.12.0 implementation
- **All hybrid code removed** - back to pure JXA
- **No more experiments** - proven, stable code only

### Why The Hybrid Failed
1. The `evaluateJavascript()` bridge added overhead without benefit
2. Omni Automation API couldn't efficiently pre-filter large datasets
3. JXA's `whose()` method, despite limitations, is still more efficient
4. The hybrid approach was iterating ALL tasks before filtering

## 📈 Expected Performance

You should see performance similar to v1.12.0:
- **List operations**: 1-3 seconds
- **Search**: 3-5 seconds (depends on database size)
- **Date queries**: 2-5 seconds
- **Exports**: 3-6 seconds

This is acceptable performance that has been proven stable over months of use.

## 🎯 Success Criteria

v1.13.2 is successful if:
1. No operations take >10 seconds
2. Most operations complete in 2-5 seconds
3. No timeout errors occur
4. Performance is consistent across multiple runs

## Thank You

Thank you for your patience through this performance regression saga. Your detailed testing has been invaluable. This rollback prioritizes stability and usability over experimental optimizations.

The lesson learned: Sometimes the old, proven approach is better than clever optimizations that don't work in practice. 🔧