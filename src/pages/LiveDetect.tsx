import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { speak, stopSpeaking, buildDetectionSummary } from '@/lib/speech';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Video, VideoOff, Volume2, VolumeX, Loader2, AlertTriangle } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

interface DetectedItem {
  name: string;
  confidence: number;
  bbox: [number, number, number, number];
  proximity: 'close' | 'medium' | 'far';
}

const OBSTACLE_CLASSES = new Set([
  'person','car','truck','bus','motorcycle','bicycle','dog','cat',
  'chair','couch','dining table','bed','toilet','refrigerator',
  'oven','microwave','tv','laptop','cell phone','book','bottle',
  'cup','vase','potted plant','suitcase','handbag','backpack',
  'umbrella','traffic light','stop sign','fire hydrant','bench',
]);

function getProximity(
  bbox: [number, number, number, number],
  canvasW: number,
  canvasH: number,
): 'close' | 'medium' | 'far' {
  const area = (bbox[2] * bbox[3]) / (canvasW * canvasH);
  if (area > 0.18) return 'close';
  if (area > 0.06) return 'medium';
  return 'far';
}

function proximityColor(p: 'close' | 'medium' | 'far') {
  if (p === 'close') return 'hsl(0,90%,55%)';
  if (p === 'medium') return 'hsl(35,95%,55%)';
  return 'hsl(150,80%,50%)';
}

