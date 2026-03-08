import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage, LanguageProvider } from '@/contexts/LanguageContext';
import { useVoiceCommands } from '@/hooks/useVoiceCommands';
import { Button } from '@/components/ui/button';
import {
  Eye, LogOut, History, LayoutDashboard,
  Video, FileText, Siren, Navigation2, Users, Banknote, Menu, X,
  Mic, MicOff, Upload,
} from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { speak } from '@/lib/speech';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/detect', label: 'Detect', icon: Upload },
  { to: '/live-detect', label: 'Live Camera', icon: Video },
  { to: '/text-reader', label: 'Text Reader', icon: FileText },
  { to: '/face-detect', label: 'Face Detect', icon: Users },
  { to: '/currency', label: 'Currency', icon: Banknote },
  { to: '/navigation', label: 'Navigation', icon: Navigation2 },
  { to: '/emergency', label: 'Emergency', icon: Siren },
  { to: '/history', label: 'History', icon: History },
];

function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  const isTamil = lang === 'ta-IN';
  return (
    <button
      onClick={() => {
        const next = isTamil ? 'en-US' : 'ta-IN';
        setLang(next);
        speak(
          next === 'ta-IN' ? 'தமிழ் குரல் இயக்கப்பட்டது' : 'English voice enabled.',
          0.95,
          next,
        );
      }}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors select-none ${
        isTamil
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:bg-muted'
      }`}
      aria-label={isTamil ? 'Switch to English voice' : 'Switch to Tamil voice'}
      title={isTamil ? 'Switch to English' : 'Switch to Tamil'}
    >
      {isTamil ? 'தமிழ்' : 'EN'}
    </button>
  );
}

// Animated "listening" waveform dots
function ListeningIndicator() {
  return (
    <span className="flex items-end gap-0.5 h-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-0.5 rounded-full bg-current animate-bounce"
          style={{
            height: `${[10, 14, 10, 14][i]}px`,
            animationDelay: `${i * 0.12}s`,
            animationDuration: '0.8s',
          }}
        />
      ))}
    </span>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { lang, isTamil } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Toast-like command feedback
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = (msg: string) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setCommandFeedback(msg);
    feedbackTimerRef.current = setTimeout(() => setCommandFeedback(null), 3000);
  };

  // Build commands list — memoized so they don't recreate on every render
  const helpText = isTamil
    ? 'கட்டளைகள்: கேமரா திற, உரை படி, வழிகாட்டுதல், முகப்பு, டாஷ்போர்டு, முக கண்டறிதல், நாணயம், அவசரநிலை, வரலாறு'
    : 'Commands: open camera, read text, navigation, go home, dashboard, face detect, currency, emergency, history, detect image.';

  const commands = useMemo(() => [
    {
      patterns: ['start detection', 'open camera', 'live camera', 'start camera', 'live detect',
                 'கேமரா திற', 'கண்டறிதல் தொடங்கு', 'நேரடி கேமரா'],
      action: () => { navigate('/live-detect'); showFeedback(isTamil ? 'நேரடி கேமரா திறக்கிறது' : 'Opening Live Camera'); },
      description: 'Opening Live Camera',
      descriptionTa: 'நேரடி கேமரா திறக்கிறது',
    },
    {
      patterns: ['read text', 'text reader', 'scan text', 'ocr', 'open text',
                 'உரை படி', 'உரை வாசி', 'உரை வாசிப்பி'],
      action: () => { navigate('/text-reader'); showFeedback(isTamil ? 'உரை வாசிப்பி திறக்கிறது' : 'Opening Text Reader'); },
      description: 'Opening Text Reader',
      descriptionTa: 'உரை வாசிப்பி திறக்கிறது',
    },
    {
      patterns: ['navigation', 'gps', 'my location', 'where am i', 'go to navigation',
                 'வழிகாட்டுதல்', 'ஜிபிஎஸ்', 'என் இருப்பிடம்'],
      action: () => { navigate('/navigation'); showFeedback(isTamil ? 'வழிகாட்டுதல் திறக்கிறது' : 'Opening Navigation'); },
      description: 'Opening Navigation',
      descriptionTa: 'வழிகாட்டுதல் திறக்கிறது',
    },
    {
      patterns: ['emergency', 'sos', 'call help', 'help me', 'open emergency',
                 'அவசரநிலை', 'உதவி அழை', 'எஸ்ஓஎஸ்'],
      action: () => { navigate('/emergency'); showFeedback(isTamil ? 'அவசரநிலை திறக்கிறது' : 'Opening Emergency'); },
      description: 'Opening Emergency',
      descriptionTa: 'அவசரநிலை திறக்கிறது',
    },
    {
      patterns: ['go home', 'home page', 'home', 'main page',
                 'முகப்பு', 'வீட்டிற்கு', 'முதல் பக்கம்'],
      action: () => { navigate('/'); showFeedback(isTamil ? 'முகப்பு பக்கம் திறக்கிறது' : 'Going to Home page'); },
      description: 'Going to Home page',
      descriptionTa: 'முகப்பு பக்கம் திறக்கிறது',
    },
    {
      patterns: ['dashboard', 'open dashboard',
                 'டாஷ்போர்டு', 'கட்டுப்பட்டை'],
      action: () => { navigate('/dashboard'); showFeedback(isTamil ? 'டாஷ்போர்டு திறக்கிறது' : 'Opening Dashboard'); },
      description: 'Opening Dashboard',
      descriptionTa: 'டாஷ்போர்டு திறக்கிறது',
    },
    {
      patterns: ['face detect', 'face detection', 'detect face', 'faces',
                 'முக கண்டறிதல்', 'முகம் கண்டு'],
      action: () => { navigate('/face-detect'); showFeedback(isTamil ? 'முக கண்டறிதல் திறக்கிறது' : 'Opening Face Detection'); },
      description: 'Opening Face Detection',
      descriptionTa: 'முக கண்டறிதல் திறக்கிறது',
    },
    {
      patterns: ['currency', 'money', 'detect currency', 'currency detection',
                 'நாணயம்', 'பணம்', 'நாணய கண்டறிதல்'],
      action: () => { navigate('/currency'); showFeedback(isTamil ? 'நாணய கண்டறிதல் திறக்கிறது' : 'Opening Currency Detection'); },
      description: 'Opening Currency Detection',
      descriptionTa: 'நாணய கண்டறிதல் திறக்கிறது',
    },
    {
      patterns: ['detect image', 'image detect', 'upload image', 'photo detect',
                 'படம் கண்டறி', 'படம் பதிவேற்று'],
      action: () => { navigate('/detect'); showFeedback(isTamil ? 'படம் கண்டறிதல் திறக்கிறது' : 'Opening Image Detection'); },
      description: 'Opening Image Detection',
      descriptionTa: 'படம் கண்டறிதல் திறக்கிறது',
    },
    {
      patterns: ['history', 'detection history', 'past detections',
                 'வரலாறு', 'கண்டறிதல் வரலாறு'],
      action: () => { navigate('/history'); showFeedback(isTamil ? 'வரலாறு திறக்கிறது' : 'Opening History'); },
      description: 'Opening History',
      descriptionTa: 'வரலாறு திறக்கிறது',
    },
    {
      patterns: ['help', 'what can you do', 'commands', 'list commands',
                 'உதவி', 'என்ன செய்யலாம்', 'கட்டளைகள்'],
      action: () => { speak(helpText, 0.88, lang); showFeedback(isTamil ? 'கட்டளைகள் அறிவிக்கிறது' : 'Announcing available commands'); },
      description: 'Listing available commands',
      descriptionTa: 'கட்டளைகள் அறிவிக்கிறது',
    },
  ], [navigate, lang, isTamil, helpText]);

  const { listening, lastTranscript, supported, toggle } = useVoiceCommands({
    lang,
    commands,
    enabled: true,
  });

  const handleLogout = () => {
    logout();
    navigate('/');
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <header className="border-b border-border bg-card sticky top-0 z-40" role="banner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0" aria-label="AI Guide Home">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Eye className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground hidden sm:inline">
                AI Guide
              </span>
            </Link>

            {/* Desktop nav */}
            {user && (
              <nav className="hidden lg:flex items-center gap-0.5 overflow-x-auto" aria-label="Main navigation">
                {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
                      ${location.pathname === to
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    aria-current={location.pathname === to ? 'page' : undefined}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{label}</span>
                  </Link>
                ))}
              </nav>
            )}

            <div className="flex items-center gap-2">
              {/* Language toggle */}
              <LanguageToggle />

              {/* Voice Command toggle */}
              {supported && (
                <button
                  onClick={toggle}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all select-none ${
                    listening
                      ? 'bg-destructive text-destructive-foreground border-destructive shadow-lg shadow-destructive/30 animate-pulse'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                  aria-label={listening ? 'Stop voice commands' : 'Start voice commands'}
                  title={listening
                    ? (isTamil ? 'குரல் கட்டளைகள் நிறுத்து' : 'Stop voice commands')
                    : (isTamil ? 'குரல் கட்டளைகள் தொடங்கு' : 'Start voice commands')}
                >
                  {listening ? (
                    <>
                      <ListeningIndicator />
                      <span className="hidden sm:inline ml-0.5">
                        {isTamil ? 'கேட்கிறது…' : 'Listening…'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">
                        {isTamil ? 'குரல்' : 'Voice'}
                      </span>
                    </>
                  )}
                </button>
              )}

              {user ? (
                <>
                  <span className="text-sm text-muted-foreground hidden xl:inline">
                    Hi, <strong className="text-foreground">{user.name}</strong>
                  </span>
                  <Button variant="outline" size="sm" onClick={handleLogout} aria-label="Log out" className="hidden lg:flex">
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">Logout</span>
                  </Button>
                  {/* Mobile hamburger */}
                  <button
                    className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
                    onClick={() => setMenuOpen(v => !v)}
                    aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={menuOpen}
                  >
                    {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Login</Button>
                  <Button size="sm" onClick={() => navigate('/register')}>Sign Up</Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {user && menuOpen && (
          <div className="lg:hidden border-t border-border bg-card" role="dialog" aria-label="Mobile navigation">
            <nav className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-2 gap-1" aria-label="Mobile navigation">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${location.pathname === to
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  aria-current={location.pathname === to ? 'page' : undefined}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="col-span-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors mt-1"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </nav>
          </div>
        )}

        {/* Voice command transcript bar */}
        {listening && lastTranscript && (
          <div className="bg-destructive/5 border-t border-destructive/20 px-4 py-1.5 flex items-center gap-2 text-xs text-destructive font-medium">
            <Mic className="w-3.5 h-3.5 flex-shrink-0 animate-pulse" />
            <span className="truncate">
              {isTamil ? 'கேட்டது: ' : 'Heard: '}
              <em className="not-italic font-semibold">"{lastTranscript}"</em>
            </span>
          </div>
        )}
      </header>

      {/* Floating command feedback toast */}
      {commandFeedback && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card border border-border shadow-xl rounded-full px-5 py-2.5 text-sm font-semibold text-foreground animate-in fade-in slide-in-from-bottom-4 duration-300"
          role="status"
          aria-live="polite"
        >
          <Mic className="w-4 h-4 text-primary flex-shrink-0" />
          {commandFeedback}
        </div>
      )}

      <main id="main-content" className="flex-1" role="main">
        {children}
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground" role="contentinfo">
        <p>AI Guide for Visually Impaired People — Powered by TensorFlow.js & Web Speech API</p>
      </footer>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </LanguageProvider>
  );
}
