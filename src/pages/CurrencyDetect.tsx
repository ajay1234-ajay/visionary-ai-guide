import { useState, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { speak, stopSpeaking } from '@/lib/speech';
import { usePageVoiceCommands } from '@/hooks/usePageVoiceCommands';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Camera, Volume2, VolumeX, Loader2, RotateCcw, Banknote, Mic, MicOff } from 'lucide-react';

// ─── Indian Rupee denomination profiles ──────────────────────────────────────
// Each note has: dominant hue range, saturation range, brightness range, aspect ratio
// and a confidence weight. Multiple features are scored and summed.
interface NoteProfile {
  name: string;
  en: string;
  ta: string;
  hueRange: [number, number];    // HSV hue 0-360
  satMin: number;                // min saturation 0-1
  satMax: number;
  briMin: number;                // min brightness 0-1
  briMax: number;
  aspectMin: number;             // width/height ratio
  aspectMax: number;
}

const NOTE_PROFILES: NoteProfile[] = [
  {
    name: '₹10',
    en: '₹10 – Violet / Chocolate Brown',
    ta: '₹10 – ஊதா / சாக்லேட் பழுப்பு',
    hueRange: [260, 310], satMin: 0.25, satMax: 1.0,
    briMin: 0.30, briMax: 0.70, aspectMin: 2.0, aspectMax: 2.6,
  },
  {
    name: '₹20',
    en: '₹20 – Yellow-Green',
    ta: '₹20 – மஞ்சள்-பச்சை',
    hueRange: [55, 100], satMin: 0.30, satMax: 1.0,
    briMin: 0.45, briMax: 0.85, aspectMin: 2.0, aspectMax: 2.6,
  },
  {
    name: '₹50',
    en: '₹50 – Fluorescent Blue',
    ta: '₹50 – நீல-பச்சை',
    hueRange: [170, 220], satMin: 0.35, satMax: 1.0,
    briMin: 0.35, briMax: 0.75, aspectMin: 2.0, aspectMax: 2.6,
  },
  {
    name: '₹100',
    en: '₹100 – Lavender',
    ta: '₹100 – இளஞ்சிவப்பு ஊதா',
    hueRange: [245, 285], satMin: 0.15, satMax: 0.80,
    briMin: 0.45, briMax: 0.80, aspectMin: 2.0, aspectMax: 2.6,
  },
  {
    name: '₹200',
    en: '₹200 – Bright Yellow',
    ta: '₹200 – பிரகாசமான மஞ்சள்',
    hueRange: [38, 58], satMin: 0.40, satMax: 1.0,
    briMin: 0.55, briMax: 0.92, aspectMin: 2.0, aspectMax: 2.6,
  },
  {
    name: '₹500',
    en: '₹500 – Stone Grey',
    ta: '₹500 – கல் சாம்பல்',
    hueRange: [0, 360], satMin: 0.0, satMax: 0.20,
    briMin: 0.45, briMax: 0.75, aspectMin: 2.0, aspectMax: 2.6,
  },
  {
    name: '₹2000',
    en: '₹2000 – Magenta Pink',
    ta: '₹2000 – மஜெண்டா இளஞ்சிவப்பு',
    hueRange: [310, 360], satMin: 0.30, satMax: 1.0,
    briMin: 0.45, briMax: 0.85, aspectMin: 2.0, aspectMax: 2.6,
  },
];

// ─── Color analysis ────────────────────────────────────────────────────────
interface ColorFeatures {
  dominantHue: number;
  avgSaturation: number;
  avgBrightness: number;
  hueHistogram: number[]; // 36 buckets × 10° each
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0.001) {
    if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / delta + 2) / 6;
    else h = ((rn - gn) / delta + 4) / 6;
  }
  const s = max < 0.001 ? 0 : delta / max;
  return [h * 360, s, max];
}

