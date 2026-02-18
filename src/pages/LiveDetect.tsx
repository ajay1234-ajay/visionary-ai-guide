import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { speak, stopSpeaking } from '@/lib/speech';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Video, VideoOff, Volume2, VolumeX, Loader2 } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

interface DetectedItem {
  name: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export default function LiveDetect() {
  const { user } = useAuth();
  const [cameraActive, setCameraActive] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [detections, setDetections] = useState<DetectedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const lastSpokenRef = useRef<string>('');
  const speakIntervalRef = useRef<number>(0);

  // Load model on mount
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

  // Voice feedback at intervals (every 2.5s to avoid spam)
  useEffect(() => {
    if (!voiceEnabled || !cameraActive) return;
    speakIntervalRef.current = window.setInterval(() => {
      if (detections.length === 0) return;
      const summary = detections.map(d => d.name).join(', ');
      if (summary !== lastSpokenRef.current) {
        lastSpokenRef.current = summary;
        const text = `I see: ${detections.map(d => `${d.name} ${Math.round(d.confidence * 100)} percent`).join(', ')}`;
        speak(text, 1.1);
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

    // Draw bounding boxes
    predictions.forEach((p) => {
      const [x, y, w, h] = p.bbox;
      ctx.strokeStyle = 'hsl(150, 80%, 50%)';
      ctx.lineWidth = Math.max(2, Math.min(video.videoWidth, video.videoHeight) * 0.004);
      ctx.strokeRect(x, y, w, h);

      const label = `${p.class} (${Math.round(p.score * 100)}%)`;
      const fontSize = Math.max(12, Math.min(video.videoWidth, video.videoHeight) * 0.022);
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = 'hsl(150, 80%, 50%)';
      ctx.fillRect(x, y - fontSize - 6, textW + 10, fontSize + 6);
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 5, y - 5);
    });

    setDetections(predictions.map(p => ({
      name: p.class,
      confidence: Math.round(p.score * 100) / 100,
      bbox: p.bbox as [number, number, number, number],
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
      clearInterval(speakIntervalRef.current);
    };
  }, []);

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-foreground mb-2">Live Object Detection</h1>
      <p className="text-muted-foreground mb-8">
        Use your camera to detect objects in real-time with voice feedback
      </p>

      {modelLoading && (
        <Card className="mb-6">
          <CardContent className="p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading AI model…</span>
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

      {/* Controls */}
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

      {/* Live detections list */}
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
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  role="listitem"
                >
                  <span className="font-medium text-foreground capitalize">{d.name}</span>
                  <span className="text-sm font-mono px-2 py-1 rounded bg-primary/10 text-primary">
                    {Math.round(d.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
