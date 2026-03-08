import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { speak, stopSpeaking } from '@/lib/speech';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Video, VideoOff, Volume2, VolumeX, Loader2, Users } from 'lucide-react';
import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

export default function FaceDetect() {
  const { user } = useAuth();
  const [cameraActive, setCameraActive] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [faceCount, setFaceCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const lastSpokenRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
        ]);
        if (!cancelled) setModelsLoading(false);
      } catch {
        if (!cancelled) {
          setModelsLoading(false);
          setModelError(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const detectFaces = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(detectFaces);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions()
      .withAgeAndGender();

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Draw detections
    const resized = faceapi.resizeResults(detections, { width: canvas.width, height: canvas.height });

    resized.forEach((d) => {
      const { x, y, width: w, height: h } = d.detection.box;
      const age = Math.round(d.age);
      const gender = d.gender;
      const topExpr = Object.entries(d.expressions).sort((a, b) => b[1] - a[1])[0][0];

      ctx.strokeStyle = 'hsl(150, 80%, 50%)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      const label = `${gender}, ~${age} yrs, ${topExpr}`;
      ctx.font = 'bold 13px Inter, sans-serif';
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = 'hsl(150, 80%, 50%)';
      ctx.fillRect(x, y - 22, textW + 10, 20);
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 5, y - 6);
    });

    setFaceCount(detections.length);

    // Voice feedback
    if (voiceEnabled && detections.length > 0) {
      const descriptions = resized.map(d => {
        const age = Math.round(d.age);
        const gender = d.gender;
        const topExpr = Object.entries(d.expressions).sort((a, b) => b[1] - a[1])[0][0];
        return `${gender} approximately ${age} years old appearing ${topExpr}`;
      });
      const summary = detections.length === 1
        ? `1 face detected: ${descriptions[0]}.`
        : `${detections.length} faces detected.`;
      if (summary !== lastSpokenRef.current) {
        lastSpokenRef.current = summary;
        speak(summary);
      }
    }

    animFrameRef.current = requestAnimationFrame(detectFaces);
  }, [voiceEnabled]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          setCameraActive(true);
          detectFaces();
        };
      }
    } catch {
      setError('Camera access denied or unavailable. Please allow camera permissions.');
    }
  }, [detectFaces]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    setFaceCount(0);
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
    };
  }, []);

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-accent" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Face Detection</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        Detects faces in real time and announces age, gender, and expression
      </p>

      {modelsLoading && (
        <Card className="mb-6">
          <CardContent className="p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading face detection models…</span>
          </CardContent>
        </Card>
      )}

      {modelError && (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="p-6 text-sm text-muted-foreground">
            ⚠️ Face models could not be loaded (network issue). Basic detection only will be available. Please check your internet connection.
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
              aria-label="Live camera with face detection overlays"
            />
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <Users className="w-12 h-12 mb-3 opacity-40" />
                <span className="text-sm">Camera is off</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 mb-6">
        {!cameraActive ? (
          <Button onClick={startCamera} disabled={modelsLoading}>
            <Video className="w-4 h-4 mr-2" /> Start Camera
          </Button>
        ) : (
          <Button onClick={stopCamera} variant="destructive">
            <VideoOff className="w-4 h-4 mr-2" /> Stop Camera
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => { setVoiceEnabled(v => !v); if (voiceEnabled) stopSpeaking(); }}
          aria-label={voiceEnabled ? 'Disable voice' : 'Enable voice'}
        >
          {voiceEnabled ? <Volume2 className="w-4 h-4 mr-2" /> : <VolumeX className="w-4 h-4 mr-2" />}
          {voiceEnabled ? 'Voice On' : 'Voice Off'}
        </Button>
      </div>

      {cameraActive && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-1">
              {faceCount === 0 ? 'No faces detected' : `${faceCount} face${faceCount > 1 ? 's' : ''} detected`}
            </h2>
            <p className="text-sm text-muted-foreground">
              Age, gender, and expression are estimated in real time.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
