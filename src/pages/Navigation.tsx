import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { speak, stopSpeaking } from '@/lib/speech';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MapPin, Navigation2, Volume2, VolumeX, Loader2, RefreshCw, Search } from 'lucide-react';

interface LocationInfo {
  lat: number;
  lng: number;
  address: string;
  suburb?: string;
  city?: string;
  country?: string;
}

export default function Navigation() {
  const { user } = useAuth();
  const { lang, isTamil } = useLanguage();
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastAnnouncedRef = useRef<string>('');

  const reverseGeocode = async (lat: number, lng: number): Promise<LocationInfo> => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': isTamil ? 'ta,en' : 'en' } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const road = addr.road || addr.pedestrian || addr.footway || '';
    const suburb = addr.suburb || addr.neighbourhood || addr.quarter || '';
    const city = addr.city || addr.town || addr.village || '';
    const country = addr.country || '';
    const address = [road, suburb, city].filter(Boolean).join(', ') || data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    return { lat, lng, address, suburb, city, country };
  };

  const getLocation = async () => {
    setError(null);
    setLoading(true);
    if (!navigator.geolocation) {
      setError(isTamil ? 'உங்கள் உலாவி இருப்பிட சேவையை ஆதரிக்கவில்லை.' : 'Geolocation is not supported by your browser.');
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
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

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
      { enableHighAccuracy: true }
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

  const openDirections = () => {
    if (!destination.trim()) return;
    const from = location ? `${location.lat},${location.lng}` : '';
    const dest = encodeURIComponent(destination.trim());
    const url = from
      ? `https://www.google.com/maps/dir/${from}/${dest}`
      : `https://www.google.com/maps/dir//${dest}`;
    window.open(url, '_blank');
    if (voiceEnabled) {
      speak(
        isTamil ? `${destination} க்கு வழிகாட்டுதல் திறக்கிறது.` : `Opening directions to ${destination}.`,
        0.9, lang,
      );
    }
  };

  const speakLocation = () => {
    if (location) {
      speak(
        isTamil ? `நீங்கள் ${location.address} இல் உள்ளீர்கள்.` : `You are at ${location.address}.`,
        0.9, lang,
      );
    }
  };

  useEffect(() => {
    // Re-announce if language changes while location is known
    lastAnnouncedRef.current = '';
  }, [lang]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      stopSpeaking();
    };
  }, []);

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
          <Navigation2 className="w-5 h-5 text-secondary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">
          {isTamil ? 'GPS வழிகாட்டுதல்' : 'GPS Navigation'}
        </h1>
      </div>
      <p className="text-muted-foreground mb-8">
        {isTamil
          ? 'உங்கள் தற்போதைய இருப்பிடத்தை சத்தமாக படிக்கவும், குரல் வழிகாட்டுதலுடன் செல்லவும்'
          : 'Get your current location read aloud and navigate with voice guidance'}
      </p>

      {/* Voice toggle */}
      <div className="flex gap-3 mb-6">
        <Button
          variant="outline"
          onClick={() => {
            setVoiceEnabled(v => !v);
            if (voiceEnabled) stopSpeaking();
          }}
          aria-label={voiceEnabled ? 'Disable voice' : 'Enable voice'}
        >
          {voiceEnabled ? <Volume2 className="w-4 h-4 mr-2" /> : <VolumeX className="w-4 h-4 mr-2" />}
          {isTamil ? (voiceEnabled ? 'குரல் இயக்கம்' : 'குரல் நிறுத்தம்') : `Voice ${voiceEnabled ? 'On' : 'Off'}`}
        </Button>
        <Button onClick={getLocation} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {isTamil ? 'என் இருப்பிடம் பெறு' : 'Get My Location'}
        </Button>
      </div>

      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="p-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {/* Current location */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="w-4 h-4 text-primary" />
            {isTamil ? 'உங்கள் தற்போதைய இருப்பிடம்' : 'Your Current Location'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{isTamil ? 'இருப்பிடம் கண்டறிகிறது…' : 'Getting location…'}</span>
            </div>
          )}
          {location && !loading && (
            <div className="space-y-3">
              <div
                className="p-4 rounded-lg bg-muted/50 text-foreground font-medium"
                aria-live="polite"
              >
                📍 {location.address}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 rounded bg-muted">Lat: {location.lat.toFixed(5)}</span>
                <span className="px-2 py-1 rounded bg-muted">Lng: {location.lng.toFixed(5)}</span>
                {location.city && <span className="px-2 py-1 rounded bg-muted">{location.city}</span>}
                {location.country && <span className="px-2 py-1 rounded bg-muted">{location.country}</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={speakLocation} aria-label="Read location aloud">
                  <Volume2 className="w-4 h-4 mr-1" />
                  {isTamil ? 'சத்தமாக படி' : 'Read Aloud'}
                </Button>
                <a
                  href={`https://maps.google.com/?q=${location.lat},${location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
                  aria-label="Open in Google Maps"
                >
                  <MapPin className="w-4 h-4" />
                  {isTamil ? 'வரைபடத்தில் திற' : 'Open in Maps'}
                </a>
              </div>
            </div>
          )}
          {!location && !loading && (
            <p className="text-sm text-muted-foreground">
              {isTamil
                ? '"என் இருப்பிடம் பெறு" அழுத்தவும்.'
                : 'Press "Get My Location" to find where you are.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Live tracking */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            {isTamil ? 'நேரடி இருப்பிட கண்காணிப்பு' : 'Live Location Tracking'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {isTamil
              ? 'நீங்கள் நகரும்போது தானாக உங்கள் இருப்பிடத்தை அறிவிக்கிறது.'
              : 'Automatically announces your location as you move.'}
          </p>
          {!tracking ? (
            <Button onClick={startTracking} className="w-full">
              <Navigation2 className="w-4 h-4 mr-2" />
              {isTamil ? 'நேரடி கண்காணிப்பு தொடங்கு' : 'Start Live Tracking'}
            </Button>
          ) : (
            <Button onClick={stopTracking} variant="destructive" className="w-full">
              {isTamil ? 'கண்காணிப்பு நிறுத்து' : 'Stop Tracking'}
            </Button>
          )}
          {tracking && (
            <div className="flex items-center gap-2 text-sm text-secondary">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              {isTamil ? 'உங்கள் இருப்பிடத்தை கண்காணிக்கிறது…' : 'Tracking your location…'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Get directions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            {isTamil ? 'வழிகாட்டுதல் பெறு' : 'Get Directions'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder={isTamil ? 'இலக்கை உள்ளிடவும் (எ.கா. சென்னை மத்திய, மருத்துவமனை)' : 'Enter destination (e.g. Chennai Central, hospital)'}
            value={destination}
            onChange={e => setDestination(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && openDirections()}
            aria-label="Destination address"
          />
          <Button onClick={openDirections} disabled={!destination.trim()} className="w-full">
            <Navigation2 className="w-4 h-4 mr-2" />
            {isTamil ? 'வரைபடத்தில் வழி திற' : 'Open Directions in Maps'}
          </Button>
          <p className="text-xs text-muted-foreground">
            {isTamil
              ? 'உங்கள் தற்போதைய இருப்பிடத்திலிருந்து Google Maps இல் படிப்படியான வழிகாட்டுதலை திறக்கிறது.'
              : 'Opens Google Maps with step-by-step navigation from your current location.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
