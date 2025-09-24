# 🗣️ OmniFocus MCP - Natural Conversation Testing Guide

**Purpose**: Test the OmniFocus MCP server through natural language conversation, just like a real user would interact with their AI assistant.

**For**: Claude Desktop, ChatGPT, or any AI assistant with OmniFocus MCP integration.

**Version**: 1.0 - Natural language focused, user-friendly testing approach.

---

## 🎯 **The Goal: Talk Naturally About Your Tasks**

This MCP server lets you have normal conversations about your OmniFocus tasks and projects. **No technical knowledge required!** Just talk to your AI assistant like you would to a helpful colleague who has access to your task list.

---

## 🧹 **Important: Use Test Data with Cleanup Tag**

To keep your real OmniFocus data safe during testing, we'll create test items with a special tag that makes cleanup easy.

**Before you start, tell your assistant:**
> "Please create a unique test tag for our session using today's date and time, like @mcp-test-2024-09-24-1500. Apply this tag to everything we create so we can clean it up later."

**After testing, simply say:**
> "Please find and delete all items with our test tag to clean up."

---

## 💬 **Natural Conversation Test Scenarios**

### **Scenario 1: Getting Started**
Just start with basic questions about your tasks:

- *"What tasks do I have for today?"*
- *"Show me what's overdue"*
- *"How many projects do I have active right now?"*
- *"What are my flagged tasks?"*

**Expected**: Your assistant should easily show you tasks, with details about due dates, projects, and priorities.

---

### **Scenario 2: Creating and Managing Tasks**
Try creating tasks in natural ways:

- *"Add a task called 'Test OmniFocus integration' and make it flagged"*
- *"Create a task 'Buy groceries' due tomorrow at 5 PM"*
- *"I need a task for 'Review quarterly reports' that's due next Friday and should be deferred until Monday"*
- *"Make a task called 'Call dentist' and tag it with @errands and @phone"*

Then try updating them:

- *"Mark 'Buy groceries' as complete"*
- *"Change the due date of 'Review quarterly reports' to next Wednesday"*
- *"Add a note to 'Call dentist' saying 'Ask about teeth whitening options'"*

**Expected**: Tasks should be created and updated as requested, with proper dates, tags, and properties.

---

### **Scenario 3: Project Management**
Test project creation and organization:

- *"Create a new project called 'Plan Summer Vacation' in my Personal folder"*
- *"Add some tasks to the vacation project: 'Research destinations', 'Book flights', 'Reserve hotel'"*
- *"Make the vacation project tasks sequential so they need to be done in order"*
- *"Show me all my active projects and how many tasks each one has"*

**Expected**: Projects should be created with tasks, and you should be able to see project structures and task counts.

---

### **Scenario 4: Smart Filtering and Search**
Test the assistant's ability to help you find things:

- *"Find all tasks that mention 'meeting' in the name or notes"*
- *"Show me tasks tagged with @work that are due this week"*
- *"What tasks do I have in my 'Work Projects' folder that aren't completed?"*
- *"Which of my projects need review?"*

**Expected**: Assistant should find relevant tasks based on your criteria and explain what it found.

---

### **Scenario 5: Time Management**
Test date and scheduling features:

- *"What's coming up in the next week?"*
- *"Show me everything that's overdue and help me prioritize it"*
- *"I need to defer all my @home tasks until this weekend"*
- *"Create a recurring task for 'Weekly team meeting' every Tuesday at 10 AM"*

**Expected**: Assistant should handle dates intelligently and help you manage your schedule.

---

### **Scenario 6: Productivity Insights**
Test analytical capabilities:

- *"How am I doing with completing tasks this month?"*
- *"What patterns do you see in my overdue tasks?"*
- *"Which projects have the most blocked tasks?"*
- *"Give me insights about my productivity trends"*

**Expected**: Assistant should provide useful analysis and insights about your task management patterns.

---

### **Scenario 7: Bulk Operations**
Test handling multiple tasks:

- *"I need to tag all tasks in my 'Work Projects' folder with @quarterly-review"*
- *"Move all @errands tasks to my 'Personal Tasks' project"*
- *"Create 5 tasks for my house cleaning routine: vacuum, dust, mop, bathrooms, kitchen"*

**Expected**: Assistant should handle multiple operations efficiently.

---

### **Scenario 8: Contextual Help**
Test the assistant's ability to understand context:

- *"I'm going on vacation next week. What tasks should I complete before then?"*
- *"I have a big presentation tomorrow. What related tasks do I need to finish today?"*
- *"It's Friday afternoon and I'm tired. What are some easy tasks I can knock out?"*

**Expected**: Assistant should provide contextual, helpful suggestions based on your situation.

---

## 🚨 **What If Something Goes Wrong?**

### **If the assistant seems confused:**
- Try rephrasing your request more simply
- Ask "What OmniFocus tools do you have access to?" to verify the connection
- Say "Can you see my OmniFocus tasks?" to test basic connectivity

### **If responses are slow:**
- This is normal for complex queries (OmniFocus has lots of data!)
- Try asking for smaller subsets: "Show me just 10 tasks" instead of "Show me all tasks"
- Wait 30 seconds - sometimes the response appears after a delay

### **If you get technical error messages:**
- Just tell the assistant "That didn't work, can you try a different approach?"
- Most issues resolve by asking again in slightly different words

---

## ✅ **Success Criteria: What Should Work Well**

**✅ Natural conversation** - You should be able to ask for things in plain English
**✅ Context understanding** - Assistant should understand "that project", "those tasks", etc.
**✅ Smart suggestions** - Assistant should offer helpful next steps
**✅ Error recovery** - When something doesn't work, assistant should try alternatives
**✅ Real productivity help** - You should feel like this actually helps you manage tasks better

**❌ Don't expect:**
- Perfect understanding of very ambiguous requests
- Instant responses to complex queries
- Mind reading (be specific about what you want)

---

## 🏁 **Wrapping Up Your Test Session**

When you're done testing:

1. **Clean up test data**: *"Please find all items with our test tag and delete them"*
2. **Verify cleanup**: *"Search for any remaining items with our test tag to make sure they're all gone"*
3. **Share feedback**: What worked well? What was confusing? What would make this more useful?

---

## 💡 **Real-World Usage Tips**

After testing, here are some ways this MCP server can actually help you:

- **Daily planning**: "What should I focus on today?"
- **Weekly reviews**: "Help me review my projects and identify what needs attention"
- **Quick captures**: "Add this to my inbox: [task]"
- **Status updates**: "What's the status of my work projects?"
- **Context switching**: "I'm at the office now, what @office tasks can I do?"

---

## 🎯 **The Bottom Line**

If you can have a natural conversation with your AI assistant about your OmniFocus tasks, projects, and productivity - **the integration is working perfectly!**

The goal isn't to learn technical commands, but to make your task management feel as natural as talking to a knowledgeable assistant who happens to have perfect access to your OmniFocus database.

**Happy testing! 🚀**