function analyzeCanvas(canvas: HTMLCanvasElement): ColorFeatures {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  const histogram = new Array(36).fill(0);
  let satSum = 0, briSum = 0;
  let count = 0;

  // Sample every 4th pixel (stride 16 bytes = 4 channels × 4 pixels)
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [h, s, v] = rgbToHsv(r, g, b);
    if (s > 0.08) {
      // only saturated pixels contribute to hue histogram
      histogram[Math.floor(h / 10) % 36]++;
    }
    satSum += s;
    briSum += v;
    count++;
  }

  // Find dominant hue bucket
  let maxBucket = 0;
  let maxVal = 0;
  for (let i = 0; i < 36; i++) {
    if (histogram[i] > maxVal) { maxVal = histogram[i]; maxBucket = i; }
  }

  return {
    dominantHue: maxBucket * 10 + 5, // centre of bucket
    avgSaturation: satSum / Math.max(count, 1),
    avgBrightness: briSum / Math.max(count, 1),
    hueHistogram: histogram,
  };
}

// ─── Scoring ───────────────────────────────────────────────────────────────
function scoreNote(profile: NoteProfile, features: ColorFeatures, aspectRatio: number): number {
  let score = 0;

  // 1. Hue match (0–40 pts)
  const { dominantHue, avgSaturation, avgBrightness } = features;
  const [hLow, hHigh] = profile.hueRange;
  const inHueRange =
    hLow <= hHigh
      ? dominantHue >= hLow && dominantHue <= hHigh
      : dominantHue >= hLow || dominantHue <= hHigh;
  if (inHueRange) score += 40;
  else {
    // partial credit for being close
    const dist = Math.min(
      Math.abs(dominantHue - hLow),
      Math.abs(dominantHue - hHigh),
      Math.abs(dominantHue - hLow - 360),
      Math.abs(dominantHue - hHigh + 360),
    );
    score += Math.max(0, 40 - dist * 0.8);
  }

  // 2. Saturation match (0–25 pts)
  if (avgSaturation >= profile.satMin && avgSaturation <= profile.satMax) {
    score += 25;
  } else {
    const satDist = Math.min(
      Math.abs(avgSaturation - profile.satMin),
      Math.abs(avgSaturation - profile.satMax),
    );
    score += Math.max(0, 25 - satDist * 80);
  }

  // 3. Brightness match (0–25 pts)
  if (avgBrightness >= profile.briMin && avgBrightness <= profile.briMax) {
    score += 25;
  } else {
    const briDist = Math.min(
      Math.abs(avgBrightness - profile.briMin),
      Math.abs(avgBrightness - profile.briMax),
    );
    score += Math.max(0, 25 - briDist * 80);
  }

  // 4. Aspect ratio match (0–10 pts) – typical note ~2.3:1
  if (aspectRatio >= profile.aspectMin && aspectRatio <= profile.aspectMax) {
    score += 10;
  } else if (aspectRatio > 0) {
    const aspDist = Math.min(
      Math.abs(aspectRatio - profile.aspectMin),
      Math.abs(aspectRatio - profile.aspectMax),
    );
    score += Math.max(0, 10 - aspDist * 10);
  }

  return score;
}

