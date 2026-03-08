import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { speak, stopSpeaking } from '@/lib/speech';
import { fetchRoute, geocodeDestination, voiceInstruction } from '@/lib/routing';
import type { RouteResult } from '@/lib/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import RouteSteps from '@/components/navigation/RouteSteps';
import StreetViewCard from '@/components/navigation/StreetViewCard';
import {
  MapPin, Navigation2, Volume2, VolumeX, Loader2, RefreshCw,
  Search, Route, AlertTriangle, ChevronRight, ChevronLeft, CheckCircle2,
} from 'lucide-react';

// Lazy-load the Leaflet map to avoid SSR issues
const MapView = lazy(() => import('@/components/navigation/MapView'));

interface LocationInfo {
  lat: number;
  lng: number;
  address: string;
  city?: string;
  country?: string;
}

export default function Navigation() {
  const { user } = useAuth();
  const { lang, isTamil } = useLanguage();

  // Location state
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigation / routing state
  const [destination, setDestination] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [destAddress, setDestAddress] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [navigationStarted, setNavigationStarted] = useState(false);

  // Voice & tracking
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastAnnouncedRef = useRef<string>('');
  const stepAnnouncedRef = useRef<number>(-1);

  // ─── Geocode + reverse geocode helpers ───────────────────────────────────
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

  // ─── Get current location ────────────────────────────────────────────────
  const getLocation = async () => {
    setError(null);
    setLoading(true);
    if (!navigator.geolocation) {
      setError(isTamil ? 'உங்கள் உலாவி இருப்பிட சேவையை ஆதரிக்கவில்லை.' : 'Geolocation is not supported.');
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const info = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          setLocation(info);
          if (voiceEnabled) {
            const msg = isTamil
              ? `நீங்கள் தற்போது ${info.address} இல் உள்ளீர்கள்.`
              : `You are currently at ${info.address}.`;
            if (msg !== lastAnnouncedRef.current) {
              lastAnnouncedRef.current = msg;
              speak(msg, 0.9, lang);
            }
          }
        } catch {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, address: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` });
        }
        setLoading(false);
      },
      (err) => {
        setError(`${isTamil ? 'இருப்பிடம் கிடைக்கவில்லை' : 'Could not get location'}: ${err.message}`);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  // ─── Route calculation ───────────────────────────────────────────────────
  const calculateRoute = async () => {
    if (!destination.trim() || !location) return;
    setRouteLoading(true);
    setError(null);
    setRouteResult(null);
    setActiveStep(0);
    stepAnnouncedRef.current = -1;
    try {
      // Geocode destination
      const geo = await geocodeDestination(destination, isTamil ? 'ta' : 'en');
      if (!geo) throw new Error(isTamil ? 'இலக்கு கண்டுபிடிக்கவில்லை' : 'Destination not found');
      setDestAddress(geo.display);

      // Fetch route
      const result = await fetchRoute(location.lat, location.lng, geo.lat, geo.lng, lang);
      setRouteResult(result);

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

  // ─── Navigation step control ─────────────────────────────────────────────
  const startNavigation = () => {
    if (!routeResult) return;
    setNavigationStarted(true);
    setActiveStep(0);
    stepAnnouncedRef.current = -1;
    if (voiceEnabled) {
      const first = routeResult.steps[0];
      speak(first ? voiceInstruction(first, lang) : (isTamil ? 'வழிகாட்டுதல் தொடங்கியது.' : 'Navigation started.'), 0.9, lang);
      stepAnnouncedRef.current = 0;
    }
  };

  const stopNavigation = () => {
    setNavigationStarted(false);
    stopSpeaking();
    if (voiceEnabled) speak(isTamil ? 'வழிகாட்டுதல் நிறுத்தப்பட்டது.' : 'Navigation stopped.', 0.9, lang);
  };

  const nextStep = () => {
    if (!routeResult) return;
    const next = Math.min(activeStep + 1, routeResult.steps.length - 1);
    setActiveStep(next);
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
    if (voiceEnabled && routeResult) {
      speak(voiceInstruction(routeResult.steps[prev], lang), 0.9, lang);
    }
  };

  const readCurrentStep = () => {
    if (!routeResult) return;
    speak(voiceInstruction(routeResult.steps[activeStep], lang), 0.9, lang);
  };

  // ─── Live tracking ───────────────────────────────────────────────────────
  const startTracking = () => {
    if (!navigator.geolocation) return;
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          const info = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          setLocation(info);
          if (voiceEnabled) {
            const msg = isTamil
              ? `நீங்கள் ${info.address} இல் உள்ளீர்கள்.`
              : `You are at ${info.address}.`;
            if (msg !== lastAnnouncedRef.current) {
              lastAnnouncedRef.current = msg;
              speak(msg, 0.9, lang);
            }
          }
        } catch {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, address: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` });
        }
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true },
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
    stopSpeaking();
  };

  // ─── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => { lastAnnouncedRef.current = ''; }, [lang]);
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      stopSpeaking();
    };
  }, []);

  if (!user) return null;

  const currentStep = routeResult?.steps[activeStep];
  const isArrived = currentStep?.maneuver === 'arrive';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
            <Navigation2 className="w-5 h-5 text-secondary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {isTamil ? 'GPS வழிகாட்டுதல்' : 'GPS Navigation'}
          </h1>
        </div>
        <p className="text-muted-foreground ml-13">
          {isTamil
            ? 'குரல் வழிகாட்டுதலுடன் படிப்படியான வழிமுறைகள்'
            : 'Step-by-step directions with voice guidance'}
        </p>
      </div>

      {/* Voice + Location controls */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => { setVoiceEnabled(v => !v); if (voiceEnabled) stopSpeaking(); }}
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
          {isTamil ? 'உங்கள் இருப்பிடத்தை கண்காணிக்கிறது…' : 'Tracking your location…'}
        </div>
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

            {/* Leaflet Map */}
            <div className="h-56 w-full rounded-lg overflow-hidden border border-border">
              <Suspense fallback={<div className="h-full w-full bg-muted flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" />Loading map…</div>}>
                <MapView
                  currentLat={location.lat}
                  currentLng={location.lng}
                  currentAddress={location.address}
                  destLat={routeResult?.destLat}
                  destLng={routeResult?.destLng}
                  destAddress={destAddress}
                  routeCoords={routeResult?.routeCoords}
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

          {/* Route summary + navigation controls */}
          {routeResult && (
            <div className="space-y-4 pt-1">
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
                        ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        : <Navigation2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      }
                      <div>
                        <p className={`font-semibold text-sm ${isArrived ? 'text-green-700 dark:text-green-400' : 'text-primary'}`}>
                          {currentStep.instruction}
                        </p>
                        {currentStep.distance && (
                          <p className="text-xs text-muted-foreground mt-0.5">{currentStep.distance}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step navigation buttons */}
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
