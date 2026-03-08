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

export function speak(text: string, rate = 0.95, lang = 'en-US') {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.lang = lang;
  loadVoices().then((voices) => {
    // Try exact lang match first, then prefix match
    const voice =
      voices.find(v => v.lang === lang) ||
      voices.find(v => v.lang.startsWith(lang.split('-')[0]));
    if (voice) utterance.voice = voice;
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
export function buildDetectionSummary(names: string[], lang = 'en-US'): string {
  if (names.length === 0) return '';

  // Count occurrences
  const counts: Record<string, number> = {};
  for (const name of names) {
    counts[name] = (counts[name] ?? 0) + 1;
  }

  if (lang === 'ta-IN') {
    // Tamil summary: "<count> <name> கண்டறியப்பட்டது"
    const parts = Object.entries(counts).map(([name, count]) => `${count} ${name}`);
    if (parts.length === 1) return `${parts[0]} கண்டறியப்பட்டது`;
    const last = parts.pop();
    return `${parts.join(', ')} மற்றும் ${last} கண்டறியப்பட்டது`;
  }

  // Simple pluralisation for English
  const pluralise = (word: string, n: number): string => {
    if (n === 1) return word;
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

/**
 * Returns a proximity warning string in the given language.
 */
export function buildProximityWarning(names: string[], lang = 'en-US'): string {
  const summary = buildDetectionSummary(names, lang);
  if (!summary) return '';
  if (lang === 'ta-IN') {
    return `எச்சரிக்கை! ${summary} மிக நெருக்கமாக உள்ளது.`;
  }
  return `Warning! ${summary} very close ahead.`;
}
