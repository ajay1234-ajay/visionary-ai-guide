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

function getProximity(bbox: [number, number, number, number], canvasW: number, canvasH: number): 'close' | 'medium' | 'far' {
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
  const lastSpokenRef = useRef<string>('');
  const speakIntervalRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await tf.ready();
      const model = await cocoSsd.load();
      if (!cancelled) {
        modelRef.current = model;
        setModelLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!voiceEnabled || !cameraActive) return;
    speakIntervalRef.current = window.setInterval(() => {
      if (detections.length === 0) return;

      // Check for close obstacles first
      const closeItems = detections.filter(d => d.proximity === 'close' && OBSTACLE_CLASSES.has(d.name));
      if (closeItems.length > 0) {
        const warning = `Warning! ${buildDetectionSummary(closeItems.map(d => d.name))} very close ahead.`;
        if (warning !== lastSpokenRef.current) {
          lastSpokenRef.current = warning;
          speak(warning, 1.1);
        }
        return;
      }

      const summary = buildDetectionSummary(detections.map(d => d.name));
      if (summary !== lastSpokenRef.current) {
        lastSpokenRef.current = summary;
        speak(summary, 0.95);
      }
    }, 2500);
    return () => {
      clearInterval(speakIntervalRef.current);
      stopSpeaking();
    };
  }, [voiceEnabled, cameraActive, detections]);

  const detectFrame = useCallback(async () => {
    if (!modelRef.current || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    const predictions = await modelRef.current.detect(video);

    let hasCloseObstacle = false;

    predictions.forEach((p) => {
      const [x, y, w, h] = p.bbox;
      const prox = getProximity(p.bbox as [number, number, number, number], canvas.width, canvas.height);
      const color = proximityColor(prox);

      if (prox === 'close' && OBSTACLE_CLASSES.has(p.class)) hasCloseObstacle = true;

      const lineW = prox === 'close' ? 4 : 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(lineW, Math.min(video.videoWidth, video.videoHeight) * 0.004);
      ctx.strokeRect(x, y, w, h);

      // Proximity badge
      const proxLabel = prox === 'close' ? '⚠ CLOSE' : prox === 'medium' ? 'MEDIUM' : 'FAR';
      const label = `${p.class} (${Math.round(p.score * 100)}%) ${proxLabel}`;
      const fontSize = Math.max(12, Math.min(video.videoWidth, video.videoHeight) * 0.022);
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(x, y - fontSize - 6, textW + 10, fontSize + 6);
      ctx.fillStyle = prox === 'close' ? '#fff' : '#000';
      ctx.fillText(label, x + 5, y - 5);
    });

    setObstacleWarning(hasCloseObstacle);
    setDetections(predictions.map(p => ({
      name: p.class,
      confidence: Math.round(p.score * 100) / 100,
      bbox: p.bbox as [number, number, number, number],
      proximity: getProximity(p.bbox as [number, number, number, number], canvas.width, canvas.height),
    })));

    animFrameRef.current = requestAnimationFrame(detectFrame);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          setCameraActive(true);
          detectFrame();
        };
      }
    } catch {
      setError('Camera access denied or unavailable. Please allow camera permissions.');
    }
  }, [detectFrame]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    setDetections([]);
    setObstacleWarning(false);
    stopSpeaking();
    lastSpokenRef.current = '';
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      stopSpeaking();
      clearInterval(speakIntervalRef.current);
    };
  }, []);

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-foreground mb-2">Live Object Detection</h1>
      <p className="text-muted-foreground mb-8">
        Real-time detection with obstacle proximity warnings and voice feedback
      </p>

      {modelLoading && (
        <Card className="mb-6">
          <CardContent className="p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading AI model…</span>
          </CardContent>
        </Card>
      )}

      {obstacleWarning && cameraActive && (
        <Card className="mb-4 border-destructive" role="alert" aria-live="assertive">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive animate-pulse" />
            <span className="font-semibold text-destructive">⚠ Obstacle very close ahead! Proceed with caution.</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="p-6 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
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
              aria-label="Live camera feed with object detection overlays"
            />
            {!cameraActive && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <Video className="w-12 h-12 mb-3 opacity-40" />
                <span className="text-sm">Camera is off</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Proximity legend */}
      {cameraActive && (
        <div className="flex gap-4 mb-4 text-xs flex-wrap">
          {[
            { color: 'bg-destructive', label: '⚠ Close — danger zone' },
            { color: 'bg-accent', label: 'Medium — caution' },
            { color: 'bg-secondary', label: 'Far — clear' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${color}`} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        {!cameraActive ? (
          <Button onClick={startCamera} disabled={modelLoading}>
            <Video className="w-4 h-4 mr-2" /> Start Camera
          </Button>
        ) : (
          <Button onClick={stopCamera} variant="destructive">
            <VideoOff className="w-4 h-4 mr-2" /> Stop Camera
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => {
            setVoiceEnabled(v => !v);
            if (voiceEnabled) stopSpeaking();
          }}
          aria-label={voiceEnabled ? 'Disable voice feedback' : 'Enable voice feedback'}
        >
          {voiceEnabled ? <Volume2 className="w-4 h-4 mr-2" /> : <VolumeX className="w-4 h-4 mr-2" />}
          {voiceEnabled ? 'Voice On' : 'Voice Off'}
        </Button>
      </div>

      {cameraActive && detections.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-3">
              Detected Objects ({detections.length})
            </h2>
            <div className="space-y-2" role="list" aria-label="Currently detected objects" aria-live="polite">
              {detections.map((d, i) => (
                <div
                  key={`${d.name}-${i}`}
                  className={`flex items-center justify-between p-3 rounded-lg ${d.proximity === 'close' ? 'bg-destructive/10' : 'bg-muted/50'}`}
                  role="listitem"
                >
                  <div className="flex items-center gap-2">
                    {d.proximity === 'close' && <AlertTriangle className="w-4 h-4 text-destructive" />}
                    <span className="font-medium text-foreground capitalize">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      d.proximity === 'close' ? 'bg-destructive/20 text-destructive' :
                      d.proximity === 'medium' ? 'bg-accent/20 text-accent-foreground' :
                      'bg-secondary/20 text-secondary'
                    }`}>
                      {d.proximity}
                    </span>
                    <span className="text-sm font-mono px-2 py-1 rounded bg-primary/10 text-primary">
                      {Math.round(d.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
