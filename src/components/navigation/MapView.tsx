import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons for Vite/Webpack builds
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const currentIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const destinationIcon = new L.DivIcon({
  html: `<div style="background:hsl(var(--destructive,0 72% 51%));width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: '',
});

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], 16, { duration: 1.2 });
  }, [lat, lng, map]);
  return null;
}

function FitRoute({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 1) {
      map.fitBounds(coords as L.LatLngBoundsExpression, { padding: [40, 40] });
    }
  }, [coords, map]);
  return null;
}

interface MapViewProps {
  currentLat: number;
  currentLng: number;
  currentAddress: string;
  destLat?: number;
  destLng?: number;
  destAddress?: string;
  routeCoords?: [number, number][];
  activeStepIndex?: number;
}

export default function MapView({
  currentLat,
  currentLng,
  currentAddress,
  destLat,
  destLng,
  destAddress,
  routeCoords = [],
  activeStepIndex,
}: MapViewProps) {
  const hasRoute = routeCoords.length > 1;

  return (
    <MapContainer
      center={[currentLat, currentLng]}
      zoom={16}
      style={{ height: '100%', width: '100%', borderRadius: '0.5rem', zIndex: 0 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Current location marker */}
      <Marker position={[currentLat, currentLng]} icon={currentIcon}>
        <Popup>📍 {currentAddress}</Popup>
      </Marker>

      {/* Destination marker */}
      {destLat !== undefined && destLng !== undefined && (
        <Marker position={[destLat, destLng]} icon={destinationIcon}>
          <Popup>🏁 {destAddress ?? 'Destination'}</Popup>
        </Marker>
      )}

      {/* Route polyline */}
      {hasRoute && (
        <Polyline
          positions={routeCoords}
          pathOptions={{ color: 'hsl(221, 83%, 53%)', weight: 5, opacity: 0.85 }}
        />
      )}

      {/* Fly to or fit route */}
      {hasRoute ? (
        <FitRoute coords={routeCoords} />
      ) : (
        <FlyTo lat={currentLat} lng={currentLng} />
      )}
    </MapContainer>
  );
}
