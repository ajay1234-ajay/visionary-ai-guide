import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, getCurrentUser, login as authLogin, register as authRegister, logout as authLogout } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => { success: boolean; error?: string };
  register: (name: string, email: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const login = (email: string, password: string) => {
    const result = authLogin(email, password);
    if (result.success && result.user) setUser(result.user);
    return result;
  };

  const register = (name: string, email: string, password: string) => {
    const result = authRegister(name, email, password);
    if (result.success && result.user) setUser(result.user);
    return result;
  };

  const logout = () => {
    authLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
