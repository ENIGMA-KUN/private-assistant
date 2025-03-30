export type ModelProvider = 'openai' | 'claude';

export interface ModelProviderConfig {
  apiKey: string;
  model: string;
}

export interface Config {
  activeProvider: ModelProvider;
  providers: {
    openai: ModelProviderConfig;
    claude: ModelProviderConfig;
  };
  language: string;
  interviewMode: string;
  opacity: number;
  launchMode: 'visible' | 'invisible';
}

export interface ElectronAPI {
  // Original methods
  openSubscriptionPortal: (authData: {
    id: string
    email: string
  }) => Promise<{ success: boolean; error?: string }>;
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>;
  clearStore: () => Promise<{ success: boolean; error?: string }>;
  getScreenshots: () => Promise<any[]>;
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>;
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void;
  onResetView: (callback: () => void) => () => void;
  onSolutionStart: (callback: () => void) => () => void;
  onDebugStart: (callback: () => void) => () => void;
  onDebugSuccess: (callback: (data: any) => void) => () => void;
  onSolutionError: (callback: (error: string) => void) => () => void;
  onProcessingNoScreenshots: (callback: () => void) => () => void;
  onProblemExtracted: (callback: (data: any) => void) => () => void;
  onSolutionSuccess: (callback: (data: any) => void) => () => void;
  onUnauthorized: (callback: () => void) => () => void;
  onDebugError: (callback: (error: string) => void) => () => void;
  openExternal: (url: string) => void;
  toggleMainWindow: () => Promise<{ success: boolean; error?: string }>;
  triggerScreenshot: () => Promise<{ success: boolean; error?: string }>;
  triggerProcessScreenshots: () => Promise<{ success: boolean; error?: string }>;
  triggerReset: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveLeft: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveRight: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveUp: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveDown: () => Promise<{ success: boolean; error?: string }>;
  onSubscriptionUpdated: (callback: () => void) => () => void;
  onSubscriptionPortalClosed: (callback: () => void) => () => void;
  startUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;
  onUpdateAvailable: (callback: (info: any) => void) => () => void;
  onUpdateDownloaded: (callback: (info: any) => void) => () => void;
  decrementCredits: () => Promise<void>;
  setInitialCredits: (credits: number) => Promise<void>;
  onCreditsUpdated: (callback: (credits: number) => void) => () => void;
  onOutOfCredits: (callback: () => void) => () => void;
  openSettingsPortal: () => Promise<void>;
  getPlatform: () => string;
  openLink: (url: string) => Promise<{ success: boolean; error?: string }>;
  
  // Model selection and configuration methods
  getConfig: () => Promise<Config>;
  updateConfig: (config: Partial<Config>) => Promise<Config>;
  checkApiKey: () => Promise<boolean>;
  validateApiKey: (apiKey: string, provider?: ModelProvider) => Promise<{ valid: boolean; error?: string }>;
  removeListener: (eventName: string, callback: (...args: any[]) => void) => void;
  onApiKeyInvalid: (callback: () => void) => () => void;
  onDeleteLastScreenshot: (callback: () => void) => () => void;
  deleteLastScreenshot: () => Promise<{ success: boolean; error?: string }>;
  
  // Provider and model methods
  getAvailableProviders: () => Promise<Record<string, { name: string, description: string }>>;
  getAvailableModels: (provider: ModelProvider) => Promise<Array<{ id: string, name: string, description: string }>>;
  
  // Interview mode methods
  getInterviewModes: () => Promise<Array<{ id: string, name: string, description: string }>>;
  setInterviewMode: (mode: string) => Promise<{ success: boolean }>;
  getInterviewMode: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    electron: {
      ipcRenderer: {
        on: (channel: string, func: (...args: any[]) => void) => void;
        removeListener: (
          channel: string,
          func: (...args: any[]) => void
        ) => void;
      }
    };
    __CREDITS__: number;
    __LANGUAGE__: string;
    __IS_INITIALIZED__: boolean;
    __AUTH_TOKEN__?: string | null;
  }
}