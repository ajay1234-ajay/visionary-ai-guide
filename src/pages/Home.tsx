import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Eye, Video, Upload, FileText, Users, Banknote,
  Navigation2, Siren, ArrowRight, Volume2, Zap, Shield, Mic
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';

const FEATURE_CARDS = [
  {
    icon: Video,
    title: 'Live Object Detection',
    description: 'Real-time camera AI detects obstacles with proximity warnings and voice alerts.',
    href: '/live-detect',
    color: 'text-primary',
    bg: 'bg-primary/10',
    badge: 'LIVE',
  },
  {
    icon: Upload,
    title: 'Image Detection',
    description: 'Upload or snap a photo — AI identifies all objects with confidence scores.',
    href: '/detect',
    color: 'text-secondary',
    bg: 'bg-secondary/10',
    badge: null,
  },
  {
    icon: FileText,
    title: 'Text Reader (OCR)',
    description: 'Point your camera at any sign, document or label — hear it read aloud.',
    href: '/text-reader',
    color: 'text-accent-foreground',
    bg: 'bg-accent/10',
    badge: null,
  },
  {
    icon: Users,
    title: 'Face Detection',
    description: 'Detect faces in real-time and announce age, gender & expressions.',
    href: '/face-detect',
    color: 'text-primary',
    bg: 'bg-primary/10',
    badge: null,
  },
  {
    icon: Banknote,
    title: 'Currency Recognition',
    description: 'Identify Indian Rupee notes by value using color and visual analysis.',
    href: '/currency',
    color: 'text-secondary',
    bg: 'bg-secondary/10',
    badge: null,
  },
  {
    icon: Navigation2,
    title: 'GPS Navigation',
    description: 'Hear your current location and surroundings announced in real-time.',
    href: '/navigation',
    color: 'text-accent-foreground',
    bg: 'bg-accent/10',
    badge: null,
  },
  {
    icon: Siren,
    title: 'Emergency SOS',
    description: 'One-tap emergency alert with GPS location sent to your saved contacts.',
    href: '/emergency',
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    badge: 'SOS',
  },
];

const HIGHLIGHTS = [
  { icon: Volume2, label: 'Full Voice Feedback', desc: 'Every detection is read aloud automatically' },
  { icon: Zap, label: 'Real-time AI', desc: 'COCO-SSD & TensorFlow.js run directly in your browser' },
  { icon: Shield, label: '100% Private', desc: 'All processing is on-device — nothing leaves your browser' },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      {/* ─── Hero ─────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden px-4 pt-16 pb-12 sm:pt-24 sm:pb-16"
        aria-labelledby="hero-heading"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-secondary/6 pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-5">
              <Eye className="w-4 h-4" />
              AI-Powered Assistive Vision
            </div>
            <h1
              id="hero-heading"
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-tight mb-5"
            >
              See the World with
              <span className="block text-primary">Intelligent Eyes</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              An all-in-one AI assistant for the visually impaired — detects objects, reads text,
              recognises faces, identifies currency, and navigates your surroundings with voice.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg" className="text-base px-8 py-6">
                <Link to={user ? '/live-detect' : '/register'}>
                  <Video className="w-5 h-5 mr-2" />
                  {user ? 'Start Live Detection' : 'Get Started Free'}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-base px-8 py-6">
                <Link to={user ? '/detect' : '/login'}>
                  <Upload className="w-5 h-5 mr-2" />
                  {user ? 'Detect from Image' : 'Sign In'}
                </Link>
              </Button>
            </div>
          </div>

          {/* ─── Two primary modes side-by-side ─── */}
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            {/* Live Detection Card */}
            <Card className="border-2 border-primary/30 bg-card hover:shadow-lg transition-shadow group">
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Video className="w-7 h-7 text-primary" />
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-destructive/15 text-destructive flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse inline-block" />
                    LIVE
                  </span>
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">Live Object Detection</h2>
                <p className="text-sm text-muted-foreground flex-1 mb-5">
                  Open your camera for <strong>real-time AI detection</strong> with proximity warnings.
                  Obstacles are colour-coded (red = close, orange = medium, green = far) and announced
                  every 2.5 seconds via voice.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 mb-5">
                  <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />Bounding boxes with proximity labels</li>
                  <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />⚠ Obstacle warning banner</li>
                  <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />Hands-free voice announcements</li>
                </ul>
                <Button asChild className="w-full group-hover:scale-[1.02] transition-transform">
                  <Link to={user ? '/live-detect' : '/register'}>
                    Launch Live Camera <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Image Detection Card */}
            <Card className="border-2 border-secondary/30 bg-card hover:shadow-lg transition-shadow group">
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-secondary" />
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-secondary/15 text-secondary">
                    UPLOAD
                  </span>
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">Image Object Detection</h2>
                <p className="text-sm text-muted-foreground flex-1 mb-5">
                  Upload any photo or take a new one — our AI draws <strong>bounding boxes</strong> around every
                  detected object and reads the results aloud with confidence percentages.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 mb-5">
                  <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block" />Supports JPG, PNG, WebP</li>
                  <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block" />Auto-reads results on detection</li>
                  <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block" />Saves to detection history</li>
                </ul>
                <Button asChild variant="outline" className="w-full group-hover:scale-[1.02] transition-transform border-secondary/40 text-secondary hover:bg-secondary hover:text-secondary-foreground">
                  <Link to={user ? '/detect' : '/register'}>
                    Detect from Image <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── More Features Grid ──────────────────────────── */}
      <section className="px-4 pb-12" aria-labelledby="features-heading">
        <div className="max-w-5xl mx-auto">
          <h2 id="features-heading" className="text-2xl font-bold text-foreground mb-6 text-center">
            All Assistive Features
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURE_CARDS.filter(f => f.title !== 'Live Object Detection' && f.title !== 'Image Detection').map((f) => (
              <Link
                key={f.href}
                to={user ? f.href : '/register'}
                className="group"
                aria-label={`Go to ${f.title}`}
              >
                <Card className="h-full hover:shadow-md transition-all hover:border-primary/30 group-hover:-translate-y-0.5">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <f.icon className={`w-5 h-5 ${f.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
                          {f.badge && (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                              f.badge === 'SOS'
                                ? 'bg-destructive/15 text-destructive'
                                : 'bg-destructive/15 text-destructive'
                            }`}>
                              {f.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Highlights strip ───────────────────────────── */}
      <section className="bg-muted/40 border-t border-border px-4 py-10">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-6">
          {HIGHLIGHTS.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
