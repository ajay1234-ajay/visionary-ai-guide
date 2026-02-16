import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Eye, Upload, Volume2, Shield, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const features = [
  {
    icon: Upload,
    title: 'Upload or Capture',
    description: 'Upload an image from your device or capture one with your camera.',
  },
  {
    icon: Eye,
    title: 'AI Object Detection',
    description: 'Our AI identifies objects in the image with bounding boxes and confidence scores.',
  },
  {
    icon: Volume2,
    title: 'Voice Feedback',
    description: 'Hear detected objects spoken aloud so you understand your surroundings.',
  },
  {
    icon: Shield,
    title: 'Secure & Private',
    description: 'All processing happens in your browser. Your images never leave your device.',
  },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 sm:py-32 px-4" aria-labelledby="hero-heading">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-secondary/8" />
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Eye className="w-4 h-4" />
            AI-Powered Vision Assistant
          </div>
          <h1 id="hero-heading" className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6 leading-tight">
            See the World Through
            <span className="block text-primary">Intelligent Eyes</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Upload any image and our AI will detect and describe objects in it,
            then read the results aloud — helping visually impaired users understand their surroundings.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="text-base px-8 py-6">
              <Link to={user ? '/detect' : '/register'}>
                {user ? 'Start Detecting' : 'Get Started Free'}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
            {!user && (
              <Button asChild variant="outline" size="lg" className="text-base px-8 py-6">
                <Link to="/login">I Have an Account</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-muted/40" aria-labelledby="features-heading">
        <div className="max-w-6xl mx-auto">
          <h2 id="features-heading" className="text-3xl font-bold text-center mb-12 text-foreground">
            How It Works
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div
                key={i}
                className="bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
