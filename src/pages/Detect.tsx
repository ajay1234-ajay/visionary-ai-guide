import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { saveDetection, DetectedObject } from '@/lib/detection-history';
import { speak, stopSpeaking } from '@/lib/speech';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Camera, Volume2, VolumeX, Loader2, RotateCcw } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export default function Detect() {
  const { user } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [detections, setDetections] = useState<DetectedObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target?.result as string);
      setDetections([]);
      stopSpeaking();
      setIsSpeaking(false);
    };
    reader.readAsDataURL(file);
  };

  const runDetection = useCallback(async () => {
    if (!modelRef.current || !imgRef.current || !canvasRef.current) return;
    setLoading(true);

    const img = imgRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    const predictions = await modelRef.current.detect(img);

    const detected: DetectedObject[] = predictions.map(p => ({
      name: p.class,
      confidence: Math.round(p.score * 100) / 100,
      bbox: p.bbox as [number, number, number, number],
    }));

    // Draw bounding boxes
    predictions.forEach((p) => {
      const [x, y, w, h] = p.bbox;
      ctx.strokeStyle = 'hsl(210, 100%, 55%)';
      ctx.lineWidth = Math.max(3, Math.min(img.naturalWidth, img.naturalHeight) * 0.004);
      ctx.strokeRect(x, y, w, h);

      const label = `${p.class} (${Math.round(p.score * 100)}%)`;
      const fontSize = Math.max(14, Math.min(img.naturalWidth, img.naturalHeight) * 0.025);
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = 'hsl(210, 100%, 55%)';
      ctx.fillRect(x, y - fontSize - 8, textW + 12, fontSize + 8);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + 6, y - 6);
    });

    setDetections(detected);
    setLoading(false);

    // Save to history
    if (user && imageUrl) {
      saveDetection(user.id, imageUrl, detected);
    }

    // Auto-speak results
    if (detected.length > 0) {
      const text = `Detected ${detected.length} object${detected.length > 1 ? 's' : ''}: ${detected.map(d => `${d.name} with ${Math.round(d.confidence * 100)} percent confidence`).join(', ')}.`;
      speak(text);
      setIsSpeaking(true);
    } else {
      speak('No objects detected in this image.');
      setIsSpeaking(true);
    }
  }, [imageUrl, user]);

  // Run detection when image loads
  const handleImageLoad = () => {
    if (!modelLoading) runDetection();
  };

  const reset = () => {
    setImageUrl(null);
    setDetections([]);
    stopSpeaking();
    setIsSpeaking(false);
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else if (detections.length > 0) {
      const text = `Detected ${detections.length} object${detections.length > 1 ? 's' : ''}: ${detections.map(d => `${d.name} with ${Math.round(d.confidence * 100)} percent confidence`).join(', ')}.`;
      speak(text);
      setIsSpeaking(true);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-foreground mb-2">Object Detection</h1>
      <p className="text-muted-foreground mb-8">Upload an image and our AI will identify objects in it</p>

      {modelLoading && (
        <Card className="mb-6">
          <CardContent className="p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading AI model (first time may take a moment)...</span>
          </CardContent>
        </Card>
      )}

      {!imageUrl ? (
        <Card className="border-2 border-dashed border-border hover:border-primary/50 transition-colors">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Upload an Image</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Drag and drop or click to select an image (JPG, PNG, WebP)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              aria-label="Choose image file"
            />
            <div className="flex gap-3">
              <Button onClick={() => fileInputRef.current?.click()} disabled={modelLoading}>
                <Upload className="w-4 h-4 mr-2" /> Choose File
              </Button>
              <Button
                variant="outline"
                disabled={modelLoading}
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
          {/* Image with detections */}
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt="Uploaded image for object detection"
                  className="hidden"
                  onLoad={handleImageLoad}
                  crossOrigin="anonymous"
                />
                <canvas
                  ref={canvasRef}
                  className="w-full h-auto rounded-lg"
                  aria-label="Image with detected object bounding boxes"
                />
                {loading && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span className="font-medium text-foreground">Detecting objects...</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {detections.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">
                    Detected Objects ({detections.length})
                  </h2>
                  <Button variant="outline" size="sm" onClick={toggleSpeech} aria-label={isSpeaking ? 'Stop voice' : 'Read results aloud'}>
                    {isSpeaking ? <VolumeX className="w-4 h-4 mr-1" /> : <Volume2 className="w-4 h-4 mr-1" />}
                    {isSpeaking ? 'Stop' : 'Read Aloud'}
                  </Button>
                </div>
                <div className="space-y-2" role="list" aria-label="Detected objects list">
                  {detections.map((d, i) => (
                    <div
                      key={i}
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

          {!loading && detections.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No objects were detected in this image. Try a different image.
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={reset} variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" /> New Image
            </Button>
            <Button onClick={runDetection} disabled={loading || modelLoading}>
              Re-detect
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
