import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { speak, stopSpeaking } from '@/lib/speech';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Camera, Volume2, VolumeX, Loader2, RotateCcw, FileText } from 'lucide-react';
import { createWorker } from 'tesseract.js';

export default function TextReader() {
  const { user } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target?.result as string);
      setExtractedText('');
      stopSpeaking();
      setIsSpeaking(false);
      setProgress(0);
    };
    reader.readAsDataURL(file);
  };

  const runOCR = useCallback(async (url: string) => {
    setLoading(true);
    setProgress(0);
    try {
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });
      const { data: { text } } = await worker.recognize(url);
      await worker.terminate();
      const cleaned = text.trim();
      setExtractedText(cleaned);
      if (cleaned) {
        speak(cleaned, 0.85);
        setIsSpeaking(true);
      } else {
        speak('No readable text found in this image.');
        setIsSpeaking(true);
      }
    } catch {
      setExtractedText('');
      speak('Could not read text from this image. Please try a clearer image.');
    }
    setLoading(false);
  }, []);

  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else if (extractedText) {
      speak(extractedText, 0.85);
      setIsSpeaking(true);
    }
  };

  const reset = () => {
    setImageUrl(null);
    setExtractedText('');
    stopSpeaking();
    setIsSpeaking(false);
    setProgress(0);
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-foreground mb-2">Text Reader (OCR)</h1>
      <p className="text-muted-foreground mb-8">
        Upload an image with text — the AI will read it aloud for you
      </p>

      {!imageUrl ? (
        <Card className="border-2 border-dashed border-border hover:border-primary/50 transition-colors">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Upload Image with Text</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Works on signs, documents, labels, menus, and more
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
              <img
                src={imageUrl}
                alt="Uploaded image for text extraction"
                className="w-full h-auto max-h-80 object-contain rounded-lg bg-muted"
              />
            </CardContent>
          </Card>

          {!extractedText && !loading && (
            <Button onClick={() => runOCR(imageUrl)} className="w-full" size="lg">
              <FileText className="w-5 h-5 mr-2" /> Read Text from Image
            </Button>
          )}

          {loading && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm font-medium text-foreground">Reading text… {progress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {extractedText && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Extracted Text</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSpeech}
                    aria-label={isSpeaking ? 'Stop reading' : 'Read text aloud'}
                  >
                    {isSpeaking ? (
                      <><VolumeX className="w-4 h-4 mr-1" /> Stop</>
                    ) : (
                      <><Volume2 className="w-4 h-4 mr-1" /> Read Aloud</>
                    )}
                  </Button>
                </div>
                <div
                  className="p-4 rounded-lg bg-muted/50 text-foreground text-sm leading-relaxed whitespace-pre-wrap font-mono"
                  aria-live="polite"
                  aria-label="Extracted text content"
                >
                  {extractedText}
                </div>
              </CardContent>
            </Card>
          )}

          {!loading && extractedText === '' && imageUrl && (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No text found in this image. Try a clearer or higher-resolution image.
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button onClick={reset} variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" /> New Image
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
