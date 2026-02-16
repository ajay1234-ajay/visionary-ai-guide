import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Eye, LogOut, Home, Upload, History, LayoutDashboard } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/detect', label: 'Detect Objects', icon: Upload },
    { to: '/history', label: 'History', icon: History },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="border-b border-border bg-card sticky top-0 z-40" role="banner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2.5 group" aria-label="AI Guide Home">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Eye className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold tracking-tight text-foreground hidden sm:inline">
                AI Guide
              </span>
            </Link>

            {user && (
              <nav className="flex items-center gap-1" aria-label="Main navigation">
                {navItems.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${location.pathname === to
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    aria-current={location.pathname === to ? 'page' : undefined}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden md:inline">{label}</span>
                  </Link>
                ))}
              </nav>
            )}

            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <span className="text-sm text-muted-foreground hidden sm:inline">
                    Hi, <strong className="text-foreground">{user.name}</strong>
                  </span>
                  <Button variant="outline" size="sm" onClick={handleLogout} aria-label="Log out">
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </Button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                    Login
                  </Button>
                  <Button size="sm" onClick={() => navigate('/register')}>
                    Sign Up
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="flex-1" role="main">
        {children}
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground" role="contentinfo">
        <p>AI Guide for Visually Impaired People — Powered by TensorFlow.js</p>
      </footer>
    </div>
  );
}
