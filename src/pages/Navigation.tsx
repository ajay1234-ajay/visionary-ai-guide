import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
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
      { headers: { 'Accept-Language': 'en' } }
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
      setError('Geolocation is not supported by your browser.');
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const info = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          setLocation(info);
          if (voiceEnabled) {
            const msg = `You are currently at ${info.address}.`;
            if (msg !== lastAnnouncedRef.current) {
              lastAnnouncedRef.current = msg;
              speak(msg);
            }
          }
        } catch {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, address: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` });
        }
        setLoading(false);
      },
      (err) => {
        setError(`Could not get location: ${err.message}. Please allow location access.`);
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
            const msg = `You are at ${info.address}.`;
            if (msg !== lastAnnouncedRef.current) {
              lastAnnouncedRef.current = msg;
              speak(msg);
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
    if (voiceEnabled) speak(`Opening directions to ${destination}.`);
  };

  const speakLocation = () => {
    if (location) {
      speak(`You are at ${location.address}.`);
    }
  };

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
        <h1 className="text-3xl font-bold text-foreground">GPS Navigation</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        Get your current location read aloud and navigate with voice guidance
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
          Voice {voiceEnabled ? 'On' : 'Off'}
        </Button>
        <Button onClick={getLocation} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Get My Location
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
            <MapPin className="w-4 h-4 text-primary" /> Your Current Location
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Getting location…</span>
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
                  <Volume2 className="w-4 h-4 mr-1" /> Read Aloud
                </Button>
                <a
                  href={`https://maps.google.com/?q=${location.lat},${location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
                  aria-label="Open in Google Maps"
                >
                  <MapPin className="w-4 h-4" /> Open in Maps
                </a>
              </div>
            </div>
          )}
          {!location && !loading && (
            <p className="text-sm text-muted-foreground">
              Press "Get My Location" to find where you are.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Live tracking */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Live Location Tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Automatically announces your location as you move.
          </p>
          {!tracking ? (
            <Button onClick={startTracking} className="w-full">
              <Navigation2 className="w-4 h-4 mr-2" /> Start Live Tracking
            </Button>
          ) : (
            <Button onClick={stopTracking} variant="destructive" className="w-full">
              Stop Tracking
            </Button>
          )}
          {tracking && (
            <div className="flex items-center gap-2 text-sm text-secondary">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              Tracking your location…
            </div>
          )}
        </CardContent>
      </Card>

      {/* Get directions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" /> Get Directions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Enter destination (e.g. Chennai Central, hospital)"
            value={destination}
            onChange={e => setDestination(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && openDirections()}
            aria-label="Destination address"
          />
          <Button onClick={openDirections} disabled={!destination.trim()} className="w-full">
            <Navigation2 className="w-4 h-4 mr-2" /> Open Directions in Maps
          </Button>
          <p className="text-xs text-muted-foreground">
            Opens Google Maps with step-by-step navigation from your current location.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
