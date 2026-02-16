import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getUserHistory } from '@/lib/detection-history';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, History, Eye, ArrowRight } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  const history = getUserHistory(user.id);
  const totalDetections = history.length;
  const totalObjects = history.reduce((sum, r) => sum + r.objects.length, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          Welcome, {user.name}
        </h1>
        <p className="text-muted-foreground mt-1">Your AI vision assistant dashboard</p>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Scans</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{totalDetections}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Objects Detected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{totalObjects}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Member Since</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-foreground">
              {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid sm:grid-cols-2 gap-6">
        <Card className="group hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Upload className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Detect Objects</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Upload or capture an image to identify objects with AI
            </p>
            <Button asChild>
              <Link to="/detect">
                Start Detection <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center mb-4">
              <History className="w-7 h-7 text-secondary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Detection History</h2>
            <p className="text-sm text-muted-foreground mb-4">
              View your past scans and detected objects
            </p>
            <Button asChild variant="outline">
              <Link to="/history">
                View History <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
