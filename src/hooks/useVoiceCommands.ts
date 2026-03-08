import { useEffect, useRef, useCallback, useState } from 'react';
import { speak } from '@/lib/speech';
import type { VoiceLang } from '@/contexts/LanguageContext';

export interface VoiceCommand {
  patterns: string[];        // lowercase phrases to match (partial match)
  action: () => void;
  description: string;       // English description for help
  descriptionTa: string;     // Tamil description for help
}

interface UseVoiceCommandsOptions {
  lang: VoiceLang;
  commands: VoiceCommand[];
  enabled: boolean;
}

export interface VoiceCommandState {
  listening: boolean;
  lastTranscript: string;
  lastMatchedCommand: string | null;
  supported: boolean;
  toggle: () => void;
  stop: () => void;
}

// SpeechRecognition browser type shim
const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function useVoiceCommands({
  lang,
  commands,
  enabled,
}: UseVoiceCommandsOptions): VoiceCommandState {
  const [listening, setListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastMatchedCommand, setLastMatchedCommand] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(false);
  const commandsRef = useRef(commands);
  const langRef = useRef(lang);

  // Keep refs in sync without restarting recognition
  useEffect(() => { commandsRef.current = commands; }, [commands]);
  useEffect(() => { langRef.current = lang; }, [lang]);

  const supported = !!SpeechRecognition;

  const createRecognition = useCallback(() => {
    if (!SpeechRecognition) return null;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = langRef.current === 'ta-IN' ? 'ta-IN' : 'en-US';
    rec.maxAlternatives = 3;

    rec.onresult = (event: any) => {
      const results = event.results;
      for (let i = event.resultIndex; i < results.length; i++) {
        if (!results[i].isFinal) continue;
        // Collect all alternatives
        const transcripts: string[] = [];
        for (let j = 0; j < results[i].length; j++) {
          transcripts.push(results[i][j].transcript.trim().toLowerCase());
        }
        const joined = transcripts.join(' ');
        setLastTranscript(transcripts[0]);

        // Match against commands
        let matched = false;
        for (const cmd of commandsRef.current) {
          if (cmd.patterns.some(p => joined.includes(p))) {
            matched = true;
            const desc = langRef.current === 'ta-IN' ? cmd.descriptionTa : cmd.description;
            setLastMatchedCommand(desc);
            speak(desc, 0.95, langRef.current);
            setTimeout(() => cmd.action(), 300); // slight delay so speak fires first
            break;
          }
        }
        if (!matched && transcripts[0]) {
          const notFound = langRef.current === 'ta-IN'
            ? `"${transcripts[0]}" புரியவில்லை. "உதவி" என்று சொல்லுங்கள்.`
            : `Command "${transcripts[0]}" not recognized. Say "help" for available commands.`;
          setLastMatchedCommand(null);
          speak(notFound, 0.95, langRef.current);
        }
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.warn('SpeechRecognition error:', event.error);
    };

    rec.onend = () => {
      // Auto-restart if we're still supposed to be listening
      if (activeRef.current) {
        try { rec.start(); } catch { /* ignore */ }
      } else {
        setListening(false);
      }
    };

    return rec;
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setLastMatchedCommand(null);
  }, []);

  const toggle = useCallback(() => {
    if (!SpeechRecognition) {
      speak('Voice commands are not supported in this browser. Please use Chrome.', 0.95, langRef.current);
      return;
    }
    if (activeRef.current) {
      stop();
      const msg = langRef.current === 'ta-IN'
        ? 'குரல் கட்டளைகள் நிறுத்தப்பட்டது.'
        : 'Voice commands disabled.';
      speak(msg, 0.95, langRef.current);
    } else {
      const rec = createRecognition();
      if (!rec) return;
      recognitionRef.current = rec;
      activeRef.current = true;
      try {
        rec.start();
        setListening(true);
        const msg = langRef.current === 'ta-IN'
          ? 'குரல் கட்டளைகள் இயக்கப்பட்டது. "உதவி" என்று சொல்லி கட்டளைகளை தெரிந்து கொள்ளுங்கள்.'
          : 'Voice commands active. Say "help" to hear available commands.';
        speak(msg, 0.95, langRef.current);
      } catch (err) {
        activeRef.current = false;
        setListening(false);
        console.error('Could not start recognition:', err);
      }
    }
  }, [createRecognition, stop]);

  // Restart recognition when language changes while listening
  useEffect(() => {
    if (!activeRef.current) return;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    const rec = createRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }
  }, [lang, createRecognition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  return { listening, lastTranscript, lastMatchedCommand, supported, toggle, stop };
}
