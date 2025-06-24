# language: en
Feature: OmniFocus MCP Server Integration
  As a Claude Desktop user
  I want to manage my OmniFocus tasks through MCP
  So that I can be more productive with AI assistance

  Background:
    Given the OmniFocus MCP server is connected
    And I have an OmniFocus database with existing tasks and projects

  # Core Task Management
  
  Scenario: List all incomplete tasks
    When I request tasks with filter "completed: false"
    Then I should receive a list of tasks
    And each task should have properties: id, name, project, tags
    And no task should have "completed: true"

  Scenario: Search for tasks by keyword
    Given I have tasks containing the word "meeting"
    When I search for tasks with "search: meeting"
    Then I should receive only tasks containing "meeting" in name or notes
    And the result count should be less than total task count

  Scenario: Get today's agenda
    When I request today's agenda
    Then I should receive tasks that are:
      | Type      | Criteria                |
      | Overdue   | dueDate < today        |
      | Due Today | dueDate = today        |
      | Flagged   | flagged = true         |
    And each task should show why it's included (overdue/due_today/flagged)

  Scenario: Create a simple task
    When I create a task with:
      | name | Test task from Claude |
    Then the task should be created successfully
    And the task should appear in the inbox
    And the task should have a unique ID

  Scenario: Create a task with full properties
    When I create a task with:
      | name            | Complete project report      |
      | note            | Final review before submission |
      | projectId       | <existing_project_id>        |
      | flagged         | true                         |
      | dueDate         | 2025-06-25T17:00:00Z        |
      | deferDate       | 2025-06-23T09:00:00Z        |
      | estimatedMinutes| 120                          |
      | tags            | ["work", "urgent"]           |
    Then the task should be created with all specified properties
    And the task should be assigned to the specified project

  Scenario: Update an existing task
    Given I have a task with known ID
    When I update the task with:
      | name     | Updated task name    |
      | flagged  | true                |
      | dueDate  | 2025-06-30T10:00:00Z |
    Then the task should be updated successfully
    And the task should reflect the new values

  Scenario: Complete a task
    Given I have an incomplete task with known ID
    When I complete the task
    Then the task should be marked as completed
    And the task should have a completion date

  Scenario: Delete a task
    Given I have a task with known ID
    When I delete the task
    Then the task should be removed from OmniFocus
    And the task should not appear in any task lists

  # Project Management

  Scenario: List all projects
    When I request all projects
    Then I should receive a list of projects
    And each project should have: name, status, folder, taskCount

  Scenario: Filter projects by status
    When I request projects with "status: ['active']"
    Then I should only receive active projects
    And no project should have status "completed", "dropped", or "onHold"

  Scenario: Create a new project
    When I create a project with:
      | name         | Q3 Marketing Campaign |
      | note         | Launch new product line |
      | dueDate      | 2025-09-30T17:00:00Z |
      | flagged      | true |
      | parentFolder | Work |
    Then the project should be created successfully
    And the project should appear in the Work folder

  Scenario: Update project properties
    Given I have a project named "Test Project"
    When I update the project with:
      | status   | onHold |
      | note     | Waiting for approval |
      | flagged  | false |
    Then the project should be updated successfully
    And the project status should be "onHold"

  Scenario: Complete a project with tasks
    Given I have a project with incomplete tasks
    When I complete the project with "completeAllTasks: true"
    Then the project should be marked as done
    And all tasks in the project should be completed

  Scenario: Delete an empty project
    Given I have an empty project
    When I delete the project
    Then the project should be removed from OmniFocus

  # Tag Management

  Scenario: List all tags with usage
    When I request all tags sorted by "usage"
    Then I should receive a list of tags
    And each tag should show:
      | Property        | Description                    |
      | name           | Tag name                       |
      | taskCount      | Number of tasks using this tag |
      | availableCount | Number of available tasks      |
    And tags should be sorted by usage count descending

  Scenario: Create a new tag
    When I create a tag named "urgent-2025"
    Then the tag should be created successfully
    And the tag should appear in the tags list

  Scenario: Rename an existing tag
    Given I have a tag named "old-name"
    When I rename the tag to "new-name"
    Then all tasks with "old-name" should now have "new-name"
    And "old-name" should not exist in the tags list

  Scenario: Merge two tags
    Given I have tags "duplicate1" and "duplicate2"
    When I merge "duplicate1" into "duplicate2"
    Then all tasks with "duplicate1" should now have "duplicate2"
    And "duplicate1" should be deleted

  Scenario: Delete an unused tag
    Given I have a tag with no associated tasks
    When I delete the tag
    Then the tag should be removed from OmniFocus

  # Analytics and Insights

  Scenario: Get weekly productivity statistics
    When I request productivity stats for "period: week"
    Then I should receive statistics including:
      | Metric               | Description                      |
      | totalTasks          | Total tasks in period            |
      | completedTasks      | Tasks completed                  |
      | completionRate      | Percentage completed             |
      | averageCompletionTime| Average time to complete         |
      | tasksByProject      | Breakdown by project             |
      | tasksByTag          | Breakdown by tag                 |
      | dailyStats          | Completion count per day         |

  Scenario: Analyze task velocity
    When I request task velocity for "period: month"
    Then I should receive velocity metrics including:
      | Metric              | Description                       |
      | averageDaily        | Average tasks completed per day   |
      | peakDay            | Day with most completions         |
      | trend              | Increasing/decreasing/stable      |
      | projectedMonthly   | Estimated monthly completion      |

  Scenario: Analyze overdue tasks
    When I analyze overdue tasks grouped by "project"
    Then I should receive:
      | Information         | Description                       |
      | overdueCount       | Total overdue tasks               |
      | averageOverdueDays | Average days overdue              |
      | tasksByProject     | Overdue count per project         |
      | oldestOverdue      | Longest overdue task              |
      | recentlyCompleted  | Tasks completed after due date    |

  Scenario: Analyze recurring task patterns
    When I analyze recurring tasks
    Then I should receive:
      | Pattern            | Description                        |
      | dailyTasks        | Tasks that repeat daily            |
      | weeklyTasks       | Tasks that repeat weekly           |
      | monthlyTasks      | Tasks that repeat monthly          |
      | customPatterns    | Tasks with custom repeat rules     |
      | completionRate    | How often recurring tasks are done |

  # Export Functionality

  Scenario: Export tasks as JSON
    When I export tasks with:
      | format  | json |
      | filter  | { "flagged": true } |
    Then I should receive a JSON array of flagged tasks
    And each task should include all standard fields

  Scenario: Export tasks as CSV
    When I export tasks with:
      | format  | csv |
      | filter  | { "project": "Work" } |
      | fields  | ["name", "dueDate", "tags"] |
    Then I should receive CSV data with headers
    And only specified fields should be included
    And only tasks from "Work" project should be exported

  Scenario: Export all projects with statistics
    When I export projects with "includeStats: true"
    Then each project should include:
      | Field              | Description                       |
      | taskCount         | Total tasks in project            |
      | completedCount    | Completed tasks                   |
      | overdueCount      | Overdue tasks                     |
      | nextDueDate       | Next task due date                |

  Scenario: Bulk export all data
    When I perform bulk export to "/tmp/omnifocus-export"
    Then the following files should be created:
      | File          | Content                           |
      | tasks.json    | All tasks                         |
      | projects.json | All projects with stats           |
      | tags.json     | All tags with usage               |
    And each file should be valid JSON

  # Advanced Filtering

  Scenario: Filter with multiple criteria
    When I request tasks with:
      | completed  | false |
      | flagged    | true  |
      | projectId  | <work_project_id> |
      | dueBefore  | 2025-07-01T00:00:00Z |
    Then I should only receive tasks matching ALL criteria

  Scenario: Filter by date ranges
    When I request tasks with:
      | dueAfter   | 2025-06-01T00:00:00Z |
      | dueBefore  | 2025-06-30T23:59:59Z |
    Then I should only receive tasks due in June 2025

  Scenario: Filter by multiple tags
    When I request tasks with "tags: ['work', 'urgent']"
    Then I should only receive tasks having BOTH tags

  Scenario: Get available tasks only
    When I request tasks with "available: true"
    Then I should not receive:
      | Excluded Tasks    | Reason                            |
      | Completed tasks   | Already done                      |
      | Deferred tasks    | Start date in future              |
      | Blocked tasks     | Waiting on other tasks            |
      | Dropped tasks     | Cancelled                         |

  # Performance and Caching

  Scenario: Cache improves response time
    When I request task count for "completed: false"
    And I note the response time
    And I request the same task count again
    Then the second response should be faster
    And the result should indicate "from_cache: true"

  Scenario: Cache respects different filters
    When I request tasks with "flagged: true"
    And I request tasks with "flagged: false"
    Then both requests should return different results
    And cache should store both results separately

  # Error Handling

  Scenario: Handle invalid task ID
    When I try to update task with ID "invalid-id-12345"
    Then I should receive an error message
    And the error should indicate "task not found"

  Scenario: Handle invalid project name
    When I try to update project "Non-existent Project"
    Then I should receive an error message
    And the error should indicate "project not found"

  Scenario: Handle large result sets
    When I request tasks with "limit: 1000"
    Then I should receive at most 1000 tasks
    And the response should indicate if more results exist

  Scenario: Handle empty results gracefully
    When I search for tasks with "search: xyzabc123impossible"
    Then I should receive an empty task list
    And no error should occur

  # Special Cases

  Scenario: Handle special characters in task names
    When I create a task with:
      | name | Task with "quotes" & émojis 🎯 |
    Then the task should be created successfully
    And the special characters should be preserved

  Scenario: Handle tasks without dates
    When I request tasks with "dueBefore: 2025-12-31"
    Then tasks without due dates should not be included
    And no error should occur for null date values

  Scenario: Handle concurrent operations
    When I simultaneously:
      | Operation 1 | Create task A |
      | Operation 2 | Create task B |
      | Operation 3 | List all tasks |
    Then all operations should complete successfully
    And no data corruption should occur