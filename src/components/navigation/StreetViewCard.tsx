import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface StreetViewCardProps {
  lat: number;
  lng: number;
  isTamil: boolean;
}

export default function StreetViewCard({ lat, lng, isTamil }: StreetViewCardProps) {
  const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}&layer=c&cbll=${lat},${lng}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {isTamil ? 'தெரு காட்சி' : 'Street View'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Embedded OSM iframe for map view */}
        <div className="w-full h-44 rounded-lg overflow-hidden border border-border">
          <iframe
            title="Street Map"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.003},${lat - 0.002},${lng + 0.003},${lat + 0.002}&layer=mapnik&marker=${lat},${lng}`}
            width="100%"
            height="100%"
            className="border-0"
            loading="lazy"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => window.open(streetViewUrl, '_blank')}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            {isTamil ? 'தெரு காட்சி திற' : 'Open Street View'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => window.open(mapsUrl, '_blank')}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            {isTamil ? 'வரைபடம் திற' : 'Open in Maps'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {isTamil
            ? 'Google தெரு காட்சி உங்களுக்கு சுற்றுப்புறத்தை காட்டுகிறது.'
            : 'Google Street View shows a 360° view of your surroundings.'}
        </p>
      </CardContent>
    </Card>
  );
}
