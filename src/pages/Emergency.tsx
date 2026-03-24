import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { speak } from '@/lib/speech';
import { usePageVoiceCommands } from '@/hooks/usePageVoiceCommands';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Phone, MapPin, Plus, Trash2, Siren, Mic, MicOff } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  phone: string;
}

const STORAGE_KEY = 'ai_guide_emergency_contacts';

export default function Emergency() {
  const { user } = useAuth();
  const { lang, isTamil } = useLanguage();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [sosSent, setSosSent] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { try { setContacts(JSON.parse(saved)); } catch {} }
  }, []);

  const saveContacts = (updated: Contact[]) => {
    setContacts(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const addContact = useCallback(() => {
    if (!newName.trim() || !newPhone.trim()) return;
    const updated = [...contacts, { id: Date.now().toString(), name: newName.trim(), phone: newPhone.trim() }];
    saveContacts(updated);
    setNewName('');
    setNewPhone('');
    speak(isTamil ? 'தொடர்பு சேர்க்கப்பட்டது.' : 'Contact added.', 0.95, lang);
  }, [contacts, newName, newPhone, isTamil, lang]);

  const removeContact = (id: string) => {
    saveContacts(contacts.filter(c => c.id !== id));
  };

  const getLocation = (): Promise<{ lat: number; lng: number }> => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { timeout: 10000, enableHighAccuracy: true },
    );
  });

  const sendSOS = useCallback(async () => {
    setSosSent(false);
    setLocating(true);
    speak(isTamil ? 'SOS அனுப்புகிறது. உங்கள் இருப்பிடம் பெறுகிறது.' : 'Sending SOS. Getting your location.', 0.95, lang);

    let loc: { lat: number; lng: number } | null = null;
    try {
      loc = await getLocation();
      setLocation(loc);
    } catch {
      speak(isTamil ? 'இருப்பிடம் கிடைக்கவில்லை. இருப்பிடம் இல்லாமல் SOS அனுப்புகிறது.' : 'Could not get location. Sending SOS without location.', 0.95, lang);
    }
    setLocating(false);

    const mapsLink = loc ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : 'Location unavailable';
    const message = encodeURIComponent(
      `🚨 EMERGENCY SOS 🚨\nI need help!\n${loc ? `My location: ${mapsLink}` : 'Location unavailable'}\nSent from AI Guide app.`,
    );

    if (contacts.length > 0) {
      const numbers = contacts.map(c => c.phone).join(',');
      window.open(`sms:${numbers}?body=${message}`);
    } else {
      try { await navigator.clipboard.writeText(decodeURIComponent(message)); } catch {}
    }

    setSosSent(true);
    speak(isTamil ? 'SOS அனுப்பப்பட்டது! உதவி வருகிறது. அமைதியாக இருங்கள்.' : 'SOS message sent. Help is on the way. Stay calm.', 0.95, lang);
  }, [contacts, isTamil, lang]);

  const callPolice = useCallback(() => {
    speak(isTamil ? 'காவல்துறையை அழைக்கிறது — 100.' : 'Calling Police at 100.', 0.95, lang);
    setTimeout(() => { window.location.href = 'tel:100'; }, 600);
  }, [isTamil, lang]);

  const callAmbulance = useCallback(() => {
    speak(isTamil ? 'ஆம்புலன்சை அழைக்கிறது — 108.' : 'Calling Ambulance at 108.', 0.95, lang);
    setTimeout(() => { window.location.href = 'tel:108'; }, 600);
  }, [isTamil, lang]);

  const callFire = useCallback(() => {
    speak(isTamil ? 'தீயணைப்பு படையை அழைக்கிறது — 101.' : 'Calling Fire department at 101.', 0.95, lang);
    setTimeout(() => { window.location.href = 'tel:101'; }, 600);
  }, [isTamil, lang]);

  const readContacts = useCallback(() => {
    if (contacts.length === 0) {
      speak(isTamil ? 'தொடர்பு எதுவும் சேர்க்கப்படவில்லை.' : 'No emergency contacts added yet.', 0.95, lang);
      return;
    }
    const names = contacts.map(c => c.name).join(', ');
    speak(isTamil ? `${contacts.length} தொடர்புகள்: ${names}.` : `${contacts.length} contact${contacts.length > 1 ? 's' : ''}: ${names}.`, 0.95, lang);
  }, [contacts, isTamil, lang]);

  // ─── Voice commands ───────────────────────────────────────────────────────
  const commands = useMemo(() => [
    {
      patterns: ['sos', 'send sos', 'emergency', 'help me', 'call help', 'i need help',
                 'அவசரநிலை', 'உதவி அழை', 'SOS அனுப்பு', 'எனக்கு உதவி வேண்டும்'],
      action: sendSOS,
      confirmEn: 'Sending SOS now.',
      confirmTa: 'இப்போது SOS அனுப்புகிறது.',
    },
    {
      patterns: ['call police', 'police', 'call 100', 'காவல்துறை', '100 அழை'],
      action: callPolice,
      confirmEn: 'Calling Police.',
      confirmTa: 'காவல்துறையை அழைக்கிறது.',
    },
    {
      patterns: ['call ambulance', 'ambulance', 'call 108', 'ஆம்புலன்ஸ்', '108 அழை'],
      action: callAmbulance,
      confirmEn: 'Calling Ambulance.',
      confirmTa: 'ஆம்புலன்சை அழைக்கிறது.',
    },
    {
      patterns: ['call fire', 'fire brigade', 'fire department', 'call 101', 'தீயணைப்பு', '101 அழை'],
      action: callFire,
      confirmEn: 'Calling Fire department.',
      confirmTa: 'தீயணைப்பு படையை அழைக்கிறது.',
    },
    {
      patterns: ['read contacts', 'list contacts', 'my contacts', 'who are my contacts',
                 'தொடர்புகளை படி', 'என் தொடர்புகள்'],
      action: readContacts,
      confirmEn: 'Reading emergency contacts.',
      confirmTa: 'அவசரகால தொடர்புகளை படிக்கிறது.',
    },
    {
      patterns: ['help', 'commands', 'what can i say', 'உதவி', 'கட்டளைகள்'],
      action: () => speak(
        isTamil
          ? 'கட்டளைகள்: SOS அனுப்பு, காவல்துறை அழை, ஆம்புலன்ஸ் அழை, தீயணைப்பு அழை, தொடர்புகளை படி'
          : 'Commands: send SOS, call police, call ambulance, call fire, read contacts.',
        0.88, lang,
      ),
      confirmEn: 'Listing commands.',
      confirmTa: 'கட்டளைகளை அறிவிக்கிறது.',
    },
  ], [sendSOS, callPolice, callAmbulance, callFire, readContacts, isTamil, lang]);

  const { listening: vcListening, transcript: vcTranscript, supported: vcSupported, toggle: vcToggle } =
    usePageVoiceCommands({
      lang,
      commands,
      activateMessageEn: 'Emergency voice commands active. Say "send SOS", "call police", or "help".',
      activateMessageTa: 'அவசரகால குரல் கட்டளைகள் இயக்கப்பட்டது. "SOS அனுப்பு", "காவல்துறை அழை" என்று சொல்லுங்கள்.',
    });

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Siren className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {isTamil ? 'அவசர உதவி' : 'Emergency Assistance'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isTamil
                ? 'GPS இருப்பிடத்துடன் SOS அனுப்பு அல்லது அவசர சேவைகளை அழை'
                : 'Send SOS with GPS location to emergency contacts instantly'}
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

      {/* SOS Button */}
      <Card className="mb-8 border-destructive/30">
        <CardContent className="p-8 flex flex-col items-center text-center gap-4">
          <button
            onClick={sendSOS}
            disabled={locating}
            className="w-40 h-40 rounded-full bg-destructive text-destructive-foreground text-2xl font-black shadow-2xl active:scale-95 transition-transform flex flex-col items-center justify-center gap-1 focus-visible:ring-4 focus-visible:ring-destructive/50 disabled:opacity-60"
            aria-label="Send emergency SOS"
          >
            <AlertTriangle className="w-10 h-10" />
            <span>{locating ? (isTamil ? 'இருப்பிடம் தேடுகிறது…' : 'Locating…') : 'SOS'}</span>
          </button>

          {sosSent && (
            <div
              className="mt-2 px-4 py-2 rounded-lg bg-destructive/10 text-destructive font-semibold text-sm"
              role="alert"
              aria-live="assertive"
            >
              ✅ {isTamil ? 'SOS அனுப்பப்பட்டது! உதவி வருகிறது.' : 'SOS sent! Help is on the way.'}
            </div>
          )}

          {location && (
            <a
              href={`https://maps.google.com/?q=${location.lat},${location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-primary underline"
              aria-label="View your location on Google Maps"
            >
              <MapPin className="w-4 h-4" />
              {isTamil ? 'வரைபடத்தில் என் இருப்பிடம் பார்' : 'View my location on Maps'}
            </a>
          )}

          <p className="text-xs text-muted-foreground">
            {isTamil
              ? 'SOS அழுத்தினால் GPS இருப்பிடம் பெற்று அனைத்து தொடர்புகளுக்கும் SMS அனுப்பும்.'
              : 'Pressing SOS will get your GPS location and send an SMS to all emergency contacts.'}
          </p>
        </CardContent>
      </Card>

      {/* Emergency Contacts */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="w-5 h-5 text-primary" />
            {isTamil ? 'அவசரகால தொடர்புகள்' : 'Emergency Contacts'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {isTamil ? 'தொடர்பு எதுவும் சேர்க்கப்படவில்லை. SOS பெறுவதற்கு யாரையாவது சேர்க்கவும்.' : 'No contacts added yet. Add someone who should receive your SOS.'}
            </p>
          )}
          {contacts.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <div className="font-semibold text-foreground">{c.name}</div>
                <a href={`tel:${c.phone}`} className="text-sm text-primary">{c.phone}</a>
              </div>
              <div className="flex gap-2">
                <a
                  href={`tel:${c.phone}`}
                  className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  aria-label={`Call ${c.name}`}
                >
                  <Phone className="w-4 h-4" />
                </a>
                <button
                  onClick={() => removeContact(c.id)}
                  className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  aria-label={`Remove ${c.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <div className="pt-2 border-t border-border space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {isTamil ? 'புதிய தொடர்பு சேர்' : 'Add New Contact'}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="contact-name" className="text-xs text-muted-foreground mb-1 block">
                  {isTamil ? 'பெயர்' : 'Name'}
                </Label>
                <Input
                  id="contact-name"
                  placeholder={isTamil ? 'எ.க. அம்மா' : 'e.g. Mom'}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addContact()}
                />
              </div>
              <div>
                <Label htmlFor="contact-phone" className="text-xs text-muted-foreground mb-1 block">
                  {isTamil ? 'தொலைபேசி எண்' : 'Phone Number'}
                </Label>
                <Input
                  id="contact-phone"
                  placeholder="+1234567890"
                  type="tel"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addContact()}
                />
              </div>
            </div>
            <Button onClick={addContact} disabled={!newName.trim() || !newPhone.trim()} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              {isTamil ? 'தொடர்பு சேர்' : 'Add Contact'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* National emergency numbers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isTamil ? 'தேசிய அவசர எண்கள்' : 'National Emergency Numbers'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          {[
            { label: isTamil ? 'காவல்துறை' : 'Police', number: '100', emoji: '🚔', action: callPolice },
            { label: isTamil ? 'ஆம்புலன்ஸ்' : 'Ambulance', number: '108', emoji: '🚑', action: callAmbulance },
            { label: isTamil ? 'தீயணைப்பு' : 'Fire', number: '101', emoji: '🚒', action: callFire },
          ].map(({ label, number, emoji, action }) => (
            <button
              key={number}
              onClick={action}
              className="flex flex-col items-center gap-1 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-center"
              aria-label={`Call ${label} at ${number}`}
            >
              <span className="text-2xl">{emoji}</span>
              <span className="font-bold text-foreground">{number}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
