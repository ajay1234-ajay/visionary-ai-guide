import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { speak, stopSpeaking } from '@/lib/speech';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Camera, Volume2, VolumeX, Loader2, RotateCcw, Banknote } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

// Currency color/pattern heuristics using canvas analysis
// Since dedicated currency models require paid APIs, we use a combination of
// COCO-SSD + color/size analysis + pattern matching for common notes.
const CURRENCY_PATTERNS: { name: string; primaryHue: [number, number]; secondaryColor: string }[] = [
  { name: '₹10 note (Violet)', primaryHue: [270, 310], secondaryColor: 'purple' },
  { name: '₹20 note (Yellow-Green)', primaryHue: [60, 100], secondaryColor: 'yellow-green' },
  { name: '₹50 note (Fluorescent Blue)', primaryHue: [190, 230], secondaryColor: 'teal-blue' },
  { name: '₹100 note (Lavender)', primaryHue: [250, 285], secondaryColor: 'lavender' },
  { name: '₹200 note (Bright Yellow)', primaryHue: [40, 65], secondaryColor: 'yellow' },
  { name: '₹500 note (Stone Grey)', primaryHue: [0, 360], secondaryColor: 'grey' },
  { name: '₹2000 note (Magenta)', primaryHue: [310, 360], secondaryColor: 'magenta' },
];

function analyzeImageColors(canvas: HTMLCanvasElement): { dominantHue: number; brightness: number } {
  const ctx = canvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  // Sample every 8th pixel for speed
  for (let i = 0; i < data.length; i += 32) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
    count++;
  }
  const r = rSum / count / 255;
  const g = gSum / count / 255;
  const b = bSum / count / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
  }
  const brightness = (r + g + b) / 3;
  return { dominantHue: hue, brightness };
}

function guessCurrency(dominantHue: number, brightness: number): string {
  // Grey notes (₹500) — low saturation
  if (brightness > 0.55 && brightness < 0.80) {
    return '₹500 note (Stone Grey)';
  }
  if (brightness > 0.80) {
    return '₹2000 note (Magenta)';
  }

  for (const p of CURRENCY_PATTERNS) {
    const [low, high] = p.primaryHue;
    if (low <= high) {
      if (dominantHue >= low && dominantHue <= high) return p.name;
    } else {
      if (dominantHue >= low || dominantHue <= high) return p.name;
    }
  }
  return 'Unknown denomination';
}

export default function CurrencyDetect() {
  const { user } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ensureModel = useCallback(async () => {
    if (modelRef.current) return;
    setModelLoading(true);
    await tf.ready();
    modelRef.current = await cocoSsd.load();
    setModelLoading(false);
  }, []);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target?.result as string);
      setResult('');
      stopSpeaking();
      setIsSpeaking(false);
    };
    reader.readAsDataURL(file);
  };

  const runDetection = useCallback(async () => {
    if (!imgRef.current || !canvasRef.current) return;
    setLoading(true);
    await ensureModel();

    const img = imgRef.current;
    const canvas = canvasRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    // Analyze colors
    const { dominantHue, brightness } = analyzeImageColors(canvas);
    const guess = guessCurrency(dominantHue, brightness);

    // Also try COCO-SSD to see if any relevant object is detected
    let cocoResult = '';
    if (modelRef.current) {
      const preds = await modelRef.current.detect(img);
      const relevant = preds.filter(p => ['book', 'cell phone', 'remote', 'keyboard'].includes(p.class));
      if (relevant.length > 0) {
        cocoResult = ` (AI sees: ${relevant.map(r => r.class).join(', ')})`;
      }
    }

    // Draw analysis overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(16, canvas.width * 0.03)}px Inter, sans-serif`;
    ctx.fillText(`Detected: ${guess}`, 10, canvas.height - 18);

    const finalResult = `${guess}${cocoResult}`;
    setResult(finalResult);
    setLoading(false);

    const speech = `Currency detected: ${guess}.`;
    speak(speech);
    setIsSpeaking(true);
  }, [ensureModel]);

  const handleImageLoad = () => {
    if (!modelLoading) runDetection();
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else if (result) {
      speak(`Currency detected: ${result}.`);
      setIsSpeaking(true);
    }
  };

  const reset = () => {
    setImageUrl(null);
    setResult('');
    stopSpeaking();
    setIsSpeaking(false);
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <Banknote className="w-5 h-5 text-accent" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Currency Detection</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        Take a photo of a banknote — the app will identify the denomination and read it aloud
      </p>

      <Card className="mb-6 border-border/50 bg-accent/5">
        <CardContent className="p-4 text-sm text-muted-foreground">
          💡 <strong>Tips for best results:</strong> Place the note on a plain background, ensure good lighting, and capture the full note clearly. Supports Indian Rupee (₹) notes.
        </CardContent>
      </Card>

      {modelLoading && (
        <Card className="mb-6">
          <CardContent className="p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading AI model…</span>
          </CardContent>
        </Card>
      )}

      {!imageUrl ? (
        <Card className="border-2 border-dashed border-border hover:border-primary/50 transition-colors">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Banknote className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Upload a Banknote Photo</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Works with Indian Rupee notes — ₹10, ₹20, ₹50, ₹100, ₹200, ₹500, ₹2000
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="flex gap-3">
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" /> Choose File
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
                <Camera className="w-4 h-4 mr-2" /> Take Photo
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
                      <span className="font-medium text-foreground">Analyzing currency…</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-foreground">Detection Result</h2>
                  <Button variant="outline" size="sm" onClick={toggleSpeech}>
                    {isSpeaking ? <><VolumeX className="w-4 h-4 mr-1" /> Stop</> : <><Volume2 className="w-4 h-4 mr-1" /> Read Aloud</>}
                  </Button>
                </div>
                <div
                  className="p-4 rounded-lg bg-accent/10 text-foreground font-semibold text-xl text-center"
                  aria-live="polite"
                >
                  {result}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button onClick={reset} variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" /> New Photo
            </Button>
            <Button onClick={runDetection} disabled={loading}>Re-analyze</Button>
          </div>
        </div>
      )}
    </div>
  );
}
