import { useState, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { speak, stopSpeaking } from '@/lib/speech';
import { usePageVoiceCommands } from '@/hooks/usePageVoiceCommands';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Camera, Volume2, VolumeX, Loader2, RotateCcw, FileText, Mic, MicOff } from 'lucide-react';
import { createWorker } from 'tesseract.js';

export default function TextReader() {
  const { user } = useAuth();
  const { lang, isTamil } = useLanguage();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Handlers (stable refs) ──────────────────────────────────────────────
  const imageUrlRef = useRef(imageUrl);
  const extractedTextRef = useRef(extractedText);
  const isSpeakingRef = useRef(isSpeaking);
  imageUrlRef.current = imageUrl;
  extractedTextRef.current = extractedText;
  isSpeakingRef.current = isSpeaking;

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
      const ocrLang = isTamil ? 'tam+eng' : 'eng';
      const worker = await createWorker(ocrLang, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
        },
      });
      const { data: { text } } = await worker.recognize(url);
      await worker.terminate();
      const cleaned = text.trim();
      setExtractedText(cleaned);
      if (cleaned) {
        speak(cleaned, 0.85, lang);
        setIsSpeaking(true);
      } else {
        speak(
          isTamil ? 'இந்த படத்தில் படிக்கக்கூடிய உரை இல்லை.' : 'No readable text found in this image.',
          0.85, lang,
        );
        setIsSpeaking(true);
      }
    } catch {
      setExtractedText('');
      speak(
        isTamil
          ? 'இந்த படத்திலிருந்து உரையை படிக்க முடியவில்லை. தெளிவான படத்தை முயற்சிக்கவும்.'
          : 'Could not read text from this image. Please try a clearer image.',
        0.85, lang,
      );
    }
    setLoading(false);
  }, [lang, isTamil]);

  const toggleSpeech = useCallback(() => {
    if (isSpeakingRef.current) {
      stopSpeaking();
      setIsSpeaking(false);
    } else if (extractedTextRef.current) {
      speak(extractedTextRef.current, 0.85, lang);
      setIsSpeaking(true);
    }
  }, [lang]);

  const reset = useCallback(() => {
    setImageUrl(null);
    setExtractedText('');
    stopSpeaking();
    setIsSpeaking(false);
    setProgress(0);
  }, []);

  const openFile = useCallback(() => { fileInputRef.current?.click(); }, []);

  const takePhoto = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFile(f); };
    input.click();
  }, []);

  const readCurrent = useCallback(() => {
    const url = imageUrlRef.current;
    if (url) runOCR(url);
    else speak(isTamil ? 'முதலில் ஒரு படம் பதிவேற்றவும்.' : 'Please upload an image first.', 0.95, lang);
  }, [runOCR, isTamil, lang]);

  // ─── Voice commands ───────────────────────────────────────────────────────
  const commands = useMemo(() => [
    {
      patterns: ['upload image', 'choose file', 'open file', 'select image',
                 'படம் பதிவேற்று', 'கோப்பு திற', 'படம் தேர்வு'],
      action: openFile,
      confirmEn: 'Opening file picker.',
      confirmTa: 'கோப்பு திறக்கிறது.',
    },
    {
      patterns: ['take photo', 'capture image', 'use camera', 'open camera',
                 'புகைப்படம் எடு', 'கேமரா திற', 'படம் எடு'],
      action: takePhoto,
      confirmEn: 'Opening camera.',
      confirmTa: 'கேமரா திறக்கிறது.',
    },
    {
      patterns: ['read text', 'extract text', 'scan image', 'start ocr', 'read image',
                 'உரை படி', 'உரை வாசி', 'உரை கண்டறி'],
      action: readCurrent,
      confirmEn: 'Reading text from image.',
      confirmTa: 'படத்திலிருந்து உரை படிக்கிறது.',
    },
    {
      patterns: ['read aloud', 'speak text', 'play text', 'say text',
                 'சத்தமாக படி', 'உரை சொல்'],
      action: toggleSpeech,
      confirmEn: 'Toggling speech.',
      confirmTa: 'குரல் மாற்றுகிறது.',
    },
    {
      patterns: ['stop reading', 'stop speaking', 'silence', 'quiet',
                 'படிப்பை நிறுத்து', 'பேச்சை நிறுத்து'],
      action: () => { stopSpeaking(); setIsSpeaking(false); },
      confirmEn: 'Stopped reading.',
      confirmTa: 'படிப்பை நிறுத்தியது.',
    },
    {
      patterns: ['clear', 'reset', 'new image', 'start over',
                 'அழி', 'மீட்டமை', 'புதிய படம்'],
      action: reset,
      confirmEn: 'Cleared. Ready for a new image.',
      confirmTa: 'அழிக்கப்பட்டது. புதிய படத்திற்கு தயாராக உள்ளது.',
    },
    {
      patterns: ['help', 'commands', 'what can i say',
                 'உதவி', 'கட்டளைகள்'],
      action: () => speak(
        isTamil
          ? 'கட்டளைகள்: படம் பதிவேற்று, புகைப்படம் எடு, உரை படி, சத்தமாக படி, படிப்பை நிறுத்து, அழி'
          : 'Commands: upload image, take photo, read text, read aloud, stop reading, clear.',
        0.88, lang,
      ),
      confirmEn: 'Listing commands.',
      confirmTa: 'கட்டளைகளை அறிவிக்கிறது.',
    },
  ], [openFile, takePhoto, readCurrent, toggleSpeech, reset, isTamil, lang]);

  const { listening: vcListening, transcript: vcTranscript, supported: vcSupported, toggle: vcToggle } =
    usePageVoiceCommands({
      lang,
      commands,
      activateMessageEn: 'Text Reader voice commands active. Say "read text", "upload image", or "help".',
      activateMessageTa: 'உரை வாசிப்பி குரல் கட்டளைகள் இயக்கப்பட்டது. "உரை படி", "படம் பதிவேற்று" என்று சொல்லுங்கள்.',
    });

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">
            {isTamil ? 'உரை வாசிப்பி (OCR)' : 'Text Reader (OCR)'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isTamil
              ? 'உரையுள்ள படத்தை பதிவேற்றவும் — AI அதை உங்களுக்காக சத்தமாக வாசிக்கும்'
              : 'Upload an image with text — the AI will read it aloud for you'}
          </p>
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

      {/* Voice command help card */}
      {vcListening && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground mb-1">{isTamil ? '🎙 குரல் கட்டளைகள்:' : '🎙 Voice Commands:'}</p>
            {isTamil ? (
              <ul className="list-disc pl-4 space-y-0.5">
                <li>"படம் பதிவேற்று" — கோப்பு திறக்கும்</li>
                <li>"புகைப்படம் எடு" — கேமரா திறக்கும்</li>
                <li>"உரை படி" — OCR இயக்கும்</li>
                <li>"சத்தமாக படி" — உரை சொல்லும்</li>
                <li>"படிப்பை நிறுத்து" — நிறுத்தும்</li>
                <li>"அழி" — மீட்டமைக்கும்</li>
              </ul>
            ) : (
              <ul className="list-disc pl-4 space-y-0.5">
                <li>"upload image" / "take photo" — opens picker/camera</li>
                <li>"read text" — runs OCR on current image</li>
                <li>"read aloud" — speaks the extracted text</li>
                <li>"stop reading" — stops speech</li>
                <li>"clear" — resets the page</li>
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {!imageUrl ? (
        <Card className="border-2 border-dashed border-border hover:border-primary/50 transition-colors">
          <CardContent className="p-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {isTamil ? 'உரையுள்ள படத்தை பதிவேற்றவும்' : 'Upload Image with Text'}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {isTamil
                ? 'அடையாளங்கள், ஆவணங்கள், லேபல்கள், மெனுக்களில் செயல்படும்'
                : 'Works on signs, documents, labels, menus, and more'}
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
              <Button onClick={openFile}>
                <Upload className="w-4 h-4 mr-2" />
                {isTamil ? 'கோப்பு தேர்ந்தெடு' : 'Choose File'}
              </Button>
              <Button variant="outline" onClick={takePhoto}>
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
              <img
                src={imageUrl}
                alt="Uploaded image for text extraction"
                className="w-full h-auto max-h-80 object-contain rounded-lg bg-muted"
              />
            </CardContent>
          </Card>

          {!extractedText && !loading && (
            <Button onClick={() => runOCR(imageUrl)} className="w-full" size="lg">
              <FileText className="w-5 h-5 mr-2" />
              {isTamil ? 'படத்திலிருந்து உரை படிக்க' : 'Read Text from Image'}
            </Button>
          )}

          {loading && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {isTamil ? `உரை படிக்கிறது… ${progress}%` : `Reading text… ${progress}%`}
                  </span>
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
                  <h2 className="text-lg font-semibold text-foreground">
                    {isTamil ? 'பிரிக்கப்பட்ட உரை' : 'Extracted Text'}
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSpeech}
                    aria-label={isSpeaking ? 'Stop reading' : 'Read text aloud'}
                  >
                    {isSpeaking ? (
                      <><VolumeX className="w-4 h-4 mr-1" />{isTamil ? 'நிறுத்து' : 'Stop'}</>
                    ) : (
                      <><Volume2 className="w-4 h-4 mr-1" />{isTamil ? 'சத்தமாக படி' : 'Read Aloud'}</>
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
                {isTamil
                  ? 'இந்த படத்தில் உரை இல்லை. தெளிவான படத்தை முயற்சிக்கவும்.'
                  : 'No text found in this image. Try a clearer or higher-resolution image.'}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button onClick={reset} variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              {isTamil ? 'புதிய படம்' : 'New Image'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
