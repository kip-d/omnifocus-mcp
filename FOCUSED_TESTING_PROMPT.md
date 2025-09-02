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

2. **Create Test Resources**:
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

---

## 📊 Test Results Template

Please report your results in this format:

### ✅ Test 1 Results: Project Update
- **Status**: [SUCCESS/FAILED]
- **Response**: [Brief description of what happened]
- **Error Details**: [If failed, include error code and message]

### ✅ Test 2 Results: Folder Deletion  
- **Status**: [SUCCESS/FAILED] 
- **Response**: [Brief description of what happened]
- **Error Details**: [If failed, include error code and message]

---

## 🎯 Success Criteria

**PASS**: Both tests complete successfully with no "Can't convert types" errors
**FAIL**: Either test returns "Can't convert types" or similar conversion errors

### Expected Behavior Changes:

1. **Project Update**: Should successfully update project with due date and notes
2. **Folder Deletion**: Should successfully delete folder and move contained projects appropriately

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