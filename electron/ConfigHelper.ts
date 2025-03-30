// ConfigHelper.ts
import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { EventEmitter } from "events"
import { ModelProvider } from "./models/ModelFactory"
import { createModelAdapter } from "./models/ModelFactory"

export interface ModelProviderConfig {
  apiKey: string;
  model: string;
}

interface Config {
  activeProvider: ModelProvider;
  providers: {
    openai: ModelProviderConfig;
    claude: ModelProviderConfig;
  };
  language: string;
  opacity: number;
  interviewMode: string;
  launchMode: 'visible' | 'invisible';
}

export class ConfigHelper extends EventEmitter {
  private configPath: string;
  private defaultConfig: Config = {
    activeProvider: "openai",
    providers: {
      openai: {
        apiKey: "",
        model: "gpt-4o"
      },
      claude: {
        apiKey: "",
        model: "claude-3-sonnet-20240229"
      }
    },
    language: "python",
    opacity: 1.0,
    interviewMode: "coding",
    launchMode: 'invisible'
  };

  constructor() {
    super();
    // Use the app's user data directory to store the config
    try {
      this.configPath = path.join(app.getPath('userData'), 'config.json');
      console.log('Config path:', this.configPath);
    } catch (err) {
      console.warn('Could not access user data path, using fallback');
      this.configPath = path.join(process.cwd(), 'config.json');
    }
    
    // Ensure the initial config file exists
    this.ensureConfigExists();
  }

