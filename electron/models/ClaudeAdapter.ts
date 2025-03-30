// ClaudeAdapter.ts - Claude (Anthropic) implementation of the model adapter

import Anthropic from '@anthropic-ai/sdk';
import {
  ModelAdapter,
  ModelMessage,
  ModelRequestOptions,
  ModelResponse,
  MessageContent
} from "./ModelInterface";

/**
 * Available Claude models with their capabilities
 */
const CLAUDE_MODELS = {
  "claude-3-opus-20240229": {
    maxTokens: 200000,
    supportsVision: true,
    description: "Most powerful Claude model"
  },
  "claude-3-sonnet-20240229": {
    maxTokens: 200000,
    supportsVision: true,
    description: "Great balance of intelligence and speed"
  },
  "claude-3-haiku-20240307": {
    maxTokens: 200000,
    supportsVision: true,
    description: "Fastest Claude model, good for quick responses"
  },
  "claude-3-5-sonnet-20240620": { 
    maxTokens: 200000,
    supportsVision: true,
    description: "Latest Claude with improved capabilities"
  }
};

/**
 * Claude (Anthropic) implementation of the ModelAdapter interface
 */
export class ClaudeAdapter implements ModelAdapter {
  readonly provider = "Claude";
  private client: Anthropic | null = null;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = "claude-3-sonnet-20240229") {
    this.apiKey = apiKey;
    this.model = this.validateModel(model);
    this.initializeClient();
  }

  private validateModel(model: string): string {
    if (Object.keys(CLAUDE_MODELS).includes(model)) {
      return model;
    }
    console.warn(`Invalid Claude model: ${model}. Defaulting to claude-3-sonnet-20240229`);
    return "claude-3-sonnet-20240229";
  }

  private initializeClient(): void {
    if (!this.apiKey) {
      this.client = null;
      return;
    }

    try {
      this.client = new Anthropic({
        apiKey: this.apiKey,
      });
      console.log("Claude client initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Claude client:", error);
      this.client = null;
    }
  }

  getAvailableModels(): string[] {
    return Object.keys(CLAUDE_MODELS);
  }

  getCurrentModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = this.validateModel(model);
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.initializeClient();
  }

  getApiKey(): string {
    if (!this.apiKey) return "";
    // Return masked API key for security
    return `${this.apiKey.substring(0, 4)}...${this.apiKey.substring(
      this.apiKey.length - 4
    )}`;
  }

  async testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const tempClient = new Anthropic({ apiKey });
      
      // Make a simple API call to test the key
      await tempClient.messages.create({
        model: "claude-3-haiku-20240307", // Use the smallest model for testing
        max_tokens: 10,
        messages: [{ role: "user", content: "Test" }],
      });
      
      return { valid: true };
    } catch (error: any) {
      console.error("API key test failed:", error);

      let errorMessage = "Unknown error validating API key";

      if (error.status === 401) {
        errorMessage = "Invalid API key. Please check your key and try again.";
      } else if (error.status === 429) {
        errorMessage = "Rate limit exceeded. Your API key has reached its request limit or has insufficient quota.";
      } else if (error.status === 500) {
        errorMessage = "Claude API server error. Please try again later.";
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Convert our model messages to Claude format
   */
  private convertToClaudeMessages(messages: ModelMessage[]): any[] {
    const claudeMessages: any[] = [];

    let systemPrompt = "";
    
    // Extract system message
    const systemMessages = messages.filter(msg => msg.role === 'system');
    if (systemMessages.length > 0) {
      systemPrompt = typeof systemMessages[0].content === 'string' 
        ? systemMessages[0].content 
        : systemMessages[0].content.filter(item => item.type === 'text').map(item => (item as any).text).join("\n");
    }
    
    // Convert other messages
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
    
    for (const msg of nonSystemMessages) {
      let content: any[];
      
      // Handle multi-modal content
      if (Array.isArray(msg.content)) {
        content = msg.content.map(item => {
          if (item.type === 'text') {
            return { type: 'text', text: item.text };
          } else if (item.type === 'image_url') {
            // Claude expects images in a slightly different format
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                // Extract base64 content from OpenAI format
                data: item.image_url.url.replace('data:image/png;base64,', '')
              }
            };
          }
          return item;
        });
      } else {
        // Simple text content
        content = [{ type: 'text', text: msg.content }];
      }
      
      claudeMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content
      });
    }
    
    return {
      messages: claudeMessages,
      system: systemPrompt
    };
  }

  async complete(
    messages: ModelMessage[],
    options?: ModelRequestOptions
  ): Promise<ModelResponse> {
    if (!this.client) {
      throw new Error("Claude client not initialized");
    }

    try {
      const { messages: claudeMessages, system } = this.convertToClaudeMessages(messages);
      
      const response = await this.client.messages.create({
        model: this.model,
        system: system,
        messages: claudeMessages,
        max_tokens: options?.maxTokens || 4000,
        temperature: options?.temperature ?? 0.7,
      });

      return {
        content: response.content[0].text,
        usage: {
          // Anthropic provides usage stats differently, adapt as needed
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        }
      };
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error("Invalid API key");
      } else if (error.status === 429) {
        throw new Error("Rate limit exceeded or insufficient quota");
      } else {
        throw error;
      }
    }
  }

  async vision(
    messages: ModelMessage[],
    options?: ModelRequestOptions
  ): Promise<ModelResponse> {
    if (!this.supportsVision()) {
      throw new Error(`Model ${this.model} does not support vision capabilities`);
    }

    // For Claude, vision is handled through the same API as text completion
    return this.complete(messages, options);
  }

  supportsVision(): boolean {
    const modelInfo = CLAUDE_MODELS[this.model as keyof typeof CLAUDE_MODELS];
    return modelInfo ? modelInfo.supportsVision : false;
  }
}

/**
 * Factory function for creating Claude adapters
 */
export const createClaudeAdapter = (
  apiKey: string,
  model: string = "claude-3-sonnet-20240229"
): ModelAdapter => {
  return new ClaudeAdapter(apiKey, model);
};