export default function LiveDetect() {
  const { user } = useAuth();
  const [cameraActive, setCameraActive] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [detections, setDetections] = useState<DetectedItem[]>([]);
  const [obstacleWarning, setObstacleWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Refs so the interval always reads latest values without recreating
  const detectionsRef = useRef<DetectedItem[]>([]);
  const voiceEnabledRef = useRef(true);
  const cameraActiveRef = useRef(false);
  const lastSpokenRef = useRef<string>('');
  const speakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load COCO-SSD model once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await tf.ready();
        const model = await cocoSsd.load();
        if (!cancelled) {
          modelRef.current = model;
          setModelLoading(false);
        }
      } catch (err) {
        console.error('Model load error:', err);
        if (!cancelled) setModelLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Single stable voice interval — never recreated
  useEffect(() => {
    speakIntervalRef.current = setInterval(() => {
      if (!voiceEnabledRef.current || !cameraActiveRef.current) return;
      const items = detectionsRef.current;
      if (items.length === 0) return;

      // Prioritise close obstacle warnings
      const closeItems = items.filter(
        d => d.proximity === 'close' && OBSTACLE_CLASSES.has(d.name),
      );
      if (closeItems.length > 0) {
        const warning = `Warning! ${buildDetectionSummary(closeItems.map(d => d.name))} very close ahead.`;
        if (warning !== lastSpokenRef.current) {
          lastSpokenRef.current = warning;
          speak(warning, 1.1);
        }
        return;
      }

      const summary = buildDetectionSummary(items.map(d => d.name));
      if (summary && summary !== lastSpokenRef.current) {
        lastSpokenRef.current = summary;
        speak(summary, 0.95);
      }
    }, 2500);

    return () => {
      if (speakIntervalRef.current) clearInterval(speakIntervalRef.current);
      stopSpeaking();
    };
  }, []); // empty deps — interval lives for the whole component lifetime

  const detectFrame = useCallback(async () => {
    if (!modelRef.current || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    let predictions: cocoSsd.DetectedObject[] = [];
    try {
      predictions = await modelRef.current.detect(video);
    } catch {
      animFrameRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    let hasCloseObstacle = false;
    const newDetections: DetectedItem[] = [];

    predictions.forEach(p => {
      const bbox = p.bbox as [number, number, number, number];
      const prox = getProximity(bbox, canvas.width, canvas.height);
      const color = proximityColor(prox);

      if (prox === 'close' && OBSTACLE_CLASSES.has(p.class)) hasCloseObstacle = true;

      const [x, y, w, h] = bbox;
      const lw = Math.max(prox === 'close' ? 4 : 2, Math.min(video.videoWidth, video.videoHeight) * 0.004);
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.strokeRect(x, y, w, h);

      const proxLabel = prox === 'close' ? '⚠ CLOSE' : prox === 'medium' ? 'MEDIUM' : 'FAR';
      const label = `${p.class} (${Math.round(p.score * 100)}%) ${proxLabel}`;
      const fontSize = Math.max(12, Math.min(video.videoWidth, video.videoHeight) * 0.022);
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.max(0, y - fontSize - 6), textW + 10, fontSize + 6);
      ctx.fillStyle = prox === 'close' ? '#fff' : '#000';
      ctx.fillText(label, x + 5, Math.max(fontSize, y - 5));

      newDetections.push({
        name: p.class,
        confidence: Math.round(p.score * 100) / 100,
        bbox,
        proximity: prox,
      });
    });

    // Update ref immediately (no re-render delay) so interval always has fresh data
    detectionsRef.current = newDetections;
    setDetections(newDetections);
    setObstacleWarning(hasCloseObstacle);

    animFrameRef.current = requestAnimationFrame(detectFrame);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    lastSpokenRef.current = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        videoRef.current.onloadeddata = () => {
          cameraActiveRef.current = true;
          setCameraActive(true);
          detectFrame();
          if (voiceEnabledRef.current) {
            setTimeout(() => speak('Camera started. Scanning for objects.'), 300);
          }
        };
      }
    } catch {
      setError('Camera access denied or unavailable. Please allow camera permissions and try again.');
    }
  }, [detectFrame]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    cameraActiveRef.current = false;
    setCameraActive(false);
    detectionsRef.current = [];
    setDetections([]);
    setObstacleWarning(false);
    stopSpeaking();
    lastSpokenRef.current = '';
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      stopSpeaking();
    };
  }, []);

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-1">Live Object Detection</h1>
        <p className="text-muted-foreground text-sm">
          Real-time AI detection with voice announcements every 2.5 seconds
        </p>
      </div>

      {/* Model loading */}
      {modelLoading && (
        <Card className="mb-6 border-primary/20">
          <CardContent className="p-5 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Loading AI model…</p>
              <p className="text-xs text-muted-foreground">First load may take 10–20 seconds</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Obstacle alert banner */}
      {obstacleWarning && cameraActive && (
        <Card className="mb-4 border-destructive bg-destructive/5" role="alert" aria-live="assertive">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-destructive animate-pulse flex-shrink-0" />
            <span className="font-bold text-destructive text-sm">
              ⚠ Obstacle very close ahead! Proceed with caution.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="p-5 text-destructive text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Camera feed */}
      <Card className="mb-4 overflow-hidden">
        <CardContent className="p-0">
          <div className="relative bg-muted" style={{ aspectRatio: '4/3' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
              aria-hidden="true"
            />
            <canvas
              ref={canvasRef}
              className="w-full h-full object-contain"
              aria-label="Live camera feed with bounding boxes"
            />
            {!cameraActive && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-muted">
                <div className="w-20 h-20 rounded-full bg-muted-foreground/10 flex items-center justify-center">
                  <Video className="w-10 h-10 opacity-40" />
                </div>
                <p className="text-sm font-medium">Press Start Camera to begin detection</p>
                <p className="text-xs opacity-60">Allow camera permission when prompted</p>
              </div>
            )}
            {/* Live badge */}
            {cameraActive && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                LIVE
              </div>
            )}
            {/* Object count badge */}
            {cameraActive && (
              <div className="absolute top-3 right-3 bg-black/70 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
                {detections.length} object{detections.length !== 1 ? 's' : ''}
              </div>
            )}
            {/* Voice badge */}
            {cameraActive && (
              <div className={`absolute bottom-3 right-3 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${
                voiceEnabled ? 'bg-primary/80 text-primary-foreground' : 'bg-black/60 text-white/60'
              }`}>
                {voiceEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                {voiceEnabled ? 'Voice On' : 'Voice Off'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5">
        {!cameraActive ? (
          <Button
            onClick={startCamera}
            disabled={modelLoading}
            size="lg"
            className="flex-1 sm:flex-none"
          >
            <Video className="w-4 h-4 mr-2" />
            {modelLoading ? 'Loading Model…' : 'Start Camera'}
          </Button>
        ) : (
          <Button onClick={stopCamera} variant="destructive" size="lg" className="flex-1 sm:flex-none">
            <VideoOff className="w-4 h-4 mr-2" /> Stop Camera
          </Button>
        )}
        <Button
          variant={voiceEnabled ? 'default' : 'outline'}
          size="lg"
          className="flex-1 sm:flex-none"
          onClick={() => {
            const next = !voiceEnabled;
            setVoiceEnabled(next);
            voiceEnabledRef.current = next;
            if (!next) stopSpeaking();
            else speak('Voice feedback enabled.');
          }}
          aria-label={voiceEnabled ? 'Disable voice feedback' : 'Enable voice feedback'}
        >
          {voiceEnabled
            ? <><Volume2 className="w-4 h-4 mr-2" /> Voice On</>
            : <><VolumeX className="w-4 h-4 mr-2" /> Voice Off</>}
        </Button>
      </div>

      {/* Proximity colour legend */}
      {cameraActive && (
        <div className="flex flex-wrap gap-4 mb-5 px-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-destructive flex-shrink-0" />
            <span className="text-muted-foreground">⚠ Close — danger</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-accent flex-shrink-0" />
            <span className="text-muted-foreground">Medium — caution</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-secondary flex-shrink-0" />
            <span className="text-muted-foreground">Far — clear</span>
          </div>
        </div>
      )}

      {/* Detections list */}
      {cameraActive && detections.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="text-base font-semibold text-foreground mb-3">
              Detected Objects ({detections.length})
            </h2>
            <div
              className="space-y-2"
              role="list"
              aria-label="Currently detected objects"
              aria-live="polite"
            >
              {detections.map((d, i) => (
                <div
                  key={`${d.name}-${i}`}
                  className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                    d.proximity === 'close' ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted/50'
                  }`}
                  role="listitem"
                >
                  <div className="flex items-center gap-2">
                    {d.proximity === 'close' && (
                      <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                    )}
                    <span className="font-medium text-foreground capitalize text-sm">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        d.proximity === 'close'
                          ? 'bg-destructive/20 text-destructive'
                          : d.proximity === 'medium'
                          ? 'bg-accent/30 text-foreground'
                          : 'bg-secondary/20 text-secondary'
                      }`}
                    >
                      {d.proximity.toUpperCase()}
                    </span>
                    <span className="text-sm font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {Math.round(d.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {cameraActive && detections.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            <Video className="w-8 h-8 opacity-30 mx-auto mb-2" />
            No objects detected yet — point the camera at something.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
