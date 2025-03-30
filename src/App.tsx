import SubscribedApp from "./_pages/SubscribedApp"
import { UpdateNotification } from "./components/UpdateNotification"
import {
  QueryClient,
  QueryClientProvider
} from "@tanstack/react-query"
import { useEffect, useState, useCallback } from "react"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from "./components/ui/toast"
import { ToastContext } from "./contexts/toast"
import { WelcomeScreen } from "./components/WelcomeScreen"
import { SettingsDialog } from "./components/Settings/SettingsDialog"
import ModeSelector from "./components/ModeSelector/ModeSelector"

// Create a React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: Infinity,
      retry: 1,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: 1
    }
  }
})

// Root component that provides the QueryClient
function App() {
  const [toastState, setToastState] = useState({
    open: false,
    title: "",
    description: "",
    variant: "neutral" as const
  })
  const [credits, setCredits] = useState<number>(999) // Unlimited credits
  const [currentLanguage, setCurrentLanguage] = useState<string>("python")
  const [interviewMode, setInterviewMode] = useState<string>("coding")
  const [isInitialized, setIsInitialized] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [providerInfo, setProviderInfo] = useState<{
    provider: string;
    model: string;
  }>({ provider: 'openai', model: 'gpt-4o' })

  // Set unlimited credits
  const updateCredits = useCallback(() => {
    setCredits(999) // No credit limit in this version
    window.__CREDITS__ = 999
  }, [])

  // Helper function to safely update language
  const updateLanguage = useCallback((newLanguage: string) => {
    setCurrentLanguage(newLanguage)
    window.__LANGUAGE__ = newLanguage
  }, [])

  // Helper function to update interview mode
  const updateInterviewMode = useCallback((newMode: string) => {
    setInterviewMode(newMode)
  }, [])

  // Helper function to mark initialization complete
  const markInitialized = useCallback(() => {
    setIsInitialized(true)
    window.__IS_INITIALIZED__ = true
  }, [])

  // Show toast method
  const showToast = useCallback(
    (
      title: string,
      description: string,
      variant: "neutral" | "success" | "error"
    ) => {
      setToastState({
        open: true,
        title,
        description,
        variant
      })
    },
    []
  )

  // Check for API key and load configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Check for API key
        const hasKey = await window.electronAPI.checkApiKey()
        setHasApiKey(hasKey)
        
        // Load config including language and mode
        const config = await window.electronAPI.getConfig()
        
        // Set provider info
        setProviderInfo({
          provider: config.activeProvider || 'openai',
          model: config.providers[config.activeProvider || 'openai']?.model || 'gpt-4o'
        })
        
        // Load language preference
        if (config && config.language) {
          updateLanguage(config.language)
        } else {
          updateLanguage("python")
        }
        
        // Load interview mode
        if (config && config.interviewMode) {
          setInterviewMode(config.interviewMode)
        } else {
          setInterviewMode("coding")
        }
        
        // If no API key is found, show the settings dialog after a short delay
        if (!hasKey) {
          setTimeout(() => {
            setIsSettingsOpen(true)
          }, 1000)
        }
      } catch (error) {
        console.error("Failed to load config:", error)
      }
    }
    
    if (isInitialized) {
      loadConfig()
    }
  }, [isInitialized, updateLanguage])

  // Initialize dropdown handler
  useEffect(() => {
    if (isInitialized) {
      // Process all types of dropdown elements with a shorter delay
      const timer = setTimeout(() => {
        // Find both native select elements and custom dropdowns
        const selectElements = document.querySelectorAll('select');
        const customDropdowns = document.querySelectorAll('.dropdown-trigger, [role="combobox"], button:has(.dropdown)');
        
        // Enable native selects
        selectElements.forEach(dropdown => {
          dropdown.disabled = false;
        });
        
        // Enable custom dropdowns by removing any disabled attributes
        customDropdowns.forEach(dropdown => {
          if (dropdown instanceof HTMLElement) {
            dropdown.removeAttribute('disabled');
            dropdown.setAttribute('aria-disabled', 'false');
          }
        });
        
        console.log(`Enabled ${selectElements.length} select elements and ${customDropdowns.length} custom dropdowns`);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isInitialized]);

  // Listen for settings dialog open requests
  useEffect(() => {
    const unsubscribeSettings = window.electronAPI.onShowSettings(() => {
      console.log("Show settings dialog requested");
      setIsSettingsOpen(true);
    });
    
    return () => {
      unsubscribeSettings();
    };
  }, []);

  // Initialize basic app state
  useEffect(() => {
    // Set unlimited credits and initialize
    const initializeApp = async () => {
      try {
        // Set unlimited credits
        updateCredits()
        markInitialized()
      } catch (error) {
        console.error("Failed to initialize app:", error)
        markInitialized()
      }
    }
    
    initializeApp()

    // Event listeners for process events
    const onApiKeyInvalid = () => {
      showToast(
        "API Key Invalid",
        "Your API key appears to be invalid or has insufficient credits",
        "error"
      )
      setIsSettingsOpen(true)
    }

    // Setup API key invalid listener
    window.electronAPI.onApiKeyInvalid(onApiKeyInvalid)

    // Define a no-op handler for solution success
    const unsubscribeSolutionSuccess = window.electronAPI.onSolutionSuccess(
      () => {
        console.log("Solution success - no credits deducted in this version")
        // No credit deduction in this version
      }
    )

    // Cleanup function
    return () => {
      window.electronAPI.removeListener("API_KEY_INVALID", onApiKeyInvalid)
      unsubscribeSolutionSuccess()
      window.__IS_INITIALIZED__ = false
      setIsInitialized(false)
    }
  }, [updateCredits, updateLanguage, markInitialized, showToast])

  // Settings dialog management
  const handleOpenSettings = useCallback(() => {
    console.log('Opening settings dialog');
    setIsSettingsOpen(true);
  }, []);
  
  const handleCloseSettings = useCallback((open: boolean) => {
    console.log('Settings dialog state changed:', open);
    setIsSettingsOpen(open);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ToastContext.Provider value={{ showToast }}>
          <div className="relative">
            {isInitialized ? (
              hasApiKey ? (
                <div className="flex flex-col">
                  {/* Show model info and mode selector in a header bar */}
                  <div className="bg-black/50 border-b border-white/10 px-4 py-2 flex justify-between items-center">
                    <ModeSelector 
                      currentMode={interviewMode}
                      onChange={updateInterviewMode}
                    />
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-white/70 bg-black/50 px-3 py-1 rounded-lg border border-white/10">
                        <span className="capitalize">{providerInfo.provider}</span>: {providerInfo.model.split('-')[0]}
                      </div>
                      <button 
                        className="text-white/60 hover:text-white/90 transition-colors"
                        onClick={handleOpenSettings}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <SubscribedApp
                    credits={credits}
                    currentLanguage={currentLanguage}
                    setLanguage={updateLanguage}
                    interviewMode={interviewMode}
                  />
                </div>
              ) : (
                <WelcomeScreen onOpenSettings={handleOpenSettings} />
              )
            ) : (
              <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
                  <p className="text-white/60 text-sm">
                    Initializing...
                  </p>
                </div>
              </div>
            )}
            <UpdateNotification />
          </div>
          
          {/* Settings Dialog */}
          <SettingsDialog 
            open={isSettingsOpen} 
            onOpenChange={handleCloseSettings} 
          />
          
          <Toast
            open={toastState.open}
            onOpenChange={(open) =>
              setToastState((prev) => ({ ...prev, open }))
            }
            variant={toastState.variant}
            duration={1500}
          >
            <ToastTitle>{toastState.title}</ToastTitle>
            <ToastDescription>{toastState.description}</ToastDescription>
          </Toast>
          <ToastViewport />
        </ToastContext.Provider>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App