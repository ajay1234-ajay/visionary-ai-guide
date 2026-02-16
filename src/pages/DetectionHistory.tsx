import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getUserHistory, deleteRecord, DetectionRecord } from '@/lib/detection-history';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { speak } from '@/lib/speech';
import { Volume2, Trash2, History } from 'lucide-react';

export default function DetectionHistory() {
  const { user } = useAuth();
  const [records, setRecords] = useState<DetectionRecord[]>(() =>
    user ? getUserHistory(user.id) : []
  );

  if (!user) return null;

  const handleDelete = (id: string) => {
    deleteRecord(id);
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  const handleSpeak = (record: DetectionRecord) => {
    const text = record.objects.length > 0
      ? `Detected ${record.objects.length} objects: ${record.objects.map(o => o.name).join(', ')}.`
      : 'No objects detected.';
    speak(text);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-foreground mb-2">Detection History</h1>
      <p className="text-muted-foreground mb-8">Your past object detection scans</p>

      {records.length === 0 ? (
        <Card>
          <CardContent className="p-12 flex flex-col items-center text-center">
            <History className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-1">No scans yet</h2>
            <p className="text-sm text-muted-foreground">
              Upload an image to start detecting objects
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <Card key={record.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <img
                    src={record.imageDataUrl}
                    alt={`Scan from ${new Date(record.timestamp).toLocaleDateString()}`}
                    className="w-full sm:w-40 h-32 object-cover rounded-lg"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground mb-2">
                      {new Date(record.timestamp).toLocaleString()}
                    </p>
                    {record.objects.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {record.objects.map((obj, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                          >
                            {obj.name} ({Math.round(obj.confidence * 100)}%)
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mb-3">No objects detected</p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleSpeak(record)} aria-label="Read results aloud">
                        <Volume2 className="w-3.5 h-3.5 mr-1" /> Listen
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(record.id)} className="text-destructive hover:text-destructive" aria-label="Delete this scan">
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
