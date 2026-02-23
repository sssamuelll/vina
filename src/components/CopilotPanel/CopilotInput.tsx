import { Mic } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { type AgentLanguage } from '../../copilot/languageDetection';
import { loadLanguagePreference } from '../../copilot/AgentSettings';

/** Quick action chips for mobile */
const QUICK_ACTIONS: Record<AgentLanguage, Array<{ label: string; text: string }>> = {
  es: [
    { label: 'Nuevo corpiño', text: 'Crear un corpiño base talla 40' },
    { label: 'Agregar manga', text: 'Agregar manga al corpiño' },
    { label: 'Gradar', text: 'Gradar todas las tallas' },
    { label: 'Anidar', text: 'Anidar las piezas en tela' },
    { label: 'Exportar DXF', text: 'Exportar proyecto como DXF' },
  ],
  en: [
    { label: 'New bodice', text: 'Create a basic bodice block size 40' },
    { label: 'Add sleeve', text: 'Add sleeve to the bodice' },
    { label: 'Grade', text: 'Grade all sizes' },
    { label: 'Nest', text: 'Nest the pieces on fabric' },
    { label: 'Export DXF', text: 'Export project as DXF' },
  ],
};

function getLocalizedQuickActions(): Array<{ label: string; text: string }> {
  const langPref = loadLanguagePreference();
  if (langPref === 'es' || langPref === 'en') {
    return QUICK_ACTIONS[langPref];
  }
  return QUICK_ACTIONS.es;
}

interface CopilotInputProps {
  input: string;
  isLoading: boolean;
  isOpen: boolean;
  hasConnection: boolean;
  offline: boolean;
  isMobile: boolean;
  showSettings: boolean;
  sessionCostLabel: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onSendText: (text: string) => void;
}

export default function CopilotInput({
  input,
  isLoading,
  isOpen,
  hasConnection,
  offline,
  isMobile,
  showSettings,
  sessionCostLabel,
  onInputChange,
  onSend,
  onSendText,
}: CopilotInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const [hasRecognition, setHasRecognition] = useState(false);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Voice input setup
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'es-ES';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          onInputChange(transcript);
        }
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      setHasRecognition(true);
    }
    return () => {
      recognitionRef.current?.abort();
    };
  }, [onInputChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleVoiceToggle = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.abort();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  return (
    <>
      {/* Mobile quick action chips */}
      {isMobile && hasConnection && !showSettings && (
        <div className="copilot-quick-actions">
          {getLocalizedQuickActions().map(qa => (
            <button
              key={qa.label}
              className="copilot-quick-chip"
              onClick={() => onSendText(qa.text)}
              disabled={isLoading}
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* Footer with cost display */}
      {sessionCostLabel && !showSettings && (
        <div className="copilot-cost-footer">
          {sessionCostLabel}
        </div>
      )}

      <div className="copilot-input-area">
        {hasRecognition && (
          <button
            className={`copilot-btn-sm copilot-voice-btn ${isListening ? 'listening' : ''}`}
            onClick={handleVoiceToggle}
            title="Voice input"
          >
            <Mic size={14} style={isListening ? { color: 'var(--accent)' } : undefined} />
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          className="copilot-input"
          placeholder={hasConnection ? "Type a message..." : offline ? "Quick action or connect provider..." : "Connect a provider in Settings..."}
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="copilot-send"
          onClick={onSend}
          disabled={!input.trim() || isLoading}
        >
          →
        </button>
      </div>
    </>
  );
}
