# language: en
Feature: Simple OmniFocus MCP Demo
  Demonstrate basic Cucumber testing with MCP

  Background:
    Given the OmniFocus MCP server is connected

  Scenario: Count incomplete tasks
    When I count incomplete tasks
    Then I should have more than 0 incomplete tasks

  Scenario: Get today's tasks
    When I get today's agenda
    Then I should see my agenda for today

  Scenario: Create a test task
    When I create a simple test task
    Then the task should be created

  Scenario: List my tags
    When I list all my tags
    Then I should see a list of tags