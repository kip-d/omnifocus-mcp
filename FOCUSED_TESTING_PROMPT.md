# 🎯 Focused Testing: Project Update & Folder Deletion Fixes

**Purpose**: Verify that the "Can't convert types" errors in project updates and folder deletions have been resolved.

**Target**: Claude Desktop with OmniFocus MCP integration

---

## 🔧 Pre-Test Setup

First, confirm MCP connection and create test resources:

1. **Verify MCP Connection**:
   ```
   Use the system tool with operation "version" to confirm OmniFocus MCP is working
   ```

2. **Run Diagnostics** (if any tests fail):
   ```
   Use the system tool with operation "diagnostics" to check OmniFocus connectivity
   ```

3. **Create Test Resources**:
   ```
   Create a test folder called "Fix Verification Test Folder"
   Create a test project called "Fix Verification Test Project" in that folder
   ```

---

## 🧪 Test 1: Project Update Fix Verification

**Issue Fixed**: Project update with due date and notes was failing with "Can't convert types"

**Test Steps**:

1. **List projects** to find your test project ID:
   ```
   Use projects tool with operation="list", limit="10", details="false"
   Look for "Fix Verification Test Project" and note its ID
   ```

2. **Test the EXACT failing scenario**:
   ```
   Use projects tool with:
   - operation: "update"  
   - projectId: [the ID from step 1]
   - note: "Updated project with due date for testing"
   - dueDate: "2025-09-30 17:00"
   - limit: "10"
   - details: "false"
   ```

**Expected Result**: ✅ Success response with project updated
**Previous Error**: ❌ "Can't convert types" error

**CRITICAL - If Test Fails**: Include the COMPLETE RAW JSON DATA:
- **Full Request**: Copy/paste the complete JSON request sent to the MCP server
- **Full Response**: Copy/paste the complete JSON response received (not paraphrased!)
- **OmniFocus Check**: Go to OmniFocus and verify - was the project actually updated or not?
  - Check if the note changed to "Updated project with due date for testing"
  - Check if the due date changed to September 30, 2025 at 5:00 PM
  - Report what you actually see in OmniFocus vs what the MCP response said

---

## 🧪 Test 2: Folder Deletion Fix Verification  

**Issue Fixed**: Folder deletion was failing with "Can't convert types"

**Test Steps**:

1. **List folders** to find your test folder ID:
   ```
   Use folders tool with operation="list"
   Look for "Fix Verification Test Folder" and note its ID
   ```

2. **Test the EXACT failing scenario**:
   ```
   Use folders tool with:
   - operation: "delete"
   - folderId: [the ID from step 1]
   ```

**Expected Result**: ✅ Success response with folder deleted (project moves to root/inbox)
**Previous Error**: ❌ "Can't convert types" error with DELETE_FAILED code

**CRITICAL - If Test Fails**: Include the COMPLETE RAW JSON DATA:
- **Full Request**: Copy/paste the complete JSON request sent to the MCP server  
- **Full Response**: Copy/paste the complete JSON response received (not paraphrased!)
- **OmniFocus Check**: Go to OmniFocus and verify - was the folder actually deleted or not?
  - Check if "Fix Verification Test Folder" still exists in your folder list
  - Check if "Fix Verification Test Project" moved to a different location
  - Report what you actually see in OmniFocus vs what the MCP response said

---

## 📊 Test Results Template

**IMPORTANT**: Include COMPLETE RAW DATA, not summaries or paraphrases!

### ✅ Test 1 Results: Project Update
- **Status**: [SUCCESS/FAILED]
- **Raw Request JSON**: 
  ```json
  [Paste the complete request JSON here]
  ```
- **Raw Response JSON**: 
  ```json
  [Paste the complete response JSON here]
  ```
- **OmniFocus Verification**: 
  - Project note actually changed to "Updated project with due date for testing"? [YES/NO]
  - Project due date actually set to Sept 30, 2025 5:00 PM? [YES/NO]
  - What the MCP response claimed vs what actually happened: [Describe any discrepancies]

### ✅ Test 2 Results: Folder Deletion  
- **Status**: [SUCCESS/FAILED] 
- **Raw Request JSON**: 
  ```json
  [Paste the complete request JSON here]
  ```
- **Raw Response JSON**: 
  ```json
  [Paste the complete response JSON here]
  ```
- **OmniFocus Verification**: 
  - "Fix Verification Test Folder" actually deleted from OmniFocus? [YES/NO]
  - "Fix Verification Test Project" moved to root/inbox? [YES/NO]
  - What the MCP response claimed vs what actually happened: [Describe any discrepancies]

---

## 🎯 Success Criteria

**PASS**: Both tests complete successfully with no "Can't convert types" errors
**FAIL**: Either test returns "Can't convert types" or similar conversion errors

### Key Diagnostic Questions:

1. **Are the MCP requests reaching the server?** (Check if you see "Executing tool: projects" in logs)
2. **Are the operations actually working in OmniFocus despite error messages?** (Check the database directly)
3. **What are the complete JSON responses?** (Raw data helps identify if it's response format vs actual failure)

### Expected Behavior Changes:

1. **Project Update**: Should successfully update project with due date and notes
2. **Folder Deletion**: Should successfully delete folder and move contained projects appropriately

---

## 🚨 Critical Debug Information Needed

If tests fail, we need to distinguish between:

- **False negative**: Operation succeeds in OmniFocus but MCP reports error
- **True failure**: Operation fails and MCP correctly reports error  
- **Response formatting issue**: Operation succeeds but response format is wrong

**The raw JSON responses will tell us exactly what's happening!**

---

## 🔍 Additional Validation (Optional)

If both core tests pass, you can also verify:

1. **Verify Project Changes**:
   ```
   Use projects tool with operation="list" to confirm the test project has the updated due date and note
   ```

2. **Verify Folder Deletion**:
   ```
   Use projects tool with operation="list" to confirm the test project is no longer in a folder (should show as root-level or inbox)
   ```

---

## 📝 Quick Test Summary

This focused test specifically validates the two "Can't convert types" fixes:
- ✅ Project update with due dates (removed problematic ISO date conversion)  
- ✅ Folder deletion operations (removed problematic `whose()` method usage)

**Time Required**: ~2-3 minutes  
**Tools Tested**: `projects` and `folders`  
**Target**: Resolve the 2 failing operations from the comprehensive test suite