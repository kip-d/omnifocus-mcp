# Running OmniFocus MCP Evaluations

This guide explains how to run the evaluation suite for the OmniFocus MCP server using the official MCP evaluation harness.

## Quick Start

### Prerequisites
- Python 3.8+
- Anthropic API key
- OmniFocus running on your Mac
- MCP server built: `npm run build`

### Installation

```bash
# Install Python dependencies
pip install anthropic mcp

# Set your API key
export ANTHROPIC_API_KEY=your_key_here
```

### Run Evaluation

```bash
# Navigate to the OmniFocus MCP directory
cd /Users/kip/src/omnifocus-mcp

# Run the evaluation script
python3 scripts/run_evaluation.py
```

## Evaluation Questions

The evaluation suite contains 10 questions that test:

1. **Project Review Management** - Finding projects with most overdue reviews
2. **Project Inventory** - Counting empty projects
3. **Task Counting** - Querying specific project tasks
4. **Task Availability** - Filtering available tasks
5. **Workflow Constraints** - Identifying sequential projects
6. **Task Priority Analysis** - Finding flagged overdue tasks
7. **Task Distribution** - Grouping tasks by project
8. **High Priority Tasks** - Finding critical tasks
9. **Project Status** - Querying project states
10. **Project History** - Identifying oldest projects

## Expected Results

### Question-by-Question Results

| # | Question | Expected Answer | Tool(s) Used |
|---|----------|-----------------|--------------|
| 1 | Most overdue review | Westgate | projects |
| 2 | Empty projects count | 4 | projects |
| 3 | Total tasks in PPO | 44 | tasks |
| 4 | Available tasks in PPO | 41 | tasks |
| 5 | Sequential projects | Blank Order Project | projects |
| 6 | Flagged overdue tasks | 2 | tasks |
| 7 | Project with most overdue | Pending Purchase Orders | tasks, projects |
| 8 | Highest priority overdue task | Call Kurzweil support... | tasks |
| 9 | On-hold projects | 1 | projects |
| 10 | Oldest active project | Blank Order Project | projects |

## Tool Coverage

The evaluation tests these MCP tools:

- ✅ **tasks** - Query with filters, modes, project filtering
- ✅ **projects** - List, stats, filter by status
- ✅ **manage_reviews** - (optional) Review status queries
- ✅ **workflow_analysis** - (optional) Bottleneck detection

## Evaluation Success Criteria

✅ An evaluation question is **PASSED** if:
1. Claude successfully calls appropriate MCP tools
2. Claude interprets the tool responses correctly
3. Claude's answer matches the expected answer exactly
4. The answer is returned in the correct format

❌ An evaluation question is **FAILED** if:
1. Claude calls incorrect tools
2. Claude misinterprets the data returned
3. Claude's answer differs from the expected answer
4. Claude fails to call necessary tools

## Interpreting Results

### High Accuracy (90%+)
Your MCP server tools are:
- Well-documented with clear descriptions
- Returning appropriately structured data
- Easily interpretable by LLMs

### Medium Accuracy (70-89%)
Some tools may need improvements:
- Descriptions could be more detailed
- Response formats could be simplified
- Some tools returning too much data

### Low Accuracy (<70%)
Significant improvements needed:
- Review tool descriptions for clarity
- Check response schemas for consistency
- Simplify complex tool responses
- Ensure error messages are actionable

## Creating Custom Evaluations

To add your own evaluation questions:

1. Edit `evaluation.xml` and add a new `<qa_pair>`:

```xml
<qa_pair>
  <question>Your question here</question>
  <answer>Expected answer</answer>
</qa_pair>
```

2. **Interactive Update Mode**:

If your OmniFocus data has changed and the evaluation is failing, you can run the script with the `--update` flag to interactively update the ground truth in `evaluation.xml`:

```bash
python3 scripts/run_evaluation.py --update
```

The script will prompt you for each mismatch:
```text
⚠️  MISMATCH DETECTED
Expected: Old Answer
Actual:   New Answer
Update ground truth to 'New Answer'? (y/n): y
✅ Updated in memory.
```

3. **Manual Update**:

Edit `evaluation.xml` directly if you prefer.

## Troubleshooting

### Connection Errors
- Ensure OmniFocus is running
- Check that no other MCP server is using the port
- Verify the MCP server binary exists at `dist/index.js`

### Low Accuracy
- Review tool descriptions - they should explain:
  - What the tool does in plain English
  - All available parameters and their purposes
  - What the tool returns
  - Example use cases
- Simplify responses if they're too verbose
- Test individual tools manually

### Timeout Errors
- Increase the evaluation timeout
- Break complex questions into simpler ones
- Ensure the MCP server is responsive

## Advanced: Running with Different Models

```bash
# Use a specific Claude model
MODEL=claude-3-5-sonnet-20241022 python3 run_evaluation.py
```

## Evaluation Report Format

The evaluation generates a detailed report showing:

- **Summary**: Total accuracy, average response time
- **Per-Question Results**: Each question's status (✅/❌)
- **Execution Trace**: Tool calls made by Claude
- **Feedback**: Areas for improvement

## Next Steps

After running evaluations:

1. **Review failures** - Note which questions failed
2. **Analyze patterns** - Are certain tool types failing?
3. **Improve documentation** - Update unclear tool descriptions
4. **Iterate** - Fix issues and re-run evaluations
5. **Track progress** - Monitor accuracy improvements over time

---

For more information on the MCP evaluation framework, see the [MCP Builder Skill Evaluation Guide](/Users/kip/.claude/plugins/marketplaces/anthropic-agent-skills/mcp-builder/reference/evaluation.md).