  /**
   * Ensure config file exists
   */
  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(this.defaultConfig);
      } else {
        // Migrate old config if necessary
        this.migrateConfig();
      }
    } catch (err) {
      console.error("Error ensuring config exists:", err);
    }
  }

  /**
   * Migrate from old config format to new multi-provider format
   */
  private migrateConfig(): void {
    try {
      const oldConfig = this.loadRawConfig();
      
      // Check if this is an old format config (pre-multi provider)
      if (oldConfig && oldConfig.apiKey !== undefined && !oldConfig.providers) {
        console.log("Migrating old config format to new multi-provider format");
        
        const newConfig: Config = {
          activeProvider: "openai",
          providers: {
            openai: {
              apiKey: oldConfig.apiKey || "",
              model: oldConfig.extractionModel || "gpt-4o"
            },
            claude: {
              apiKey: "",
              model: "claude-3-sonnet-20240229"
            }
          },
          language: oldConfig.language || "python",
          opacity: oldConfig.opacity || 1.0,
          interviewMode: "coding",
          launchMode: 'invisible'
        };
        
        this.saveConfig(newConfig);
      }
    } catch (err) {
      console.error("Error migrating config:", err);
    }
  }

  /**
   * Load the raw configuration from disk without applying defaults
   */
  private loadRawConfig(): any {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(configData);
      }
    } catch (err) {
      console.error("Error loading raw config:", err);
    }
    return null;
  }

  /**
   * Load the configuration from disk
   */
  public loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // Merge with default config to ensure all properties exist
        return {
          ...this.defaultConfig,
          ...config,
          providers: {
            ...this.defaultConfig.providers,
            ...config.providers
          }
        };
      }
      
      // If no config exists, create a default one
      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (err) {
      console.error("Error loading config:", err);
      return this.defaultConfig;
    }
  }

  /**
   * Save configuration to disk
   */
  public saveConfig(config: Config): void {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      // Write the config file
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  /**
   * Update specific configuration values
   */
  public updateConfig(updates: Partial<Config>): Config {
    try {
      const currentConfig = this.loadConfig();
      
      // Handle nested updates
      if (updates.providers) {
        for (const provider in updates.providers) {
          if (currentConfig.providers[provider as keyof typeof currentConfig.providers]) {
            currentConfig.providers[provider as keyof typeof currentConfig.providers] = {
              ...currentConfig.providers[provider as keyof typeof currentConfig.providers],
              ...updates.providers[provider as keyof typeof updates.providers]
            };
          }
        }
        delete updates.providers;
      }
      
      const newConfig = { ...currentConfig, ...updates };
      this.saveConfig(newConfig);
      
      // Emit update event
      this.emit('config-updated', newConfig);
      
      return newConfig;
    } catch (error) {
      console.error('Error updating config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Update specific provider config
   */
  public updateProviderConfig(
    provider: ModelProvider,
    updates: Partial<ModelProviderConfig>
  ): Config {
    const currentConfig = this.loadConfig();
    const providerConfig = currentConfig.providers[provider];
    
    if (providerConfig) {
      currentConfig.providers[provider] = {
        ...providerConfig,
        ...updates
      };
      
      this.saveConfig(currentConfig);
      this.emit('config-updated', currentConfig);
    }
    
    return currentConfig;
  }

  /**
   * Get active provider
   */
  public getActiveProvider(): ModelProvider {
    return this.loadConfig().activeProvider;
  }

  /**
   * Set active provider
   */
  public setActiveProvider(provider: ModelProvider): void {
    this.updateConfig({ activeProvider: provider });
  }

  /**
   * Get provider config
   */
  public getProviderConfig(provider: ModelProvider): ModelProviderConfig {
    const config = this.loadConfig();
    return config.providers[provider];
  }

  /**
   * Check if the selected provider has API key configured
   */
  public hasApiKey(provider?: ModelProvider): boolean {
    const config = this.loadConfig();
    const providerToCheck = provider || config.activeProvider;
    const providerConfig = config.providers[providerToCheck];
    
    return !!providerConfig && !!providerConfig.apiKey && providerConfig.apiKey.trim().length > 0;
  }
  
  /**
   * Validate the API key format for a specific provider
   */
  public isValidApiKeyFormat(apiKey: string, provider: ModelProvider): boolean {
    if (!apiKey || apiKey.trim().length === 0) return false;
    
    switch (provider) {
      case 'openai':
        // OpenAI API keys typically start with "sk-" and are about 51 chars long
        return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
      case 'claude':
        // Claude API keys start with "sk-ant-" and are longer
        return /^sk-ant-[a-zA-Z0-9]{24,}$/.test(apiKey.trim());
      default:
        return apiKey.trim().length > 10; // Generic validation
    }
  }
  
  /**
   * Get the stored opacity value
   */
  public getOpacity(): number {
    const config = this.loadConfig();
    return config.opacity !== undefined ? config.opacity : 1.0;
  }

  /**
   * Set the window opacity value
   */
  public setOpacity(opacity: number): void {
    // Ensure opacity is between 0.1 and 1.0
    const validOpacity = Math.min(1.0, Math.max(0.1, opacity));
    this.updateConfig({ opacity: validOpacity });
  }  
  
  /**
   * Get the preferred programming language
   */
  public getLanguage(): string {
    const config = this.loadConfig();
    return config.language || "python";
  }

  /**
   * Set the preferred programming language
   */
  public setLanguage(language: string): void {
    this.updateConfig({ language });
  }
  
  /**
   * Get the current interview mode
   */
  public getInterviewMode(): string {
    const config = this.loadConfig();
    return config.interviewMode || "coding";
  }
  
  /**
   * Set the interview mode
   */
  public setInterviewMode(mode: string): void {
    this.updateConfig({ interviewMode: mode });
  }
  
  /**
   * Get launch mode (visible/invisible)
   */
  public getLaunchMode(): 'visible' | 'invisible' {
    const config = this.loadConfig();
    return config.launchMode || 'invisible';
  }
  
  /**
   * Set launch mode
   */
  public setLaunchMode(mode: 'visible' | 'invisible'): void {
    this.updateConfig({ launchMode: mode });
  }
  
  /**
   * Test API key with the provider
   */
  public async testApiKey(apiKey: string, provider: ModelProvider): Promise<{valid: boolean, error?: string}> {
    try {
      // Use default model for the provider
      const model = provider === 'openai' ? 'gpt-4o' : 'claude-3-haiku-20240307';
      
      // Create adapter for the specific provider
      const adapter = createModelAdapter({
        provider,
        apiKey,
        model
      });
      
      // Test the API key
      return await adapter.testApiKey(apiKey);
    } catch (error: any) {
      console.error(`API key test failed for ${provider}:`, error);
      return { valid: false, error: error.message || `Unknown error testing ${provider} API key` };
    }
  }
}

// Export a singleton instance
export const configHelper = new ConfigHelper();