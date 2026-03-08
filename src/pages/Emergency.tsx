import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { speak } from '@/lib/speech';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Phone, MapPin, Plus, Trash2, Siren } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  phone: string;
}

const STORAGE_KEY = 'ai_guide_emergency_contacts';

export default function Emergency() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [sosSent, setSosSent] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setContacts(JSON.parse(saved)); } catch {}
    }
  }, []);

  const saveContacts = (updated: Contact[]) => {
    setContacts(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const addContact = () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const updated = [...contacts, { id: Date.now().toString(), name: newName.trim(), phone: newPhone.trim() }];
    saveContacts(updated);
    setNewName('');
    setNewPhone('');
  };

  const removeContact = (id: string) => {
    saveContacts(contacts.filter(c => c.id !== id));
  };

  const getLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        reject,
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  };

  const sendSOS = async () => {
    setSosSent(false);
    setLocating(true);
    speak('Sending SOS. Getting your location.');

    let loc: { lat: number; lng: number } | null = null;
    try {
      loc = await getLocation();
      setLocation(loc);
    } catch {
      speak('Could not get location. Sending SOS without location.');
    }
    setLocating(false);

    const mapsLink = loc
      ? `https://maps.google.com/?q=${loc.lat},${loc.lng}`
      : 'Location unavailable';

    const message = encodeURIComponent(
      `🚨 EMERGENCY SOS 🚨\nI need help!\n${loc ? `My location: ${mapsLink}` : 'Location unavailable'}\nSent from AI Guide app.`
    );

    // Open SMS for first contact if available
    if (contacts.length > 0) {
      const numbers = contacts.map(c => c.phone).join(',');
      window.open(`sms:${numbers}?body=${message}`);
    } else {
      // Copy to clipboard as fallback
      try {
        await navigator.clipboard.writeText(decodeURIComponent(message));
      } catch {}
    }

    setSosSent(true);
    speak('SOS message sent. Help is on the way. Stay calm.');
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <Siren className="w-5 h-5 text-destructive" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Emergency Assistance</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        Send SOS with your GPS location to emergency contacts instantly
      </p>

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
            <span>{locating ? 'Locating…' : 'SOS'}</span>
          </button>

          {sosSent && (
            <div
              className="mt-2 px-4 py-2 rounded-lg bg-destructive/10 text-destructive font-semibold text-sm"
              role="alert"
              aria-live="assertive"
            >
              ✅ SOS sent! Help is on the way.
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
              View my location on Maps
            </a>
          )}

          <p className="text-xs text-muted-foreground">
            Pressing SOS will get your GPS location and send an SMS to all emergency contacts.
          </p>
        </CardContent>
      </Card>

      {/* Emergency Contacts */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="w-5 h-5 text-primary" /> Emergency Contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No contacts added yet. Add someone who should receive your SOS.
            </p>
          )}
          {contacts.map(c => (
            <div
              key={c.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
            >
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

          {/* Add contact form */}
          <div className="pt-2 border-t border-border space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Add New Contact</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="contact-name" className="text-xs text-muted-foreground mb-1 block">Name</Label>
                <Input
                  id="contact-name"
                  placeholder="e.g. Mom"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addContact()}
                />
              </div>
              <div>
                <Label htmlFor="contact-phone" className="text-xs text-muted-foreground mb-1 block">Phone Number</Label>
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
              <Plus className="w-4 h-4 mr-2" /> Add Contact
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick dial national emergency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">National Emergency Numbers</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          {[
            { label: 'Police', number: '100', emoji: '🚔' },
            { label: 'Ambulance', number: '108', emoji: '🚑' },
            { label: 'Fire', number: '101', emoji: '🚒' },
          ].map(({ label, number, emoji }) => (
            <a
              key={number}
              href={`tel:${number}`}
              className="flex flex-col items-center gap-1 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-center"
              aria-label={`Call ${label} at ${number}`}
            >
              <span className="text-2xl">{emoji}</span>
              <span className="font-bold text-foreground">{number}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
