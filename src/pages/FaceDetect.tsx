import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { speak, stopSpeaking } from '@/lib/speech';
import { usePageVoiceCommands } from '@/hooks/usePageVoiceCommands';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Video, VideoOff, Volume2, VolumeX, Loader2, Users, Mic, MicOff } from 'lucide-react';
import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

export default function FaceDetect() {
  const { user } = useAuth();
  const { lang, isTamil } = useLanguage();
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
  const cameraActiveRef = useRef(false);
  const voiceRef = useRef(voiceEnabled);
  voiceRef.current = voiceEnabled;

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
        if (!cancelled) { setModelsLoading(false); setModelError(true); }
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

    if (voiceRef.current && detections.length > 0) {
      const descriptions = resized.map(d => {
        const age = Math.round(d.age);
        const topExpr = Object.entries(d.expressions).sort((a, b) => b[1] - a[1])[0][0];
        return isTamil
          ? `${d.gender === 'male' ? 'ஆண்' : 'பெண்'} சுமார் ${age} வயது, ${topExpr}`
          : `${d.gender} approximately ${age} years old appearing ${topExpr}`;
      });
      const summary = detections.length === 1
        ? (isTamil ? `1 முகம் கண்டறியப்பட்டது: ${descriptions[0]}.` : `1 face detected: ${descriptions[0]}.`)
        : (isTamil ? `${detections.length} முகங்கள் கண்டறியப்பட்டன.` : `${detections.length} faces detected.`);
      if (summary !== lastSpokenRef.current) {
        lastSpokenRef.current = summary;
        speak(summary, 0.95, lang);
      }
    }

    animFrameRef.current = requestAnimationFrame(detectFaces);
  }, [voiceEnabled, isTamil, lang]);

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
          cameraActiveRef.current = true;
          setCameraActive(true);
          detectFaces();
          if (voiceRef.current) {
            speak(isTamil ? 'கேமரா தொடங்கியது. முகங்களை ஸ்கேன் செய்கிறது.' : 'Camera started. Scanning for faces.', 0.95, lang);
          }
        };
      }
    } catch {
      setError('Camera access denied or unavailable. Please allow camera permissions.');
    }
  }, [detectFaces, isTamil, lang]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    cameraActiveRef.current = false;
    setCameraActive(false);
    setFaceCount(0);
    stopSpeaking();
    lastSpokenRef.current = '';
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    speak(isTamil ? 'கேமரா நிறுத்தப்பட்டது.' : 'Camera stopped.', 0.95, lang);
  }, [isTamil, lang]);

  const toggleVoice = useCallback(() => {
    const next = !voiceRef.current;
    setVoiceEnabled(next);
    if (!next) stopSpeaking();
    speak(next
      ? (isTamil ? 'குரல் அறிவிப்பு இயக்கப்பட்டது.' : 'Voice feedback enabled.')
      : (isTamil ? 'குரல் அறிவிப்பு நிறுத்தப்பட்டது.' : 'Voice feedback disabled.'),
      0.95, lang);
  }, [isTamil, lang]);

  const readCurrentStatus = useCallback(() => {
    if (!cameraActiveRef.current) {
      speak(isTamil ? 'கேமரா இயங்கவில்லை.' : 'Camera is not active.', 0.95, lang);
      return;
    }
    const msg = faceCount === 0
      ? (isTamil ? 'இப்போது முகங்கள் எதுவும் கண்டறியவில்லை.' : 'No faces detected right now.')
      : (isTamil ? `${faceCount} முகம் கண்டறியப்பட்டது.` : `${faceCount} face${faceCount > 1 ? 's' : ''} detected.`);
    speak(msg, 0.95, lang);
  }, [faceCount, isTamil, lang]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      stopSpeaking();
    };
  }, []);

  // ─── Voice commands ───────────────────────────────────────────────────────
  const commands = useMemo(() => [
    {
      patterns: ['start camera', 'open camera', 'start detection', 'turn on camera',
                 'கேமரா தொடங்கு', 'கேமரா திற', 'முக கண்டறிதல் தொடங்கு'],
      action: startCamera,
      confirmEn: 'Starting camera.',
      confirmTa: 'கேமரா தொடங்குகிறது.',
    },
    {
      patterns: ['stop camera', 'close camera', 'stop detection', 'turn off camera',
                 'கேமரா நிறுத்து', 'கேமரா மூடு', 'முக கண்டறிதல் நிறுத்து'],
      action: stopCamera,
      confirmEn: 'Stopping camera.',
      confirmTa: 'கேமரா நிறுத்துகிறது.',
    },
    {
      patterns: ['toggle voice', 'voice on', 'voice off', 'mute', 'unmute',
                 'குரல் மாற்று', 'குரல் இயக்கு', 'குரல் நிறுத்து'],
      action: toggleVoice,
      confirmEn: 'Toggling voice.',
      confirmTa: 'குரல் மாற்றுகிறது.',
    },
    {
      patterns: ['how many faces', 'how many people', 'what do you see', 'face count', 'read status',
                 'எத்தனை முகங்கள்', 'என்ன தெரிகிறது', 'நிலையை சொல்'],
      action: readCurrentStatus,
      confirmEn: 'Reading current detection status.',
      confirmTa: 'தற்போதைய நிலையை சொல்கிறது.',
    },
    {
      patterns: ['help', 'commands', 'what can i say', 'உதவி', 'கட்டளைகள்'],
      action: () => speak(
        isTamil
          ? 'கட்டளைகள்: கேமரா தொடங்கு, கேமரா நிறுத்து, குரல் மாற்று, எத்தனை முகங்கள்'
          : 'Commands: start camera, stop camera, toggle voice, how many faces.',
        0.88, lang,
      ),
      confirmEn: 'Listing commands.',
      confirmTa: 'கட்டளைகளை அறிவிக்கிறது.',
    },
  ], [startCamera, stopCamera, toggleVoice, readCurrentStatus, isTamil, lang]);

  const { listening: vcListening, transcript: vcTranscript, supported: vcSupported, toggle: vcToggle } =
    usePageVoiceCommands({
      lang,
      commands,
      activateMessageEn: 'Face detection voice commands active. Say "start camera", "stop camera", or "help".',
      activateMessageTa: 'முக கண்டறிதல் குரல் கட்டளைகள் இயக்கப்பட்டது. "கேமரா தொடங்கு" அல்லது "கேமரா நிறுத்து" என்று சொல்லுங்கள்.',
    });

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{isTamil ? 'முக கண்டறிதல்' : 'Face Detection'}</h1>
            <p className="text-muted-foreground text-sm">
              {isTamil ? 'நேரடியாக முகம், வயது, பாலினம் மற்றும் உணர்வை கண்டறியும்' : 'Detects faces in real time and announces age, gender, and expression'}
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

      {modelsLoading && (
        <Card className="mb-6">
          <CardContent className="p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">{isTamil ? 'முக AI மாடல்கள் ஏற்றுகிறது…' : 'Loading face detection models…'}</span>
          </CardContent>
        </Card>
      )}

      {modelError && (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="p-6 text-sm text-muted-foreground">
            ⚠️ {isTamil ? 'மாடல்கள் ஏற்றப்படவில்லை. இணைய இணைப்பை சரிபார்க்கவும்.' : 'Face models could not be loaded. Please check your internet connection.'}
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
                <span className="text-sm">{isTamil ? 'கேமரா அணைந்துள்ளது' : 'Camera is off'}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 mb-6">
        {!cameraActive ? (
          <Button onClick={startCamera} disabled={modelsLoading}>
            <Video className="w-4 h-4 mr-2" />
            {isTamil ? 'கேமரா தொடங்கு' : 'Start Camera'}
          </Button>
        ) : (
          <Button onClick={stopCamera} variant="destructive">
            <VideoOff className="w-4 h-4 mr-2" />
            {isTamil ? 'கேமரா நிறுத்து' : 'Stop Camera'}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={toggleVoice}
          aria-label={voiceEnabled ? 'Disable voice' : 'Enable voice'}
        >
          {voiceEnabled ? <Volume2 className="w-4 h-4 mr-2" /> : <VolumeX className="w-4 h-4 mr-2" />}
          {isTamil ? (voiceEnabled ? 'குரல் இயக்கம்' : 'குரல் நிறுத்தம்') : `Voice ${voiceEnabled ? 'On' : 'Off'}`}
        </Button>
        {cameraActive && (
          <Button variant="outline" onClick={readCurrentStatus}>
            <Volume2 className="w-4 h-4 mr-2" />
            {isTamil ? 'நிலை படி' : 'Read Status'}
          </Button>
        )}
      </div>

      {cameraActive && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-1">
              {faceCount === 0
                ? (isTamil ? 'முகங்கள் கண்டறியவில்லை' : 'No faces detected')
                : (isTamil ? `${faceCount} முகம் கண்டறியப்பட்டது` : `${faceCount} face${faceCount > 1 ? 's' : ''} detected`)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isTamil ? 'வயது, பாலினம் மற்றும் உணர்வு நேரடியாக மதிப்பிடப்படுகிறது.' : 'Age, gender, and expression are estimated in real time.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
