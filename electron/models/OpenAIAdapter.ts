// OpenAIAdapter.ts - OpenAI implementation of the model adapter

import { OpenAI } from "openai";
import {
  ModelAdapter,
  ModelMessage,
  ModelRequestOptions,
  ModelResponse
} from "./ModelInterface";

/**
 * Available OpenAI models with their capabilities
 */
const OPENAI_MODELS = {
  "gpt-4o": {
    maxTokens: 128000,
    supportsVision: true,
    description: "Best overall performance, supports images"
  },
  "gpt-4o-mini": {
    maxTokens: 128000,
    supportsVision: true,
    description: "Faster, more cost-effective option with vision"
  },
  "gpt-4-turbo": {
    maxTokens: 128000,
    supportsVision: true,
    description: "Advanced capabilities with vision support"
  },
  "gpt-3.5-turbo": {
    maxTokens: 16385,
    supportsVision: false,
    description: "Fast and efficient for text-only tasks"
  }
};

/**
 * OpenAI implementation of the ModelAdapter interface
 */
export class OpenAIAdapter implements ModelAdapter {
  readonly provider = "OpenAI";
  private client: OpenAI | null = null;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = "gpt-4o") {
    this.apiKey = apiKey;
    this.model = this.validateModel(model);
    this.initializeClient();
  }

  private validateModel(model: string): string {
    if (Object.keys(OPENAI_MODELS).includes(model)) {
      return model;
    }
    console.warn(`Invalid OpenAI model: ${model}. Defaulting to gpt-4o`);
    return "gpt-4o";
  }

  private initializeClient(): void {
    if (!this.apiKey) {
      this.client = null;
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        timeout: 60000, // 60 second timeout
        maxRetries: 2 // Retry up to 2 times
      });
      console.log("OpenAI client initialized successfully");
    } catch (error) {
      console.error("Failed to initialize OpenAI client:", error);
      this.client = null;
    }
  }

  getAvailableModels(): string[] {
    return Object.keys(OPENAI_MODELS);
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
      const tempClient = new OpenAI({ apiKey });
      await tempClient.models.list();
      return { valid: true };
    } catch (error: any) {
      console.error("API key test failed:", error);

      let errorMessage = "Unknown error validating API key";

      if (error.status === 401) {
        errorMessage = "Invalid API key. Please check your key and try again.";
      } else if (error.status === 429) {
        errorMessage =
          "Rate limit exceeded. Your API key has reached its request limit or has insufficient quota.";
      } else if (error.status === 500) {
        errorMessage = "OpenAI server error. Please try again later.";
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  async complete(
    messages: ModelMessage[],
    options?: ModelRequestOptions
  ): Promise<ModelResponse> {
    if (!this.client) {
      throw new Error("OpenAI client not initialized");
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as any, // Type adaptation between our interface and OpenAI's
        max_tokens: options?.maxTokens,
        temperature: options?.temperature ?? 0.7,
        stream: false
      });

      return {
        content: response.choices[0].message.content || "",
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens
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
    if (!this.client) {
      throw new Error("OpenAI client not initialized");
    }

    if (!this.supportsVision()) {
      throw new Error(`Model ${this.model} does not support vision capabilities`);
    }

    try {
      // For OpenAI, the vision API is the same as the completion API
      // when messages contain image content
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as any, // Type adaptation
        max_tokens: options?.maxTokens,
        temperature: options?.temperature ?? 0.7,
        stream: false
      });

      return {
        content: response.choices[0].message.content || "",
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens
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

  supportsVision(): boolean {
    const modelInfo = OPENAI_MODELS[this.model as keyof typeof OPENAI_MODELS];
    return modelInfo ? modelInfo.supportsVision : false;
  }
}

/**
 * Factory function for creating OpenAI adapters
 */
export const createOpenAIAdapter = (
  apiKey: string,
  model: string = "gpt-4o"
): ModelAdapter => {
  return new OpenAIAdapter(apiKey, model);
};