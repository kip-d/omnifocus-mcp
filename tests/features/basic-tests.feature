# language: en
Feature: Basic OmniFocus MCP Tests
  As a developer
  I want to test the core OmniFocus MCP functionality
  So that I can ensure the server works correctly

  Background:
    Given the OmniFocus MCP server is connected

  Scenario: List incomplete tasks
    When I request tasks with filter "completed: false"
    Then I should receive a list of tasks
    And each task should have properties: id, name, project

  Scenario: Get today's agenda
    When I request today's agenda
    Then I should receive tasks that are:
      | Type      | Criteria               |
      | Overdue   | dueDate < today       |
      | Due Today | dueDate = today       |
      | Flagged   | flagged = true        |

  Scenario: Create and search for a task
    When I create a task with:
      | name | Cucumber test task - automated |
    Then the task should be created successfully
    And the task should have a unique ID

  Scenario: Get productivity statistics
    When I request productivity stats for "period: 'week'"
    Then I should receive statistics including:
      | Metric          | Description     |
      | totalTasks      | Total tasks     |
      | completedTasks  | Completed count |
      | completionRate  | Percentage      |

  Scenario: List all tags
    When I request all tags sorted by "name"
    Then I should receive a list of tags
    And each tag should show:
      | Property   | Description              |
      | name       | Tag name                 |
      | taskCount  | Number of tasks with tag |

  Scenario: Export flagged tasks as JSON
    When I export tasks with:
      | format | json |
      | filter | {"flagged": true} |
    Then I should receive a JSON array of flagged tasks

  Scenario: Test caching performance
    When I request task count for "completed: false"
    And I note the response time
    And I request the same task count again
    Then the second response should be faster
    And the result should indicate "from_cache: true"

  Scenario: Handle invalid task ID gracefully
    When I try to update task with ID "invalid-id-12345"
    Then I should receive an error message
    And the error should indicate "not found"