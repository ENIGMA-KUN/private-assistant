// ModelFactory.ts - Factory for creating model adapters

import { ModelAdapter } from './ModelInterface';
import { createOpenAIAdapter } from './OpenAIAdapter';
import { createClaudeAdapter } from './ClaudeAdapter';

// Provider type for configuration
export type ModelProvider = 'openai' | 'claude';

// Model configuration
export interface ModelConfig {
  provider: ModelProvider;
  apiKey: string;
  model: string;
  isDefault?: boolean;
}

/**
 * Get available providers with metadata
 */
export function getAvailableProviders(): Record<string, { name: string, description: string }> {
  return {
    'openai': { 
      name: 'OpenAI', 
      description: 'GPT models with great coding and vision capabilities' 
    },
    'claude': { 
      name: 'Claude', 
      description: 'Anthropic models with strong reasoning and long contexts' 
    }
  };
}

/**
 * Create a model adapter based on provider type
 */
export function createModelAdapter(config: ModelConfig): ModelAdapter {
  switch(config.provider) {
    case 'openai':
      return createOpenAIAdapter(config.apiKey, config.model);
    case 'claude':
      return createClaudeAdapter(config.apiKey, config.model);
    default:
      throw new Error(`Unsupported model provider: ${config.provider}`);
  }
}

/**
 * Get default models for each provider
 */
export function getDefaultModel(provider: ModelProvider): string {
  switch(provider) {
    case 'openai':
      return 'gpt-4o';
    case 'claude':
      return 'claude-3-sonnet-20240229';
    default:
      throw new Error(`Unsupported model provider: ${provider}`);
  }
}

/**
 * Get all available models for a provider
 */
export function getAvailableModels(provider: ModelProvider): 
  { id: string, name: string, description: string }[] {
  
  switch(provider) {
    case 'openai':
      return [
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Best overall performance, supports images' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster, more cost-effective option with vision' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Advanced capabilities with vision support' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient for text-only tasks' }
      ];
    case 'claude':
      return [
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most powerful Claude model' },
        { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: 'Great balance of intelligence and speed' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fastest Claude model, good for quick responses' },
        { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', description: 'Latest Claude with improved capabilities' }
      ];
    default:
      return [];
  }
}