import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Eye, LogOut, Home, Upload, History, LayoutDashboard,
  Video, FileText, Siren, Navigation2, Users, Banknote, Menu, X
} from 'lucide-react';
import { useState } from 'react';

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

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

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
      </header>

      <main id="main-content" className="flex-1" role="main">
        {children}
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground" role="contentinfo">
        <p>AI Guide for Visually Impaired People — Powered by TensorFlow.js & Web Speech API</p>
      </footer>
    </div>
  );
}
