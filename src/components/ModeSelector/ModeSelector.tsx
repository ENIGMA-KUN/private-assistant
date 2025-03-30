import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/toast';
import { Button } from '../ui/button';
import { 
  Code, 
  Database, 
  Layout, 
  Network, 
  Terminal,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';

interface ModeSelectorProps {
  currentMode: string;
  onChange: (mode: string) => void;
}

interface InterviewMode {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ currentMode, onChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [modes, setModes] = useState<InterviewMode[]>([]);
  const [infoMode, setInfoMode] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    // Fetch interview modes if needed
    const getModes = async () => {
      try {
        const fetchedModes = await window.electronAPI.getInterviewModes();
        
        // Add icons to the modes
        const modesWithIcons: InterviewMode[] = fetchedModes.map(mode => ({
          ...mode,
          icon: getIconForMode(mode.id)
        }));
        
        setModes(modesWithIcons);
      } catch (error) {
        console.error('Failed to load interview modes:', error);
        
        // Fallback to hardcoded modes
        setModes([
          { 
            id: 'coding', 
            name: 'Coding Algorithms', 
            description: 'Standard coding algorithm problems',
            icon: <Code size={16} />
          },
          { 
            id: 'system_design', 
            name: 'System Design', 
            description: 'System architecture and design questions',
            icon: <Network size={16} />
          },
          { 
            id: 'react', 
            name: 'React Frontend', 
            description: 'React component and UI implementation',
            icon: <Layout size={16} />
          },
          { 
            id: 'sql', 
            name: 'SQL', 
            description: 'Database query and schema design questions',
            icon: <Database size={16} />
          },
          { 
            id: 'linux', 
            name: 'Linux/Kernel', 
            description: 'Command-line and system administration problems',
            icon: <Terminal size={16} />
          },
          { 
            id: 'certification', 
            name: 'Certification Exam', 
            description: 'Multiple choice, fill-in-blank, and other exam formats',
            icon: <CheckSquare size={16} />
          }
        ]);
      }
    };
    
    getModes();
  }, []);

  const getIconForMode = (modeId: string) => {
    switch(modeId) {
      case 'coding':
        return <Code size={16} />;
      case 'system_design':
        return <Network size={16} />;
      case 'react':
        return <Layout size={16} />;
      case 'sql':
        return <Database size={16} />;
      case 'linux':
        return <Terminal size={16} />;
      case 'certification':
        return <CheckSquare size={16} />;
      default:
        return <Code size={16} />;
    }
  };

  const handleModeChange = async (modeId: string) => {
    try {
      // Save interview mode preference
      await window.electronAPI.setInterviewMode(modeId);
      
      // Update local state via parent component
      onChange(modeId);
      
      // Collapse the dropdown
      setIsExpanded(false);
      
      showToast(
        "Mode Updated", 
        `Switched to ${modes.find(m => m.id === modeId)?.name || modeId} mode`, 
        "success"
      );
    } catch (error) {
      console.error('Failed to update interview mode:', error);
      showToast(
        "Error", 
        "Failed to update interview mode", 
        "error"
      );
    }
  };

  const currentModeData = modes.find(m => m.id === currentMode) || modes[0];

  return (
    <div className="relative">
      {/* Current mode display - always visible */}
      <button 
        className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-black/70 border border-white/10 text-white/80 hover:bg-black/90 text-xs transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {currentModeData?.icon}
        <span>{currentModeData?.name || 'Coding Algorithms'}</span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      
      {/* Mode selector dropdown */}
      {isExpanded && (
        <div className="absolute top-full left-0 mt-1 w-56 z-50 bg-black/90 border border-white/10 rounded-lg shadow-lg overflow-hidden">
          <div className="p-1">
            {modes.map(mode => (
              <div key={mode.id} className="relative">
                <button
                  className={`w-full flex items-center gap-2 py-2 px-3 text-left text-xs transition-colors rounded-md ${
                    mode.id === currentMode 
                      ? 'bg-white/15 text-white' 
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                  onClick={() => handleModeChange(mode.id)}
                >
                  {mode.icon}
                  <span>{mode.name}</span>
                  <button
                    className="absolute right-2 text-white/50 hover:text-white/90"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoMode(infoMode === mode.id ? null : mode.id);
                    }}
                  >
                    <Info size={12} />
                  </button>
                </button>
                
                {/* Mode info panel */}
                {infoMode === mode.id && (
                  <div className="mt-1 mb-2 mx-2 p-2 bg-white/5 rounded text-xs text-white/70">
                    {mode.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModeSelector;