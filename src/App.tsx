import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Detect from "./pages/Detect";
import LiveDetect from "./pages/LiveDetect";
import DetectionHistory from "./pages/DetectionHistory";
import TextReader from "./pages/TextReader";
import Emergency from "./pages/Emergency";
import Navigation from "./pages/Navigation";
import FaceDetect from "./pages/FaceDetect";
import CurrencyDetect from "./pages/CurrencyDetect";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/detect" element={<ProtectedRoute><Detect /></ProtectedRoute>} />
              <Route path="/live-detect" element={<ProtectedRoute><LiveDetect /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><DetectionHistory /></ProtectedRoute>} />
              <Route path="/text-reader" element={<ProtectedRoute><TextReader /></ProtectedRoute>} />
              <Route path="/emergency" element={<ProtectedRoute><Emergency /></ProtectedRoute>} />
              <Route path="/navigation" element={<ProtectedRoute><Navigation /></ProtectedRoute>} />
              <Route path="/face-detect" element={<ProtectedRoute><FaceDetect /></ProtectedRoute>} />
              <Route path="/currency" element={<ProtectedRoute><CurrencyDetect /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
