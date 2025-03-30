// ModelInterface.ts - Interface for AI model adapters

/**
 * Common request options for all AI model adapters
 */
export interface ModelRequestOptions {
    signal?: AbortSignal;
    maxTokens?: number;
    temperature?: number;
  }
  
  /**
   * Interface for model messages (similar to OpenAI's format)
   */
  export interface ModelMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | MessageContent[];
  }
  
  /**
   * Content types for multi-modal messages
   */
  export interface TextContent {
    type: 'text';
    text: string;
  }
  
  export interface ImageContent {
    type: 'image_url';
    image_url: {
      url: string;
    };
  }
  
  export type MessageContent = TextContent | ImageContent;
  
  /**
   * Response from AI model
   */
  export interface ModelResponse {
    content: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  }
  
  /**
   * Model adapter interface - all model implementations must follow this
   */
  export interface ModelAdapter {
    /**
     * Name of the model provider (e.g., "OpenAI", "Claude")
     */
    readonly provider: string;
    
    /**
     * Get available models for this provider
     */
    getAvailableModels(): string[];
    
    /**
     * Get current model being used
     */
    getCurrentModel(): string;
    
    /**
     * Set the model to use
     */
    setModel(model: string): void;
    
    /**
     * Set the API key
     */
    setApiKey(apiKey: string): void;
    
    /**
     * Get the API key (may return masked version for security)
     */
    getApiKey(): string;
    
    /**
     * Test if the API key is valid
     */
    testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }>;
    
    /**
     * Send a completion request to the model
     */
    complete(
      messages: ModelMessage[],
      options?: ModelRequestOptions
    ): Promise<ModelResponse>;
    
    /**
     * Send a vision request (for image analysis)
     */
    vision(
      messages: ModelMessage[],
      options?: ModelRequestOptions
    ): Promise<ModelResponse>;
    
    /**
     * Check if this adapter supports vision/image input
     */
    supportsVision(): boolean;
  }
  
  /**
   * Factory function type for creating model adapters
   */
  export type ModelAdapterFactory = (
    apiKey: string,
    model: string
  ) => ModelAdapter;