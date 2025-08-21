# Research Prompt: OmniFocus evaluateJavascript() Bridge Discovery

## Executive Summary
We discovered that `Application("OmniFocus").evaluateJavascript()` provides a critical bridge between JXA (JavaScript for Automation) and Omni Automation, enabling access to APIs like `Task.RepetitionRule` that are otherwise unavailable in JXA. This appears to be an undocumented or under-documented feature that solves a major limitation for external automation.

## The Discovery Journey

### Initial Problem
- Building an MCP server using JXA to automate OmniFocus externally
- `Task.RepetitionRule`, `Task.RepetitionMethod`, and related APIs were undefined in JXA
- Could not create recurring tasks/projects programmatically
- Spent significant time believing this was impossible

### Failed Attempts
1. Direct constructor access: `app.Task.RepetitionRule()` - undefined
2. Various property assignments - all failed
3. AppleScript bridge via `doShellScript()` - escaping nightmare
4. Assumed it was a fundamental limitation of JXA vs Omni Automation

### The Breakthrough
- Found `app.evaluateJavascript()` method that executes Omni Automation code
- This method runs JavaScript in the Omni Automation context, not JXA context
- Full access to all Omni Automation APIs including RepetitionRule
- Clean, simple syntax without escaping issues

### Working Solution
```javascript
// JXA context - create task
const task = app.Task({name: "My Task"});
doc.inboxTasks.push(task);
const taskId = task.id();

// Bridge to Omni Automation for recurrence
app.evaluateJavascript(`
  const task = Task.byIdentifier("${taskId}");
  const rule = new Task.RepetitionRule(
    "FREQ=DAILY;INTERVAL=1",
    Task.RepetitionMethod.Fixed
  );
  task.repetitionRule = rule;
`);
```

## Research Questions

### 1. Who Else Knows About This?
Search for:
- Other developers using `evaluateJavascript()` as a JXA bridge
- Blog posts, tutorials, or documentation about this technique
- GitHub repos leveraging this approach
- Forum discussions mentioning this solution

Search queries:
- `"evaluateJavascript" OmniFocus JXA bridge`
- `"app.evaluateJavascript" "Task.RepetitionRule"`
- `OmniFocus "evaluateJavascript" automation workaround`
- `site:github.com "evaluateJavascript" omnifocus`
- `site:discourse.omnigroup.com evaluateJavascript`

### 2. Is This Documented?
Check:
- Official Omni documentation for any mention of `evaluateJavascript()`
- Whether this is an intentional bridge or accidental capability
- If Omni Group considers this a supported feature
- Whether there are limitations or risks to this approach

### 3. Why Is This Necessary?
Investigate:
- Why does JXA have limited access compared to Omni Automation?
- Is this a technical limitation or design decision?
- Are there other hidden bridges or methods like this?
- What other APIs are inaccessible in JXA that could use this bridge?

### 4. Community Impact
Look for:
- How many developers have struggled with this same issue
- Time wasted reimplementing or working around this limitation
- Projects abandoned due to believing recurrence was impossible
- Alternative solutions people have built

## Call to Action for Omni Group

If research shows this is not well-known, prepare a request to Omni Group:

### Option 1: Document the Bridge
- Add `evaluateJavascript()` to official documentation
- Provide examples of bridging JXA to Omni Automation
- List which APIs require this bridge approach
- Create a migration guide for JXA developers

### Option 2: Improve JXA Support
- Expose RepetitionRule and other missing APIs directly in JXA
- Provide feature parity between JXA and Omni Automation
- Eliminate the need for the bridge workaround
- Make external automation first-class

### Option 3: Official Bridge API
- Create an official, documented bridge mechanism
- Provide TypeScript definitions for the bridge
- Ensure stability and backward compatibility
- Add better error handling and debugging

## Evidence to Gather

### Development Time Impact
- We spent ~8 hours investigating this issue
- Initially concluded it was impossible
- Almost documented it as a permanent limitation
- Only found solution through extensive research

### Community Posts to Find
- Stack Overflow questions about OmniFocus recurrence in JXA
- GitHub issues mentioning RepetitionRule undefined
- Forum posts asking about recurring task automation
- Blog posts about OmniFocus automation limitations

### Technical Details
- List all APIs that are missing in JXA but available via bridge
- Performance comparison: direct JXA vs evaluateJavascript bridge
- Security implications of using evaluateJavascript
- Version compatibility (when was this introduced?)

## Specific Searches to Run

1. **GitHub Code Search**:
   ```
   language:JavaScript "evaluateJavascript" "OmniFocus"
   language:JavaScript "Task.RepetitionRule" JXA
   path:*.js "app.evaluateJavascript" omnifocus
   ```

2. **Forum/Discussion Searches**:
   ```
   site:discourse.omnigroup.com "evaluateJavascript"
   site:stackoverflow.com OmniFocus "recurring task" JXA "not working"
   site:reddit.com/r/omnifocus automation recurrence javascript
   ```

3. **Documentation Searches**:
   ```
   site:omni-automation.com "evaluateJavascript"
   site:omnigroup.com/support "evaluateJavascript"
   site:support.omnigroup.com JXA limitations
   ```

## The Bigger Picture

This discovery raises important questions:
1. How many developers have given up on automation features thinking they were impossible?
2. What other "impossible" things are actually possible through undocumented bridges?
3. Should external automation (JXA) have first-class support equal to internal (Omni Automation)?
4. Is the separation between JXA and Omni Automation intentional or technical debt?

## Request Template for Omni Group

If research confirms this is under-documented, here's a template:

> **Subject: Request to Document or Improve JXA-to-Omni-Automation Bridge**
>
> Dear OmniGroup Team,
>
> We've discovered that `app.evaluateJavascript()` provides a crucial bridge between JXA and Omni Automation, enabling access to APIs like `Task.RepetitionRule` that are otherwise unavailable in JXA. This appears to be undocumented.
>
> **Impact**: Developers waste significant time (we spent 8+ hours) trying to create recurring tasks via JXA, often concluding it's impossible.
>
> **Request**: 
> 1. Document `evaluateJavascript()` as an official bridge mechanism
> 2. OR provide direct JXA access to all Omni Automation APIs
> 3. OR create an official bridge API with proper documentation
>
> **Evidence**: [Include research findings about community impact]
>
> This would significantly improve the developer experience for external automation tools.

## Success Metrics

The research is successful if we can answer:
- Is `evaluateJavascript()` an intentional bridge or accidental capability?
- How many other developers have discovered/used this technique?
- What is Omni Group's position on JXA vs Omni Automation parity?
- Can we get official documentation or improvement commitment?

---

**Please search comprehensively and compile evidence about community usage, documentation gaps, and developer pain points around this issue. The goal is to either find existing documentation we missed, or build a compelling case for Omni Group to improve this situation.**