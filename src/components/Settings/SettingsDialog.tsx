import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Settings } from "lucide-react";
import { useToast } from "../../contexts/toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

interface SettingsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsDialog({ open: externalOpen, onOpenChange }: SettingsDialogProps) {
  const [open, setOpen] = useState(externalOpen || false);
  const [activeTab, setActiveTab] = useState('general');
  const [activeProvider, setActiveProvider] = useState<string>('openai');
  
  // General settings
  const [language, setLanguage] = useState("python");
  const [interviewMode, setInterviewMode] = useState("coding");
  const [launchMode, setLaunchMode] = useState<'visible' | 'invisible'>('invisible');
  
  // OpenAI settings
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  
  // Claude settings
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [claudeModel, setClaudeModel] = useState("claude-3-sonnet-20240229");
  
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const { showToast } = useToast();

  // Sync with external open state
  useEffect(() => {
    if (externalOpen !== undefined) {
      setOpen(externalOpen);
    }
  }, [externalOpen]);

  // Handle open state changes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    // Only call onOpenChange when there's actually a change
    if (onOpenChange && newOpen !== externalOpen) {
      onOpenChange(newOpen);
    }
  };
  
  // Load current config on dialog open
  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open]);
  
  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const config = await window.electronAPI.getConfig();
      
      // Set general settings
      setLanguage(config.language || "python");
      setInterviewMode(config.interviewMode || "coding");
      setLaunchMode(config.launchMode || "invisible");
      
      // Set active provider
      setActiveProvider(config.activeProvider || "openai");
      
      // Set provider-specific settings
      if (config.providers) {
        // OpenAI
        if (config.providers.openai) {
          setOpenaiApiKey(config.providers.openai.apiKey || "");
          setOpenaiModel(config.providers.openai.model || "gpt-4o");
        }
        
        // Claude
        if (config.providers.claude) {
          setClaudeApiKey(config.providers.claude.apiKey || "");
          setClaudeModel(config.providers.claude.model || "claude-3-sonnet-20240229");
        }
      }
      
      // Set active tab based on provider if on models tab
      if (activeTab === 'models') {
        setActiveTab(config.activeProvider || 'openai');
      }
    } catch (error) {
      console.error("Failed to load config:", error);
      showToast("Error", "Failed to load settings", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Build the config object
      const config = {
        activeProvider,
        providers: {
          openai: {
            apiKey: openaiApiKey,
            model: openaiModel
          },
          claude: {
            apiKey: claudeApiKey,
            model: claudeModel
          }
        },
        language,
        interviewMode,
        launchMode
      };
      
      const result = await window.electronAPI.updateConfig(config);
      
      if (result) {
        showToast("Success", "Settings saved successfully", "success");
        handleOpenChange(false);
        
        // Force reload the app to apply the new settings
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      showToast("Error", "Failed to save settings", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Validate API key for selected provider
  const validateApiKey = async (provider: string, apiKey: string) => {
    if (!apiKey) {
      showToast("Error", `Please enter an API key for ${provider}`, "error");
      return false;
    }
    
    setIsValidating(true);
    try {
      const result = await window.electronAPI.validateApiKey(apiKey, provider);
      
      if (result.valid) {
        showToast("Success", `${provider} API key is valid`, "success");
        return true;
      } else {
        showToast("Error", result.error || `Invalid ${provider} API key`, "error");
        return false;
      }
    } catch (error) {
      console.error(`Error validating ${provider} API key:`, error);
      showToast("Error", `Failed to validate ${provider} API key`, "error");
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  // Mask API key for display
  const maskApiKey = (key: string) => {
    if (!key || key.length < 10) return "";
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  // Open external link handler
  const openExternalLink = (url: string) => {
    window.electronAPI.openLink(url);
  };
  
  // Get available models for a provider
  const getModels = (provider: string) => {
    switch (provider) {
      case 'openai':
        return [
          { id: 'gpt-4o', name: 'GPT-4o', description: 'Best overall performance, supports images' },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster, more cost-effective option' },
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
  };
  
  // Get interview modes
  const getInterviewModes = () => {
    return [
      { id: 'coding', name: 'Coding Algorithms', description: 'Standard coding algorithm problems' },
      { id: 'system_design', name: 'System Design', description: 'System architecture and design questions' },
      { id: 'react', name: 'React Frontend', description: 'React component and UI implementation' },
      { id: 'sql', name: 'SQL', description: 'Database query and schema design questions' },
      { id: 'linux', name: 'Linux/Kernel', description: 'Command-line and system administration problems' },
      { id: 'certification', name: 'Certification Exam', description: 'Multiple choice, fill-in-blank, and other exam formats' }
    ];
  };
  
  // Get programming languages
  const getProgrammingLanguages = () => {
    return [
      { id: 'python', name: 'Python' },
      { id: 'javascript', name: 'JavaScript' },
      { id: 'typescript', name: 'TypeScript' },
      { id: 'java', name: 'Java' },
      { id: 'cpp', name: 'C++' },
      { id: 'csharp', name: 'C#' },
      { id: 'golang', name: 'Go' },
      { id: 'swift', name: 'Swift' },
      { id: 'rust', name: 'Rust' },
      { id: 'kotlin', name: 'Kotlin' },
      { id: 'ruby', name: 'Ruby' },
      { id: 'php', name: 'PHP' },
      { id: 'sql', name: 'SQL' }
    ];
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md bg-black border border-white/10 text-white settings-dialog overflow-y-auto"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(500px, 90vw)',
          height: 'auto',
          maxHeight: '90vh',
          margin: 0,
          padding: '20px',
          zIndex: 9999,
          animation: 'fadeIn 0.25s ease forwards',
          opacity: 0.98
        }}
      >
        <DialogHeader>
          <DialogTitle>Application Settings</DialogTitle>
          <DialogDescription className="text-white/70">
            Configure your AI providers, models, and preferences
          </DialogDescription>
        </DialogHeader>
        
        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="mt-4"
        >
          <TabsList className="bg-black/50 border border-white/10 w-full grid grid-cols-3">
            <TabsTrigger 
              value="general" 
              className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              General
            </TabsTrigger>
            <TabsTrigger 
              value="models" 
              className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              AI Models
            </TabsTrigger>
            <TabsTrigger 
              value="shortcuts" 
              className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              Shortcuts
            </TabsTrigger>
          </TabsList>
          
          {/* General Settings Tab */}
          <TabsContent value="general" className="space-y-4 py-4">
            {/* Interview Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white" htmlFor="interviewMode">
                Interview Mode
              </label>
              <select
                id="interviewMode"
                value={interviewMode}
                onChange={(e) => setInterviewMode(e.target.value)}
                className="w-full bg-black/50 border border-white/10 text-white rounded px-3 py-2 text-sm"
              >
                {getInterviewModes().map(mode => (
                  <option key={mode.id} value={mode.id} className="bg-black text-white">
                    {mode.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-white/50">
                Select the type of interview you're preparing for
              </p>
            </div>
            
            {/* Programming Language */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white" htmlFor="language">
                Programming Language
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-black/50 border border-white/10 text-white rounded px-3 py-2 text-sm"
              >
                {getProgrammingLanguages().map(lang => (
                  <option key={lang.id} value={lang.id} className="bg-black text-white">
                    {lang.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-white/50">
                Your preferred programming language for solutions
              </p>
            </div>
            
            {/* Launch Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">
                Launch Mode
              </label>
              <div className="flex gap-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={launchMode === 'invisible'}
                    onChange={() => setLaunchMode('invisible')}
                    className="form-radio text-blue-600"
                  />
                  <span className="text-sm text-white/90">Invisible</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={launchMode === 'visible'}
                    onChange={() => setLaunchMode('visible')}
                    className="form-radio text-blue-600"
                  />
                  <span className="text-sm text-white/90">Visible</span>
                </label>
              </div>
              <p className="text-xs text-white/50">
                Whether the app starts visible or invisible when launched
              </p>
            </div>
            
            {/* Active AI Provider */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">
                Active AI Provider
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div
                  className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                    activeProvider === 'openai'
                      ? "bg-white/10 border-white/20"
                      : "bg-black/30 border-white/5 hover:bg-white/5"
                  }`}
                  onClick={() => setActiveProvider('openai')}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      activeProvider === 'openai' ? "bg-white" : "bg-white/20"
                    }`} />
                    <div>
                      <p className="font-medium text-white text-xs">OpenAI</p>
                      <p className="text-xs text-white/60">GPT models</p>
                    </div>
                  </div>
                </div>
                <div
                  className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                    activeProvider === 'claude'
                      ? "bg-white/10 border-white/20"
                      : "bg-black/30 border-white/5 hover:bg-white/5"
                  }`}
                  onClick={() => setActiveProvider('claude')}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      activeProvider === 'claude' ? "bg-white" : "bg-white/20"
                    }`} />
                    <div>
                      <p className="font-medium text-white text-xs">Claude</p>
                      <p className="text-xs text-white/60">Anthropic models</p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-white/50">
                The AI provider to use for processing screenshots
              </p>
            </div>
          </TabsContent>
          
          {/* AI Models Tab */}
          <TabsContent value="models" className="space-y-4 py-4">
            <Tabs 
              value={activeProvider} 
              onValueChange={setActiveProvider}
              className="w-full"
            >
              <TabsList className="bg-black/50 border border-white/10 w-full grid grid-cols-2">
                <TabsTrigger 
                  value="openai" 
                  className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white"
                >
                  OpenAI
                </TabsTrigger>
                <TabsTrigger 
                  value="claude" 
                  className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white"
                >
                  Claude
                </TabsTrigger>
              </TabsList>
              
              {/* OpenAI Settings */}
              <TabsContent value="openai" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white" htmlFor="openaiApiKey">
                    OpenAI API Key
                  </label>
                  <Input
                    id="openaiApiKey"
                    type="password"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="bg-black/50 border-white/10 text-white"
                  />
                  {openaiApiKey && (
                    <p className="text-xs text-white/50">
                      Current: {maskApiKey(openaiApiKey)}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => validateApiKey('openai', openaiApiKey)}
                      disabled={isValidating || !openaiApiKey}
                      className="mt-1 text-xs border-white/10 hover:bg-white/5 text-white"
                    >
                      {isValidating ? "Validating..." : "Test Key"}
                    </Button>
                  </div>
                  <div className="mt-2 p-2 rounded-md bg-white/5 border border-white/10">
                    <p className="text-xs text-white/80 mb-1">Get an OpenAI API key:</p>
                    <p className="text-xs text-white/60 mb-1">1. Create an account at <button 
                      onClick={() => openExternalLink('https://platform.openai.com/signup')} 
                      className="text-blue-400 hover:underline cursor-pointer">OpenAI</button>
                    </p>
                    <p className="text-xs text-white/60 mb-1">2. Go to <button 
                      onClick={() => openExternalLink('https://platform.openai.com/api-keys')} 
                      className="text-blue-400 hover:underline cursor-pointer">API Keys</button> section
                    </p>
                    <p className="text-xs text-white/60">3. Create a new secret key and paste it here</p>
                  </div>
                </div>
                
                <div className="space-y-2 mt-4">
                  <label className="text-sm font-medium text-white">
                    OpenAI Model
                  </label>
                  <div className="space-y-2">
                    {getModels('openai').map((model) => (
                      <div
                        key={model.id}
                        className={`p-2 rounded-lg cursor-pointer transition-colors ${
                          openaiModel === model.id
                            ? "bg-white/10 border border-white/20"
                            : "bg-black/30 border border-white/5 hover:bg-white/5"
                        }`}
                        onClick={() => setOpenaiModel(model.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              openaiModel === model.id ? "bg-white" : "bg-white/20"
                            }`}
                          />
                          <div>
                            <p className="font-medium text-white text-xs">{model.name}</p>
                            <p className="text-xs text-white/60">{model.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
              
              {/* Claude Settings */}
              <TabsContent value="claude" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white" htmlFor="claudeApiKey">
                    Claude API Key
                  </label>
                  <Input
                    id="claudeApiKey"
                    type="password"
                    value={claudeApiKey}
                    onChange={(e) => setClaudeApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="bg-black/50 border-white/10 text-white"
                  />
                  {claudeApiKey && (
                    <p className="text-xs text-white/50">
                      Current: {maskApiKey(claudeApiKey)}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => validateApiKey('claude', claudeApiKey)}
                      disabled={isValidating || !claudeApiKey}
                      className="mt-1 text-xs border-white/10 hover:bg-white/5 text-white"
                    >
                      {isValidating ? "Validating..." : "Test Key"}
                    </Button>
                  </div>
                  <div className="mt-2 p-2 rounded-md bg-white/5 border border-white/10">
                    <p className="text-xs text-white/80 mb-1">Get a Claude API key:</p>
                    <p className="text-xs text-white/60 mb-1">1. Create an account at <button 
                      onClick={() => openExternalLink('https://console.anthropic.com/signup')} 
                      className="text-blue-400 hover:underline cursor-pointer">Anthropic</button>
                    </p>
                    <p className="text-xs text-white/60 mb-1">2. Go to <button 
                      onClick={() => openExternalLink('https://console.anthropic.com/settings/keys')} 
                      className="text-blue-400 hover:underline cursor-pointer">API Keys</button> section
                    </p>
                    <p className="text-xs text-white/60">3. Create a new API key and paste it here</p>
                  </div>
                </div>
                
                <div className="space-y-2 mt-4">
                  <label className="text-sm font-medium text-white">
                    Claude Model
                  </label>
                  <div className="space-y-2">
                    {getModels('claude').map((model) => (
                      <div
                        key={model.id}
                        className={`p-2 rounded-lg cursor-pointer transition-colors ${
                          claudeModel === model.id
                            ? "bg-white/10 border border-white/20"
                            : "bg-black/30 border border-white/5 hover:bg-white/5"
                        }`}
                        onClick={() => setClaudeModel(model.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              claudeModel === model.id ? "bg-white" : "bg-white/20"
                            }`}
                          />
                          <div>
                            <p className="font-medium text-white text-xs">{model.name}</p>
                            <p className="text-xs text-white/60">{model.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
          
          {/* Keyboard Shortcuts Tab */}
          <TabsContent value="shortcuts" className="space-y-4 py-4">
            <div className="bg-black/30 border border-white/10 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div className="text-white/70">Toggle Visibility</div>
                <div className="text-white/90 font-mono">Ctrl+B / Cmd+B</div>
                
                <div className="text-white/70">Take Screenshot</div>
                <div className="text-white/90 font-mono">Ctrl+H / Cmd+H</div>
                
                <div className="text-white/70">Process Screenshots</div>
                <div className="text-white/90 font-mono">Ctrl+Enter / Cmd+Enter</div>
                
                <div className="text-white/70">Delete Last Screenshot</div>
                <div className="text-white/90 font-mono">Ctrl+L / Cmd+L</div>
                
                <div className="text-white/70">Reset View</div>
                <div className="text-white/90 font-mono">Ctrl+R / Cmd+R</div>
                
                <div className="text-white/70">Quit Application</div>
                <div className="text-white/90 font-mono">Ctrl+Q / Cmd+Q</div>
                
                <div className="text-white/70">Move Window</div>
                <div className="text-white/90 font-mono">Ctrl+Arrow Keys</div>
                
                <div className="text-white/70">Decrease Opacity</div>
                <div className="text-white/90 font-mono">Ctrl+[ / Cmd+[</div>
                
                <div className="text-white/70">Increase Opacity</div>
                <div className="text-white/90 font-mono">Ctrl+] / Cmd+]</div>
                
                <div className="text-white/70">Zoom Out</div>
                <div className="text-white/90 font-mono">Ctrl+- / Cmd+-</div>
                
                <div className="text-white/70">Reset Zoom</div>
                <div className="text-white/90 font-mono">Ctrl+0 / Cmd+0</div>
                
                <div className="text-white/70">Zoom In</div>
                <div className="text-white/90 font-mono">Ctrl+= / Cmd+=</div>
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <p className="text-xs text-white/80">
                Keyboard shortcuts cannot be customized in this version.
              </p>
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-white/10 hover:bg-white/5 text-white"
          >
            Cancel
          </Button>
          <Button
            className="px-4 py-3 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}