function classifyCurrency(features: ColorFeatures, aspectRatio: number): { result: string; confidence: number } {
  const scored = NOTE_PROFILES.map(p => ({
    profile: p,
    score: scoreNote(p, features, aspectRatio),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  const confidence = Math.round(best.score);
  const margin = best.score - second.score;

  // Low confidence: too ambiguous
  if (best.score < 35 || margin < 8) {
    return { result: 'Unknown denomination', confidence };
  }

  return { result: best.profile.en, confidence };
}

// ─── Component ────────────────────────────────────────────────────────────
export default function CurrencyDetect() {
  const { user } = useAuth();
  const { lang, isTamil } = useLanguage();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{ label: string; confidence: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target?.result as string);
      setResult(null);
      stopSpeaking();
      setIsSpeaking(false);
    };
    reader.readAsDataURL(file);
  };

  const runDetection = useCallback(async () => {
    if (!imgRef.current || !canvasRef.current) return;
    setLoading(true);

    const img = imgRef.current;
    const canvas = canvasRef.current;

    // Wait for natural dimensions
    await new Promise<void>(res => {
      if (img.complete && img.naturalWidth > 0) return res();
      img.onload = () => res();
    });

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const aspectRatio = canvas.width / Math.max(canvas.height, 1);
    const features = analyzeCanvas(canvas);
    const { result: label, confidence } = classifyCurrency(features, aspectRatio);

    // Choose Tamil label if active
    const taLabel = NOTE_PROFILES.find(p => p.en === label)?.ta ?? label;
    const displayLabel = isTamil ? taLabel : label;

    // Draw result overlay
    const barH = Math.max(52, canvas.height * 0.08);
    ctx.fillStyle = 'rgba(0,0,0,0.60)';
    ctx.fillRect(0, canvas.height - barH, canvas.width, barH);

    const fontSize = Math.max(16, canvas.width * 0.032);
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${displayLabel}`, 12, canvas.height - barH + fontSize + 4);

    const confText = `${isTamil ? 'நம்பகத்தன்மை' : 'Confidence'}: ${confidence}%`;
    ctx.font = `${Math.max(12, fontSize * 0.7)}px Inter, sans-serif`;
    ctx.fillStyle = confidence >= 60 ? '#86efac' : confidence >= 40 ? '#fde047' : '#fca5a5';
    ctx.fillText(confText, 12, canvas.height - barH + fontSize * 2 + 8);

    setResult({ label: displayLabel, confidence });
    setLoading(false);

    const speech = isTamil
      ? `கண்டறியப்பட்ட நோட்டு: ${taLabel}. நம்பகத்தன்மை ${confidence} சதவீதம்.`
      : `Detected: ${label}. Confidence ${confidence} percent.`;
    speak(speech, 0.9, lang);
    setIsSpeaking(true);
  }, [isTamil, lang]);

  const handleImageLoad = () => { runDetection(); };

  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else if (result) {
      const speech = isTamil
        ? `கண்டறியப்பட்ட நோட்டு: ${result.label}. நம்பகத்தன்மை ${result.confidence} சதவீதம்.`
        : `Detected: ${result.label}. Confidence ${result.confidence} percent.`;
      speak(speech, 0.9, lang);
      setIsSpeaking(true);
    }
  };

  const reset = useCallback(() => {
    setImageUrl(null);
    setResult(null);
    stopSpeaking();
    setIsSpeaking(false);
  }, []);

  const openFile = useCallback(() => { fileInputRef.current?.click(); }, []);

  const takePhoto = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f); };
    input.click();
  }, []);

  const readResult = useCallback(() => {
    if (!result) {
      speak(isTamil ? 'முதலில் நோட்டின் படம் பதிவேற்றவும்.' : 'Please upload a note image first.', 0.9, lang);
      return;
    }
    const speech = isTamil
      ? `கண்டறியப்பட்ட நோட்டு: ${result.label}. நம்பகத்தன்மை ${result.confidence} சதவீதம்.`
      : `Detected: ${result.label}. Confidence ${result.confidence} percent.`;
    speak(speech, 0.9, lang);
    setIsSpeaking(true);
  }, [result, isTamil, lang]);

  // ─── Voice commands ───────────────────────────────────────────────────────
  const currencyCommands = useMemo(() => [
    {
      patterns: ['upload image', 'choose file', 'select image', 'open file',
                 'படம் பதிவேற்று', 'கோப்பு திற'],
      action: openFile,
      confirmEn: 'Opening file picker.',
      confirmTa: 'கோப்பு திறக்கிறது.',
    },
    {
      patterns: ['take photo', 'capture image', 'use camera', 'open camera',
                 'புகைப்படம் எடு', 'கேமரா திற'],
      action: takePhoto,
      confirmEn: 'Opening camera.',
      confirmTa: 'கேமரா திறக்கிறது.',
    },
    {
      patterns: ['analyze', 'detect', 'detect currency', 'identify note', 'scan note',
                 'நோட்டை பகுப்பாய்', 'கண்டறி', 'ஆய்வு செய்'],
      action: runDetection,
      confirmEn: 'Analyzing currency.',
      confirmTa: 'நோட்டை பகுப்பாய்வு செய்கிறது.',
    },
    {
      patterns: ['read result', 'what is it', 'tell me', 'say result', 'which note',
                 'முடிவு படி', 'என்ன நோட்டு', 'சொல்'],
      action: readResult,
      confirmEn: 'Reading detection result.',
      confirmTa: 'கண்டறிந்த முடிவை படிக்கிறது.',
    },
    {
      patterns: ['clear', 'reset', 'new photo', 'new image', 'start over',
                 'அழி', 'மீட்டமை', 'புதிய படம்'],
      action: reset,
      confirmEn: 'Cleared. Ready for a new photo.',
      confirmTa: 'அழிக்கப்பட்டது. புதிய படத்திற்கு தயாராக உள்ளது.',
    },
    {
      patterns: ['help', 'commands', 'what can i say', 'உதவி', 'கட்டளைகள்'],
      action: () => speak(
        isTamil
          ? 'கட்டளைகள்: படம் பதிவேற்று, புகைப்படம் எடு, கண்டறி, முடிவு படி, அழி'
          : 'Commands: upload image, take photo, analyze, read result, clear.',
        0.88, lang,
      ),
      confirmEn: 'Listing commands.',
      confirmTa: 'கட்டளைகளை அறிவிக்கிறது.',
    },
  ], [openFile, takePhoto, runDetection, readResult, reset, isTamil, lang]);

  const { listening: vcListening, transcript: vcTranscript, supported: vcSupported, toggle: vcToggle } =
    usePageVoiceCommands({
      lang,
      commands: currencyCommands,
      activateMessageEn: 'Currency detection voice commands active. Say "upload image", "analyze", or "help".',
      activateMessageTa: 'நோட்டு கண்டறிதல் குரல் கட்டளைகள் இயக்கப்பட்டது. "படம் பதிவேற்று", "கண்டறி" என்று சொல்லுங்கள்.',
    });

  if (!user) return null;

  const confidenceColor =
    result && result.confidence >= 70
      ? 'text-green-600 dark:text-green-400'
      : result && result.confidence >= 45
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-destructive';

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Banknote className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {isTamil ? 'நோட்டு கண்டறிதல்' : 'Currency Detection'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isTamil
                ? 'நோட்டின் புகைப்படம் எடுக்கவும் — பெயர் மற்றும் மதிப்பு சத்தமாக அறிவிக்கப்படும்'
                : 'Take a photo of a banknote — the denomination will be identified and read aloud'}
            </p>
          </div>
        </div>
        {/* Voice command toggle */}
        {vcSupported && (
          <button
            onClick={vcToggle}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all select-none ${
              vcListening
                ? 'bg-destructive text-destructive-foreground border-destructive shadow-lg shadow-destructive/30 animate-pulse'
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            }`}
            aria-label={vcListening ? 'Stop voice commands' : 'Start voice commands'}
          >
            {vcListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span>{vcListening ? (isTamil ? 'கேட்கிறது…' : 'Listening…') : (isTamil ? 'குரல் கட்டளை' : 'Voice Cmd')}</span>
          </button>
        )}
      </div>

      {/* Transcript bar */}
      {vcListening && vcTranscript && (
        <div className="mb-4 bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-2 flex items-center gap-2 text-xs text-destructive font-medium">
          <Mic className="w-3.5 h-3.5 animate-pulse flex-shrink-0" />
          <span>{isTamil ? 'கேட்டது: ' : 'Heard: '}<em className="not-italic font-semibold">"{vcTranscript}"</em></span>
        </div>
      )}


      <Card className="mb-6 border-border/50 bg-accent/5">
        <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
          <p>💡 <strong>{isTamil ? 'சிறந்த முடிவுகளுக்கு:' : 'Tips for best results:'}</strong></p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>{isTamil ? 'தெளிவான வெளிச்சத்தில் நோட்டை வைக்கவும்' : 'Place the note under good, even lighting'}</li>
            <li>{isTamil ? 'வெள்ளை அல்லது சாம்பல் பின்னணியில் வைக்கவும்' : 'Use a plain white or grey background'}</li>
            <li>{isTamil ? 'நோட்டின் முழு பரப்பையும் படமெடுக்கவும்' : 'Capture the entire note in the frame'}</li>
            <li>{isTamil ? 'மடிக்கப்படாத, நேரான நோட்டு சிறந்தது' : 'Flat, unfolded notes give the best result'}</li>
          </ul>
        </CardContent>
      </Card>

      {!imageUrl ? (
        <Card className="border-2 border-dashed border-border hover:border-primary/50 transition-colors">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Banknote className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {isTamil ? 'நோட்டின் புகைப்படத்தை பதிவேற்றவும்' : 'Upload a Banknote Photo'}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {isTamil
                ? '₹10, ₹20, ₹50, ₹100, ₹200, ₹500, ₹2000 நோட்டுகளை ஆதரிக்கிறது'
                : 'Supports ₹10, ₹20, ₹50, ₹100, ₹200, ₹500, ₹2000 notes'}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="flex gap-3 flex-wrap justify-center">
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {isTamil ? 'கோப்பு தேர்வு' : 'Choose File'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.capture = 'environment';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleFile(file);
                  };
                  input.click();
                }}
              >
                <Camera className="w-4 h-4 mr-2" />
                {isTamil ? 'புகைப்படம் எடு' : 'Take Photo'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt="Currency note for detection"
                  className="hidden"
                  onLoad={handleImageLoad}
                  crossOrigin="anonymous"
                />
                <canvas
                  ref={canvasRef}
                  className="w-full h-auto rounded-lg"
                  aria-label="Detected currency note"
                />
                {loading && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span className="font-medium text-foreground">
                        {isTamil ? 'நோட்டை பகுப்பாய்வு செய்கிறது…' : 'Analyzing currency…'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">
                    {isTamil ? 'கண்டறிந்த முடிவு' : 'Detection Result'}
                  </h2>
                  <Button variant="outline" size="sm" onClick={toggleSpeech}>
                    {isSpeaking
                      ? <><VolumeX className="w-4 h-4 mr-1" />{isTamil ? 'நிறுத்து' : 'Stop'}</>
                      : <><Volume2 className="w-4 h-4 mr-1" />{isTamil ? 'சத்தமாக படி' : 'Read Aloud'}</>}
                  </Button>
                </div>

                <div
                  className="p-4 rounded-lg bg-accent/10 text-foreground font-bold text-2xl text-center"
                  aria-live="polite"
                >
                  {result.label}
                </div>

                {/* Confidence bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{isTamil ? 'நம்பகத்தன்மை' : 'Confidence'}</span>
                    <span className={`font-semibold ${confidenceColor}`}>{result.confidence}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        result.confidence >= 70
                          ? 'bg-green-500'
                          : result.confidence >= 45
                          ? 'bg-yellow-500'
                          : 'bg-destructive'
                      }`}
                      style={{ width: `${Math.min(result.confidence, 100)}%` }}
                    />
                  </div>
                  {result.confidence < 45 && (
                    <p className="text-xs text-destructive">
                      {isTamil
                        ? '⚠️ குறைந்த நம்பகத்தன்மை — நல்ல வெளிச்சத்தில் மீண்டும் முயற்சிக்கவும்'
                        : '⚠️ Low confidence — try again with better lighting or a flatter note'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3 flex-wrap">
            <Button onClick={reset} variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              {isTamil ? 'புதிய புகைப்படம்' : 'New Photo'}
            </Button>
            <Button onClick={runDetection} disabled={loading}>
              {isTamil ? 'மீண்டும் பகுப்பாய்வு' : 'Re-analyze'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
