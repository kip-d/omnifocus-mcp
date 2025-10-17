# OmniFocus MCP Evaluation Suite

Welcome to the comprehensive evaluation suite for the OmniFocus MCP server. This directory contains everything needed to test and verify that your MCP implementation enables LLMs to effectively accomplish real-world OmniFocus workflows.

## 📋 What's Included

### Documentation Files
- **[EVALUATION_STRATEGY.md](EVALUATION_STRATEGY.md)** - Planning, approach, and methodology
- **[RUNNING_EVALUATIONS.md](RUNNING_EVALUATIONS.md)** - Step-by-step guide to running tests
- **[EVALUATION_SUMMARY.md](EVALUATION_SUMMARY.md)** - Detailed breakdown of all 10 questions
- **[README.md](README.md)** - This file

### Evaluation Data
- **[evaluation.xml](../../../evaluation.xml)** - The actual 10 Q&A pairs (root directory)

## 🎯 Quick Start

### 1. Build Your MCP Server
```bash
npm run build
```

### 2. Verify Evaluation File
```bash
# Check that evaluation.xml exists and is valid
cat evaluation.xml
```

### 3. Run a Simple Test
```bash
# Test that your MCP server responds to tool calls
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"projects","arguments":{"operation":"list","limit":"1"}}}' | node dist/index.js
```

### 4. Run Full Evaluation (with Claude)
```bash
export ANTHROPIC_API_KEY=your_key_here

# Install dependencies
pip install anthropic mcp

# Create and run evaluation (see RUNNING_EVALUATIONS.md for details)
python3 << 'EOF'
# ... evaluation harness code ...
EOF
```

## 📊 The 10 Evaluation Questions

| # | Category | Question | Difficulty |
|---|----------|----------|-----------|
| 1 | Project Management | Most overdue review | ⭐⭐ |
| 2 | Project Inventory | Empty projects count | ⭐⭐ |
| 3 | Task Counting | Total tasks in project | ⭐ |
| 4 | Task State | Available tasks count | ⭐⭐ |
| 5 | Workflow Analysis | Sequential projects | ⭐⭐ |
| 6 | Priority Analysis | Flagged overdue count | ⭐⭐ |
| 7 | Aggregation | Project with most overdue | ⭐⭐⭐ |
| 8 | Multi-Filter | Highest priority overdue | ⭐⭐⭐ |
| 9 | Status Filtering | On-hold projects | ⭐ |
| 10 | Historical Analysis | Oldest active project | ⭐⭐⭐ |

**Average Difficulty**: ⭐⭐ (Medium)

## 🔍 What Gets Tested

### Tool Capabilities
- ✅ **tasks** tool - Querying, filtering, counting tasks
- ✅ **projects** tool - Project inventory, status, properties
- ✅ **Data interpretation** - Parsing complex responses
- ✅ **Aggregation** - Grouping and analysis
- ✅ **Synthesis** - Combining multiple queries

### LLM Capabilities
- ✅ Can call appropriate tools for questions
- ✅ Correctly interprets tool responses
- ✅ Handles filtering and pagination
- ✅ Performs data aggregation
- ✅ Answers with exact, verifiable results

## 📈 Expected Results

### Baseline Performance
- **Simple queries** (Q1-Q5, Q9): 90%+ accuracy
- **Complex queries** (Q7-Q8, Q10): 70-85% accuracy
- **Overall**: Should exceed 80% accuracy

### What Success Looks Like
- Claude calls the right tools with correct parameters
- Claude correctly interprets JSON responses
- Claude applies filters and aggregations properly
- Claude's final answer matches expected value exactly

### Common Issues
- ❌ Wrong tool selection
- ❌ Incorrect parameter values
- ❌ Misunderstanding data structure
- ❌ Calculation errors
- ❌ Format mismatches (names vs IDs)

## 📚 File Structure

```
omnifocus-mcp/
├── evaluation.xml                    # 10 Q&A pairs (root)
├── dist/index.js                     # Built MCP server
└── docs/evaluation/
    ├── README.md                     # This file
    ├── EVALUATION_STRATEGY.md        # Planning
    ├── RUNNING_EVALUATIONS.md        # How-to guide
    └── EVALUATION_SUMMARY.md         # Detailed breakdown
```

## 🛠️ Troubleshooting

### "Connection refused" error
- Ensure MCP server built: `npm run build`
- Check OmniFocus is running
- Verify no port conflicts

### "No such file" evaluation.xml
- Confirm you're in the omnifocus-mcp directory
- File should be at: `./evaluation.xml`

### Low accuracy (<70%)
- Review tool descriptions in your MCP implementation
- Check response schemas are clear and consistent
- Simplify verbose responses
- Test individual tools manually

### Timeout errors
- Increase evaluation timeout (default 60s)
- Break complex questions into simpler ones
- Optimize MCP tool performance

## 🚀 Next Steps

1. **Run baseline evaluation** to get current accuracy
2. **Review failures** - which questions failed?
3. **Identify patterns** - tool types or scenarios causing issues
4. **Improve documentation** - update unclear tool descriptions
5. **Iterate** - fix issues and re-run tests
6. **Track metrics** - monitor improvements over time

## 📖 Additional Resources

- **[MCP Builder Skill](https://example.com)** - Framework and best practices
- **[RUNNING_EVALUATIONS.md](RUNNING_EVALUATIONS.md)** - Detailed execution guide
- **[evaluation.xml](../../../evaluation.xml)** - The actual questions and answers
- **OmniFocus API Docs** - For understanding tool responses

## 💡 Pro Tips

### Custom Questions
Add your own questions to `evaluation.xml`:
```xml
<qa_pair>
  <question>Your question here</question>
  <answer>Expected answer</answer>
</qa_pair>
```

### Manual Testing
Test specific tools without running full evaluation:
```bash
# Test projects tool
echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"projects",...}}' | node dist/index.js

# Test tasks tool
echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tasks",...}}' | node dist/index.js
```

### Benchmarking
Compare performance across different model versions:
```bash
# Test with different Claude models
MODEL=claude-3-opus python3 run_evaluation.py
MODEL=claude-3-sonnet python3 run_evaluation.py
MODEL=claude-3-haiku python3 run_evaluation.py
```

## 📞 Questions?

Refer to:
1. [RUNNING_EVALUATIONS.md](RUNNING_EVALUATIONS.md) for execution details
2. [EVALUATION_SUMMARY.md](EVALUATION_SUMMARY.md) for question breakdown
3. [EVALUATION_STRATEGY.md](EVALUATION_STRATEGY.md) for methodology
4. Your MCP tool documentation for implementation details

---

**Last Updated**: October 2025
**Status**: ✅ Ready for Production
**Framework**: MCP v2025-06-18
