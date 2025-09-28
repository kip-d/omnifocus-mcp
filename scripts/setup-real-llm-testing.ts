#!/usr/bin/env tsx
/**
 * Setup script for Real LLM Testing infrastructure
 *
 * This script helps set up the environment for testing with actual AI models via Ollama.
 * It checks dependencies, downloads models, and validates the setup.
 */

import { Ollama } from 'ollama';
import { spawn } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

interface TestModel {
  name: string;
  size: string;
  description: string;
  recommended: boolean;
}

const RECOMMENDED_MODELS: TestModel[] = [
  {
    name: 'phi3.5:3.8b',
    size: '2.2GB',
    description: 'Microsoft Phi-3.5 - Great balance of performance and speed',
    recommended: true,
  },
  {
    name: 'qwen2.5:0.5b',
    size: '352MB',
    description: 'Qwen2.5 0.5B - Ultra-fast for CI/CD testing',
    recommended: true,
  },
  {
    name: 'qwen2.5:1.5b',
    size: '934MB',
    description: 'Qwen2.5 1.5B - Good performance, reasonable size',
    recommended: false,
  },
  {
    name: 'llama3.2:1b',
    size: '1.3GB',
    description: 'Llama 3.2 1B - Meta\'s efficient model',
    recommended: false,
  },
  {
    name: 'llama3.2:3b',
    size: '2.0GB',
    description: 'Llama 3.2 3B - Better reasoning capabilities',
    recommended: false,
  },
];

class RealLLMSetup {
  private ollama: Ollama;

  constructor() {
    this.ollama = new Ollama({ host: 'http://localhost:11434' });
  }

  async checkOllamaAvailability(): Promise<boolean> {
    try {
      await this.ollama.list();
      console.log('✅ Ollama is running and accessible');
      return true;
    } catch (error) {
      console.error('❌ Ollama is not available:', error);
      console.log('\n📋 To install Ollama:');
      console.log('  • Visit: https://ollama.ai/download');
      console.log('  • Or use: curl -fsSL https://ollama.ai/install.sh | sh');
      console.log('  • Then run: ollama serve');
      return false;
    }
  }

  async listAvailableModels(): Promise<string[]> {
    try {
      const models = await this.ollama.list();
      return models.models.map(model => model.name);
    } catch (error) {
      console.error('Failed to list models:', error);
      return [];
    }
  }

  async downloadModel(modelName: string): Promise<boolean> {
    try {
      console.log(`🔄 Downloading ${modelName}...`);

      // Use ollama pull command for better progress indication
      const pullProcess = spawn('ollama', ['pull', modelName], {
        stdio: 'inherit'
      });

      return new Promise((resolve) => {
        pullProcess.on('close', (code) => {
          if (code === 0) {
            console.log(`✅ Successfully downloaded ${modelName}`);
            resolve(true);
          } else {
            console.error(`❌ Failed to download ${modelName} (exit code: ${code})`);
            resolve(false);
          }
        });
      });
    } catch (error) {
      console.error(`❌ Error downloading ${modelName}:`, error);
      return false;
    }
  }

  async testModelChat(modelName: string): Promise<boolean> {
    try {
      console.log(`🧪 Testing ${modelName}...`);

      const response = await this.ollama.chat({
        model: modelName,
        messages: [
          {
            role: 'user',
            content: 'Respond with exactly: "Test successful"'
          }
        ],
        stream: false,
      });

      const isSuccessful = response.message.content.toLowerCase().includes('test successful');

      if (isSuccessful) {
        console.log(`✅ ${modelName} is working correctly`);
      } else {
        console.log(`⚠️  ${modelName} responded but may have issues: "${response.message.content}"`);
      }

      return isSuccessful;
    } catch (error) {
      console.error(`❌ Failed to test ${modelName}:`, error);
      return false;
    }
  }

  async setupRecommendedModels(): Promise<void> {
    console.log('🚀 Setting up recommended models for Real LLM Testing\n');

    const availableModels = await this.listAvailableModels();
    console.log('Available models:', availableModels.length > 0 ? availableModels.join(', ') : 'None');

    for (const model of RECOMMENDED_MODELS.filter(m => m.recommended)) {
      console.log(`\n📦 Processing ${model.name} (${model.size})`);
      console.log(`   ${model.description}`);

      if (availableModels.includes(model.name)) {
        console.log(`✅ ${model.name} already available`);
        await this.testModelChat(model.name);
      } else {
        console.log(`⬇️  Downloading ${model.name}...`);
        const downloaded = await this.downloadModel(model.name);

        if (downloaded) {
          await this.testModelChat(model.name);
        }
      }
    }
  }

  async validateTestEnvironment(): Promise<boolean> {
    console.log('\n🔍 Validating Real LLM Testing environment...\n');

    // Check Ollama
    const ollamaOk = await this.checkOllamaAvailability();
    if (!ollamaOk) return false;

    // Check for at least one working model
    const availableModels = await this.listAvailableModels();
    const recommendedAvailable = RECOMMENDED_MODELS
      .filter(m => m.recommended)
      .filter(m => availableModels.includes(m.name));

    if (recommendedAvailable.length === 0) {
      console.log('⚠️  No recommended models available. Consider running setup first.');
      return false;
    }

    // Test the primary model
    const primaryModel = recommendedAvailable[0];
    console.log(`🧪 Testing primary model: ${primaryModel.name}`);
    const testResult = await this.testModelChat(primaryModel.name);

    if (testResult) {
      console.log('\n✅ Real LLM Testing environment is ready!');
      console.log('\n🚀 To run tests:');
      console.log('  npm run test:real-llm');
      console.log('\n🔧 To run specific tests:');
      console.log('  ENABLE_REAL_LLM_TESTS=true npx vitest tests/integration/real-llm-integration.test.ts');
      return true;
    } else {
      console.log('\n❌ Environment validation failed');
      return false;
    }
  }

  async showModelRecommendations(): Promise<void> {
    console.log('\n📊 Model Recommendations for Real LLM Testing:\n');

    for (const model of RECOMMENDED_MODELS) {
      const status = model.recommended ? '⭐ RECOMMENDED' : '  Optional';
      console.log(`${status} ${model.name} (${model.size})`);
      console.log(`           ${model.description}\n`);
    }

    console.log('💡 Tips:');
    console.log('  • Start with phi3.5:3.8b for best balance of speed and capability');
    console.log('  • Use qwen2.5:0.5b for fastest CI/CD testing');
    console.log('  • All models support tool calling and reasoning tasks');
    console.log('  • Smaller models are faster but may have less sophisticated reasoning');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'validate';

  const setup = new RealLLMSetup();

  switch (command) {
    case 'setup':
      await setup.setupRecommendedModels();
      break;
    case 'validate':
      const isValid = await setup.validateTestEnvironment();
      process.exit(isValid ? 0 : 1);
      break;
    case 'models':
      await setup.showModelRecommendations();
      break;
    case 'check':
      await setup.checkOllamaAvailability();
      break;
    default:
      console.log('📋 Real LLM Testing Setup\n');
      console.log('Usage:');
      console.log('  npm run setup-real-llm [command]\n');
      console.log('Commands:');
      console.log('  setup     - Download and setup recommended models');
      console.log('  validate  - Check if environment is ready for testing');
      console.log('  models    - Show model recommendations');
      console.log('  check     - Check if Ollama is running');
      console.log('\nDefault: validate');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}