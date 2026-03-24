import { useState, useEffect, useRef, lazy, Suspense, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { speak, stopSpeaking } from '@/lib/speech';
import { usePageVoiceCommands } from '@/hooks/usePageVoiceCommands';
import {
  fetchRoute, geocodeDestination, voiceInstruction,
  haversineMetres, isOffRoute, fmtDistance,
} from '@/lib/routing';
import type { RouteResult } from '@/lib/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import RouteSteps from '@/components/navigation/RouteSteps';
import StreetViewCard from '@/components/navigation/StreetViewCard';
import {
  MapPin, Navigation2, Volume2, VolumeX, Loader2, RefreshCw,
  Search, Route, AlertTriangle, ChevronRight, ChevronLeft,
  CheckCircle2, AlertCircle, Mic, MicOff,
} from 'lucide-react';

const MapView = lazy(() => import('@/components/navigation/MapView'));

interface LocationInfo {
  lat: number;
  lng: number;
  address: string;
  city?: string;
  country?: string;
}

// Advance the step when user is within this distance of the waypoint (metres)
const STEP_ADVANCE_M = 30;
// Warn user when off-route by this distance (metres)
const OFF_ROUTE_M = 60;
// Announce "turn in Xm" when within this distance of the next waypoint
const ADVANCE_WARN_M = 80;

export default function Navigation() {
  const { user } = useAuth();
  const { lang, isTamil } = useLanguage();

  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [destination, setDestination] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [destAddress, setDestAddress] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [navigationStarted, setNavigationStarted] = useState(false);
  const [offRoute, setOffRoute] = useState(false);
  const [distToNext, setDistToNext] = useState<number | null>(null);

  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [tracking, setTracking] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const lastAnnouncedRef = useRef<string>('');
  const stepAnnouncedRef = useRef<number>(-1);
  const advanceWarnedRef = useRef<number>(-1);
  const offRouteWarnedRef = useRef(false);
  const routeResultRef = useRef<RouteResult | null>(null);
  const activeStepRef = useRef(0);
  const navStartedRef = useRef(false);
  const voiceEnabledRef = useRef(true);

  // Keep refs in sync
  useEffect(() => { routeResultRef.current = routeResult; }, [routeResult]);
  useEffect(() => { activeStepRef.current = activeStep; }, [activeStep]);
  useEffect(() => { navStartedRef.current = navigationStarted; }, [navigationStarted]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

  // ─── Reverse geocode ────────────────────────────────────────────────────
  const reverseGeocode = async (lat: number, lng: number): Promise<LocationInfo> => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': isTamil ? 'ta,en' : 'en' } },
    );
    const data = await res.json();
    const addr = data.address || {};
    const road = addr.road || addr.pedestrian || addr.footway || '';
    const suburb = addr.suburb || addr.neighbourhood || addr.quarter || '';
    const city = addr.city || addr.town || addr.village || '';
    const country = addr.country || '';
    const address =
      [road, suburb, city].filter(Boolean).join(', ') ||
      data.display_name ||
      `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    return { lat, lng, address, city, country };
  };

  // ─── GPS position handler (shared by one-shot + watchPosition) ──────────
  const handlePosition = useCallback(async (pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = pos.coords;
    // Ignore very inaccurate fixes (>150m)
    if (accuracy > 150) return;

    try {
      const info = await reverseGeocode(latitude, longitude);
      setLocation(info);

      if (voiceEnabledRef.current) {
        const msg = isTamil
          ? `நீங்கள் ${info.address} இல் உள்ளீர்கள்.`
          : `You are at ${info.address}.`;
        if (msg !== lastAnnouncedRef.current) {
          lastAnnouncedRef.current = msg;
          speak(msg, 0.9, lang);
        }
      }

      // ── Navigation proximity logic ──────────────────────────────────
      const rr = routeResultRef.current;
      if (!navStartedRef.current || !rr) return;

      const curStep = activeStepRef.current;
      const steps = rr.steps;

      // Off-route check
      const offR = isOffRoute(latitude, longitude, rr.routeCoords, OFF_ROUTE_M);
      setOffRoute(offR);
      if (offR && !offRouteWarnedRef.current) {
        offRouteWarnedRef.current = true;
        if (voiceEnabledRef.current) {
          speak(
            isTamil
              ? 'நீங்கள் வழியிலிருந்து விலகியுள்ளீர்கள். வழியை மீண்டும் கணக்கிடுகிறோம்.'
              : 'You are off route. Recalculating…',
            0.9, lang,
          );
        }
      } else if (!offR) {
        offRouteWarnedRef.current = false;
      }

      // Distance to next step waypoint
      const nextStepIdx = curStep < steps.length - 1 ? curStep + 1 : curStep;
      const nextStep = steps[nextStepIdx];
      if (nextStep?.lat !== undefined && nextStep?.lng !== undefined) {
        const dist = haversineMetres(latitude, longitude, nextStep.lat, nextStep.lng);
        setDistToNext(dist);

        // Advance warning ("Turn left in 80m")
        if (
          dist <= ADVANCE_WARN_M &&
          advanceWarnedRef.current !== nextStepIdx &&
          nextStepIdx !== curStep
        ) {
          advanceWarnedRef.current = nextStepIdx;
          if (voiceEnabledRef.current) {
            const inXm = isTamil ? `${fmtDistance(dist)} தூரத்தில்` : `in ${fmtDistance(dist)}`;
            speak(`${inXm} — ${voiceInstruction(nextStep, lang)}`, 0.9, lang);
          }
        }

        // Auto-advance when within STEP_ADVANCE_M
        if (dist <= STEP_ADVANCE_M && nextStepIdx > curStep) {
          const newStep = nextStepIdx;
          setActiveStep(newStep);
          activeStepRef.current = newStep;
          if (voiceEnabledRef.current && stepAnnouncedRef.current !== newStep) {
            stepAnnouncedRef.current = newStep;
            const s = steps[newStep];
            if (s.maneuver === 'arrive') {
              speak(
                isTamil ? 'நீங்கள் உங்கள் இலக்கை அடைந்துவிட்டீர்கள்!' : 'You have reached your destination!',
                0.9, lang,
              );
            } else {
              speak(voiceInstruction(s, lang), 0.9, lang);
            }
          }
        }
      }
    } catch {
      setLocation({ lat: latitude, lng: longitude, address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTamil, lang]);

  // ─── Get current location (one-shot) ───────────────────────────────────
  const getLocation = async () => {
    setError(null);
    setLoading(true);
    if (!navigator.geolocation) {
      setError(isTamil ? 'உங்கள் உலாவி இருப்பிட சேவையை ஆதரிக்கவில்லை.' : 'Geolocation is not supported.');
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => { await handlePosition(pos); setLoading(false); },
      (err) => {
        setError(`${isTamil ? 'இருப்பிடம் கிடைக்கவில்லை' : 'Could not get location'}: ${err.message}`);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  // ─── Route calculation ──────────────────────────────────────────────────
  const calculateRoute = async () => {
    if (!destination.trim() || !location) return;
    setRouteLoading(true);
    setError(null);
    setRouteResult(null);
    setActiveStep(0);
    setOffRoute(false);
    setDistToNext(null);
    stepAnnouncedRef.current = -1;
    advanceWarnedRef.current = -1;
    offRouteWarnedRef.current = false;
    try {
      const geo = await geocodeDestination(destination, isTamil ? 'ta' : 'en');
      if (!geo) throw new Error(isTamil ? 'இலக்கு கண்டுபிடிக்கவில்லை' : 'Destination not found');
      setDestAddress(geo.display);

      const result = await fetchRoute(location.lat, location.lng, geo.lat, geo.lng, lang);
      setRouteResult(result);
      routeResultRef.current = result;

      if (voiceEnabled) {
        const msg = isTamil
          ? `வழி கண்டுபிடிக்கப்பட்டது. மொத்த தூரம் ${result.totalDistance}. ${result.totalDuration} ஆகும்.`
          : `Route found. Total distance ${result.totalDistance}. Estimated time ${result.totalDuration}.`;
        speak(msg, 0.9, lang);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Route calculation failed';
      setError(message);
      if (voiceEnabled) speak(isTamil ? 'வழி கண்டுபிடிக்கவில்லை.' : 'Could not find a route.', 0.9, lang);
    } finally {
      setRouteLoading(false);
    }
  };

  // ─── Navigation controls ────────────────────────────────────────────────
  const startNavigation = () => {
    if (!routeResult) return;
    setNavigationStarted(true);
    navStartedRef.current = true;
    setActiveStep(0);
    activeStepRef.current = 0;
    stepAnnouncedRef.current = -1;
    advanceWarnedRef.current = -1;
    offRouteWarnedRef.current = false;
    if (voiceEnabled) {
      const first = routeResult.steps[0];
      speak(
        first ? voiceInstruction(first, lang) : (isTamil ? 'வழிகாட்டுதல் தொடங்கியது.' : 'Navigation started.'),
        0.9, lang,
      );
      stepAnnouncedRef.current = 0;
    }
    // Auto-start live GPS tracking
    startTracking();
  };

  const stopNavigation = () => {
    setNavigationStarted(false);
    navStartedRef.current = false;
    setOffRoute(false);
    setDistToNext(null);
    stopSpeaking();
    if (voiceEnabled) speak(isTamil ? 'வழிகாட்டுதல் நிறுத்தப்பட்டது.' : 'Navigation stopped.', 0.9, lang);
    stopTracking();
  };

  const nextStep = () => {
    if (!routeResult) return;
    const next = Math.min(activeStep + 1, routeResult.steps.length - 1);
    setActiveStep(next);
    activeStepRef.current = next;
    if (voiceEnabled && stepAnnouncedRef.current !== next) {
      stepAnnouncedRef.current = next;
      const step = routeResult.steps[next];
      if (step.maneuver === 'arrive') {
        speak(isTamil ? 'நீங்கள் உங்கள் இலக்கை அடைந்துவிட்டீர்கள்!' : 'You have reached your destination!', 0.9, lang);
      } else {
        speak(voiceInstruction(step, lang), 0.9, lang);
      }
    }
  };

  const prevStep = () => {
    const prev = Math.max(activeStep - 1, 0);
    setActiveStep(prev);
    activeStepRef.current = prev;
    if (voiceEnabled && routeResult) speak(voiceInstruction(routeResult.steps[prev], lang), 0.9, lang);
  };

  const readCurrentStep = () => {
    if (!routeResult) return;
    speak(voiceInstruction(routeResult.steps[activeStep], lang), 0.9, lang);
  };

  // ─── Live tracking ──────────────────────────────────────────────────────
  const startTracking = () => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  };

  // ─── Effects ────────────────────────────────────────────────────────────
  useEffect(() => { lastAnnouncedRef.current = ''; }, [lang]);
  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    stopSpeaking();
  }, []);

  // ─── Voice commands for navigation ───────────────────────────────────────
  const navCommands = useMemo(() => [
    {
      patterns: ['get my location', 'where am i', 'my location', 'find me',
                 'என் இருப்பிடம்', 'நான் எங்கே', 'இருப்பிடம் பெறு'],
      action: getLocation,
      confirmEn: 'Getting your location.',
      confirmTa: 'உங்கள் இருப்பிடம் பெறுகிறது.',
    },
    {
      patterns: ['start navigation', 'begin navigation', 'go', 'navigate',
                 'வழிகாட்டுதல் தொடங்கு', 'போகலாம்'],
      action: () => { if (routeResultRef.current) startNavigation(); else speak(isTamil ? 'முதலில் வழியை கணக்கிடவும்.' : 'Please calculate a route first.', 0.9, lang); },
      confirmEn: 'Starting navigation.',
      confirmTa: 'வழிகாட்டுதல் தொடங்குகிறது.',
    },
    {
      patterns: ['stop navigation', 'end navigation', 'cancel navigation',
                 'வழிகாட்டுதல் நிறுத்து', 'வழிகாட்டுதல் ரத்து'],
      action: stopNavigation,
      confirmEn: 'Navigation stopped.',
      confirmTa: 'வழிகாட்டுதல் நிறுத்தப்பட்டது.',
    },
    {
      patterns: ['next step', 'next turn', 'next direction',
                 'அடுத்த படி', 'அடுத்த திருப்பம்'],
      action: nextStep,
      confirmEn: 'Next step.',
      confirmTa: 'அடுத்த படி.',
    },
    {
      patterns: ['previous step', 'go back', 'previous direction',
                 'முந்தைய படி', 'திரும்பு'],
      action: prevStep,
      confirmEn: 'Previous step.',
      confirmTa: 'முந்தைய படி.',
    },
    {
      patterns: ['repeat', 'say again', 'repeat direction', 'read step',
                 'மீண்டும் சொல்', 'திசையை படி'],
      action: readCurrentStep,
      confirmEn: 'Repeating current direction.',
      confirmTa: 'தற்போதைய திசையை மீண்டும் சொல்கிறது.',
    },
    {
      patterns: ['recalculate', 'reroute', 'recalculate route',
                 'வழியை மீண்டும் கணக்கிடு', 'புதிய வழி'],
      action: calculateRoute,
      confirmEn: 'Recalculating route.',
      confirmTa: 'வழியை மீண்டும் கணக்கிடுகிறது.',
    },
    {
      patterns: ['read location', 'current address', 'where exactly',
                 'இருப்பிடம் படி', 'தற்போதைய முகவரி'],
      action: () => {
        if (location) speak(isTamil ? `நீங்கள் ${location.address} இல் உள்ளீர்கள்.` : `You are at ${location.address}.`, 0.9, lang);
        else speak(isTamil ? 'இருப்பிடம் கிடைக்கவில்லை.' : 'Location not available.', 0.9, lang);
      },
      confirmEn: 'Reading your location.',
      confirmTa: 'இருப்பிடத்தை படிக்கிறது.',
    },
    {
      patterns: ['help', 'commands', 'what can i say', 'உதவி', 'கட்டளைகள்'],
      action: () => speak(
        isTamil
          ? 'கட்டளைகள்: என் இருப்பிடம், வழிகாட்டுதல் தொடங்கு, நிறுத்து, அடுத்த படி, முந்தைய படி, மீண்டும் சொல், இருப்பிடம் படி'
          : 'Commands: get my location, start navigation, stop navigation, next step, previous step, repeat, read location.',
        0.88, lang,
      ),
      confirmEn: 'Listing commands.',
      confirmTa: 'கட்டளைகளை அறிவிக்கிறது.',
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [getLocation, startNavigation, stopNavigation, nextStep, prevStep, readCurrentStep, calculateRoute, isTamil, lang, location]);

  const { listening: vcListening, transcript: vcTranscript, supported: vcSupported, toggle: vcToggle } =
    usePageVoiceCommands({
      lang,
      commands: navCommands,
      activateMessageEn: 'Navigation voice commands active. Say "get my location", "start navigation", or "help".',
      activateMessageTa: 'வழிகாட்டுதல் குரல் கட்டளைகள் இயக்கப்பட்டது. "என் இருப்பிடம்", "வழிகாட்டுதல் தொடங்கு" என்று சொல்லுங்கள்.',
    });

  if (!user) return null;

  const currentStep = routeResult?.steps[activeStep];
  const isArrived = currentStep?.maneuver === 'arrive';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
              <Navigation2 className="w-5 h-5 text-secondary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">
              {isTamil ? 'GPS வழிகாட்டுதல்' : 'GPS Navigation'}
            </h1>
          </div>
          <p className="text-muted-foreground text-sm ml-13">
            {isTamil
              ? 'நேரடி GPS கண்காணிப்பு மற்றும் குரல் வழிகாட்டுதல்'
              : 'Real-time GPS tracking with automatic step advancement & voice guidance'}
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
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-2 flex items-center gap-2 text-xs text-destructive font-medium">
          <Mic className="w-3.5 h-3.5 animate-pulse flex-shrink-0" />
          <span>{isTamil ? 'கேட்டது: ' : 'Heard: '}<em className="not-italic font-semibold">"{vcTranscript}"</em></span>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => { setVoiceEnabled(v => !v); voiceEnabledRef.current = !voiceEnabled; if (voiceEnabled) stopSpeaking(); }}
          aria-label={voiceEnabled ? 'Disable voice' : 'Enable voice'}
        >
          {voiceEnabled ? <Volume2 className="w-4 h-4 mr-2" /> : <VolumeX className="w-4 h-4 mr-2" />}
          {isTamil ? (voiceEnabled ? 'குரல் இயக்கம்' : 'குரல் நிறுத்தம்') : `Voice ${voiceEnabled ? 'On' : 'Off'}`}
        </Button>
        <Button onClick={getLocation} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {isTamil ? 'என் இருப்பிடம் பெறு' : 'Get My Location'}
        </Button>
        {!tracking ? (
          <Button variant="secondary" onClick={startTracking} disabled={!location}>
            <Navigation2 className="w-4 h-4 mr-2" />
            {isTamil ? 'நேரடி கண்காணிப்பு' : 'Live Track'}
          </Button>
        ) : (
          <Button variant="destructive" onClick={stopTracking}>
            {isTamil ? 'கண்காணிப்பு நிறுத்து' : 'Stop Tracking'}
          </Button>
        )}
      </div>

      {tracking && (
        <div className="flex items-center gap-2 text-sm text-secondary">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          {isTamil ? 'உங்கள் இருப்பிடத்தை கண்காணிக்கிறது…' : 'Live GPS tracking active…'}
        </div>
      )}

      {/* Off-route warning */}
      {offRoute && navigationStarted && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-3 flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{isTamil ? 'நீங்கள் வழியிலிருந்து விலகியுள்ளீர்கள்! வழியை மீண்டும் திட்டமிடவும்.' : 'You appear to be off route! Re-plan or continue.'}</span>
            <Button size="sm" variant="destructive" className="ml-auto" onClick={calculateRoute} disabled={routeLoading}>
              {isTamil ? 'மீண்டும் திட்டமிடு' : 'Recalculate'}
            </Button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex items-start gap-2 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Current location + Map */}
      {location && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="w-4 h-4 text-primary" />
              {isTamil ? 'உங்கள் தற்போதைய இருப்பிடம்' : 'Your Current Location'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/50 text-foreground font-medium text-sm" aria-live="polite">
              📍 {location.address}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded bg-muted">Lat: {location.lat.toFixed(5)}</span>
              <span className="px-2 py-1 rounded bg-muted">Lng: {location.lng.toFixed(5)}</span>
              {location.city && <span className="px-2 py-1 rounded bg-muted">{location.city}</span>}
              {location.country && <span className="px-2 py-1 rounded bg-muted">{location.country}</span>}
            </div>

            {/* Distance to next step */}
            {navigationStarted && distToNext !== null && !isArrived && (
              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <Navigation2 className="w-4 h-4" />
                {isTamil
                  ? `அடுத்த திருப்பம் வரை: ${fmtDistance(distToNext)}`
                  : `Distance to next turn: ${fmtDistance(distToNext)}`}
              </div>
            )}

            {/* Leaflet Map */}
            <div className="h-56 w-full rounded-lg overflow-hidden border border-border">
              <Suspense fallback={
                <div className="h-full w-full bg-muted flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />Loading map…
                </div>
              }>
                <MapView
                  currentLat={location.lat}
                  currentLng={location.lng}
                  currentAddress={location.address}
                  destLat={routeResult?.destLat}
                  destLng={routeResult?.destLng}
                  destAddress={destAddress}
                  routeCoords={routeResult?.routeCoords}
                  activeStepIndex={navigationStarted ? activeStep : undefined}
                />
              </Suspense>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => speak(
                isTamil ? `நீங்கள் ${location.address} இல் உள்ளீர்கள்.` : `You are at ${location.address}.`,
                0.9, lang,
              )}
            >
              <Volume2 className="w-4 h-4 mr-1" />
              {isTamil ? 'சத்தமாக படி' : 'Read Location Aloud'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Route planner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Route className="w-4 h-4 text-primary" />
            {isTamil ? 'வழிகாட்டுதல் திட்டமிடு' : 'Plan Your Route'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder={isTamil ? 'இலக்கை உள்ளிடவும் (எ.கா. சென்னை மத்திய)' : 'Enter destination (e.g. Chennai Central)'}
              value={destination}
              onChange={e => setDestination(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && calculateRoute()}
              aria-label="Destination address"
              disabled={routeLoading}
            />
            <Button onClick={calculateRoute} disabled={!destination.trim() || !location || routeLoading}>
              {routeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span className="ml-2 hidden sm:inline">{isTamil ? 'வழி தேடு' : 'Get Route'}</span>
            </Button>
          </div>

          {!location && (
            <p className="text-xs text-muted-foreground">
              {isTamil ? 'முதலில் உங்கள் இருப்பிடத்தை பெறவும்.' : 'Get your location first to calculate a route.'}
            </p>
          )}

          {routeResult && (
            <div className="space-y-4 pt-1">
              {/* Summary badges */}
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
                  <Route className="w-3.5 h-3.5" />
                  {routeResult.totalDistance}
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 text-secondary font-medium">
                  🕒 {routeResult.totalDuration}
                </span>
                {destAddress && (
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    🏁 {destAddress.split(',').slice(0, 2).join(',')}
                  </span>
                )}
              </div>

              {/* Navigation control bar */}
              {!navigationStarted ? (
                <Button className="w-full" onClick={startNavigation}>
                  <Navigation2 className="w-4 h-4 mr-2" />
                  {isTamil ? 'வழிகாட்டுதல் தொடங்கு' : 'Start Navigation'}
                </Button>
              ) : (
                <div className="space-y-3">
                  {/* Active step banner */}
                  {currentStep && (
                    <div className={`p-4 rounded-lg flex items-start gap-3 ${isArrived ? 'bg-accent border border-border' : 'bg-primary/10 border border-primary/30'}`}>
                      {isArrived
                        ? <CheckCircle2 className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                        : <Navigation2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      }
                      <div>
                        <p className={`font-semibold text-sm ${isArrived ? 'text-secondary' : 'text-primary'}`}>
                          {currentStep.instruction}
                        </p>
                        {currentStep.distance && (
                          <p className="text-xs text-muted-foreground mt-0.5">{currentStep.distance}</p>
                        )}
                        {distToNext !== null && !isArrived && (
                          <p className="text-xs text-primary/70 mt-0.5">
                            📍 {isTamil ? `அடுத்த: ${fmtDistance(distToNext)}` : `Next turn in ${fmtDistance(distToNext)}`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step buttons */}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={prevStep} disabled={activeStep === 0}>
                      <ChevronLeft className="w-4 h-4" />
                      {isTamil ? 'முந்தையது' : 'Previous'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={readCurrentStep} className="flex-1">
                      <Volume2 className="w-4 h-4 mr-1" />
                      {isTamil ? 'மீண்டும் படி' : 'Repeat'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={nextStep} disabled={isArrived}>
                      {isTamil ? 'அடுத்தது' : 'Next'}
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  <Button variant="destructive" size="sm" className="w-full" onClick={stopNavigation}>
                    {isTamil ? 'வழிகாட்டுதல் நிறுத்து' : 'Stop Navigation'}
                  </Button>
                </div>
              )}

              {/* Step list */}
              <RouteSteps
                steps={routeResult.steps}
                activeIndex={navigationStarted ? activeStep : -1}
                isTamil={isTamil}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Street View card */}
      {location && (
        <StreetViewCard lat={location.lat} lng={location.lng} isTamil={isTamil} />
      )}
    </div>
  );
}
