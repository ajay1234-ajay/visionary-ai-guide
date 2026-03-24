/**
 * usePageVoiceCommands
 *
 * A lightweight, self-contained in-page speech-recognition hook.
 * Each page declares its own command map; the hook handles the
 * recognition loop, auto-restart on end, and cleanup on unmount.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { speak } from '@/lib/speech';

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export interface PageCommand {
  patterns: string[];
  action: () => void;
  confirmEn: string;
  confirmTa: string;
}

interface Options {
  lang: string;
  commands: PageCommand[];
  /** Spoken when listening starts (English) */
  activateMessageEn: string;
  /** Spoken when listening starts (Tamil) */
  activateMessageTa: string;
}

export function usePageVoiceCommands({ lang, commands, activateMessageEn, activateMessageTa }: Options) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recRef = useRef<any>(null);
  const activeRef = useRef(false);
  const commandsRef = useRef(commands);
  const langRef = useRef(lang);

  useEffect(() => { commandsRef.current = commands; }, [commands]);
  useEffect(() => { langRef.current = lang; }, [lang]);

  const isTamil = () => langRef.current === 'ta-IN';

  const handleResult = useCallback((event: any) => {
    const results = event.results;
    for (let i = event.resultIndex; i < results.length; i++) {
      if (!results[i].isFinal) continue;
      const transcripts: string[] = [];
      for (let j = 0; j < results[i].length; j++) {
        transcripts.push(results[i][j].transcript.trim().toLowerCase());
      }
      const joined = transcripts.join(' ');
      setTranscript(transcripts[0] ?? '');

      let matched = false;
      for (const cmd of commandsRef.current) {
        if (cmd.patterns.some(p => joined.includes(p))) {
          matched = true;
          const confirm = isTamil() ? cmd.confirmTa : cmd.confirmEn;
          speak(confirm, 0.95, langRef.current);
          setTimeout(cmd.action, 350);
          break;
        }
      }
      if (!matched && transcripts[0]) {
        const notFound = isTamil()
          ? `"${transcripts[0]}" புரியவில்லை. "உதவி" என்று சொல்லுங்கள்.`
          : `"${transcripts[0]}" not recognized. Say "help" for commands.`;
        speak(notFound, 0.95, langRef.current);
      }
    }
  }, []);

  const createRec = useCallback(() => {
    if (!SpeechRecognitionAPI) return null;
    const rec = new SpeechRecognitionAPI();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = lang === 'ta-IN' ? 'ta-IN' : 'en-US';
    rec.maxAlternatives = 3;
    rec.onresult = handleResult;
    rec.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') console.warn('voice cmd error:', e.error);
    };
    rec.onend = () => {
      if (activeRef.current) { try { rec.start(); } catch { /* ignore */ } }
      else { setListening(false); }
    };
    return rec;
  }, [lang, handleResult]);

  const start = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      speak('Speech recognition is not supported. Please use Chrome.', 0.95, lang);
      return;
    }
    const rec = createRec();
    if (!rec) return;
    recRef.current = rec;
    activeRef.current = true;
    try {
      rec.start();
      setListening(true);
      const msg = lang === 'ta-IN' ? activateMessageTa : activateMessageEn;
      speak(msg, 0.95, lang);
    } catch {
      activeRef.current = false;
    }
  }, [createRec, lang, activateMessageEn, activateMessageTa]);

  const stop = useCallback(() => {
    activeRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
    const msg = lang === 'ta-IN' ? 'குரல் கட்டளைகள் நிறுத்தப்பட்டது.' : 'Voice commands stopped.';
    speak(msg, 0.95, lang);
  }, [lang]);

  const toggle = useCallback(() => {
    if (listening) stop(); else start();
  }, [listening, start, stop]);

  // Restart when language changes mid-session
  useEffect(() => {
    if (!activeRef.current) return;
    recRef.current?.stop();
    recRef.current = null;
    const rec = createRec();
    if (!rec) return;
    recRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }
  }, [lang, createRec]);

  // Cleanup on unmount
  useEffect(() => () => {
    activeRef.current = false;
    recRef.current?.stop();
  }, []);

  return {
    listening,
    transcript,
    supported: !!SpeechRecognitionAPI,
    toggle,
    stop,
  };
}
