// Text-to-Speech utility for accessibility

let voicesLoaded = false;
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  if (voicesLoaded) return Promise.resolve(window.speechSynthesis.getVoices());
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      voicesLoaded = true;
      resolve(voices);
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => {
      voicesLoaded = true;
      resolve(window.speechSynthesis.getVoices());
    };
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
  });
  return voicesPromise;
}

// Eagerly trigger voice loading
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
}

export function speak(text: string, rate = 0.95) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.volume = 1;
  loadVoices().then((voices) => {
    const enVoice = voices.find(v => v.lang.startsWith('en'));
    if (enVoice) utterance.voice = enVoice;
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Builds a natural language summary from detected object names.
 * e.g. ["dog","dog","person"] → "2 dogs and 1 person detected"
 */
export function buildDetectionSummary(names: string[]): string {
  if (names.length === 0) return '';

  // Count occurrences
  const counts: Record<string, number> = {};
  for (const name of names) {
    counts[name] = (counts[name] ?? 0) + 1;
  }

  // Simple pluralisation
  const pluralise = (word: string, n: number): string => {
    if (n === 1) return word;
    // Basic rules
    if (word.endsWith('s') || word.endsWith('sh') || word.endsWith('ch') || word.endsWith('x') || word.endsWith('z')) {
      return word + 'es';
    }
    if (word.endsWith('y') && !/[aeiou]y$/.test(word)) {
      return word.slice(0, -1) + 'ies';
    }
    return word + 's';
  };

  const parts = Object.entries(counts).map(([name, count]) => {
    return `${count} ${pluralise(name, count)}`;
  });

  if (parts.length === 1) return `${parts[0]} detected`;
  const last = parts.pop();
  return `${parts.join(', ')} and ${last} detected`;
}
