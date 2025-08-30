/**
 * Performance Benchmarks for OmniFocus MCP Server
 * Ensures key operations meet performance standards
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDataManager } from '../support/test-factories';

describe('Performance Benchmarks', () => {
  let testManager: TestDataManager;
  
  beforeAll(async () => {
    testManager = new TestDataManager();
    await testManager.startServer();
  });
  
  afterAll(async () => {
    await testManager.cleanupTestData();
    await testManager.stop();
  });
  
  describe('Task Operations Performance', () => {
    it('should create task within 2 seconds', async () => {
      const startTime = Date.now();
      
      const result = await testManager.createTestTask('Performance Test Task');
      
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000);
      console.log(`✅ Task creation: ${duration}ms`);
    });
    
    it('should list tasks within 3 seconds', async () => {
      const startTime = Date.now();
      
      const result = await testManager.callTool('tasks', {
        mode: 'all',
        limit: 50
      });
      
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(3000);
      console.log(`✅ Task listing: ${duration}ms`);
    });
    
    it('should search tasks within 2 seconds', async () => {
      const startTime = Date.now();
      
      const result = await testManager.callTool('tasks', {
        mode: 'search',
        search: 'test',
        limit: 20
      });
      
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000);
      console.log(`✅ Task search: ${duration}ms`);
    });
  });
  
  describe('Project Operations Performance', () => {
    it('should create project within 3 seconds', async () => {
      const startTime = Date.now();
      
      const result = await testManager.createTestProject(`Performance Project ${Date.now()}`);
      
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(3000);
      console.log(`✅ Project creation: ${duration}ms`);
    });
    
    it('should list projects within 2 seconds', async () => {
      const startTime = Date.now();
      
      const result = await testManager.callTool('projects', {
        operation: 'list',
        limit: 50
      });
      
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000);
      console.log(`✅ Project listing: ${duration}ms`);
    });
  });
  
  describe('Cleanup Performance', () => {
    it('should cleanup test data within 10 seconds', async () => {
      // Create some test data first
      await testManager.createTestTask('Cleanup Test Task 1');
      await testManager.createTestTask('Cleanup Test Task 2');
      await testManager.createTestProject(`Cleanup Test Project ${Date.now()}`);
      
      const startTime = Date.now();
      
      await testManager.cleanupTestData();
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(10000);
      console.log(`✅ Cleanup operation: ${duration}ms`);
    });
  });
  
  describe('Bulk Operations Performance', () => {
    it('should handle multiple concurrent operations efficiently', async () => {
      const startTime = Date.now();
      
      // Create multiple tasks concurrently
      const promises = Array.from({ length: 5 }, (_, i) => 
        testManager.createTestTask(`Concurrent Task ${i + 1}`)
      );
      
      const results = await Promise.all(promises);
      
      const duration = Date.now() - startTime;
      
      // All should succeed
      results.forEach(result => expect(result.success).toBe(true));
      
      // Should complete within reasonable time (5 tasks × 2s each = 10s max)
      expect(duration).toBeLessThan(10000);
      console.log(`✅ Concurrent operations: ${duration}ms for 5 tasks`);
    });
  });
  
  describe('Memory and Resource Usage', () => {
    it('should not leak memory during operations', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform a series of operations
      for (let i = 0; i < 10; i++) {
        await testManager.createTestTask(`Memory Test Task ${i}`);
        await testManager.cleanupTestData();
      }
      
      const finalMemory = process.memoryUsage();
      
      // Memory usage should not increase significantly
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
      
      expect(memoryIncreaseMB).toBeLessThan(50); // Less than 50MB increase
      console.log(`✅ Memory usage increase: ${memoryIncreaseMB.toFixed(2)}MB`);
    });
  });
});
