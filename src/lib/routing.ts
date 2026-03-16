import type { RouteStep } from '@/components/navigation/RouteSteps';

export interface RouteResult {
  steps: RouteStep[];
  routeCoords: [number, number][];
  totalDistance: string;
  totalDuration: string;
  destLat: number;
  destLng: number;
}

/** Geocode a destination address using Nominatim */
export async function geocodeDestination(
  query: string,
  lang = 'en',
): Promise<{ lat: number; lng: number; display: string } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
    { headers: { 'Accept-Language': lang === 'ta' ? 'ta,en' : 'en' } },
  );
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
}

/** Convert metres to a human-readable string */
export function fmtDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** Convert seconds to h/min string */
export function fmtDuration(secs: number): string {
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** Haversine distance between two lat/lng points in metres */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Bearing from point A to point B in degrees (0 = north) */
export function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Find which route step the user is closest to and still needs to complete */
export function findCurrentStep(
  userLat: number,
  userLng: number,
  stepCoords: [number, number][],   // [lat, lng] per step
  activeStep: number,
): number {
  let best = activeStep;
  let bestDist = Infinity;
  // Only look ahead from current step (no going back)
  for (let i = activeStep; i < stepCoords.length; i++) {
    const d = haversineMetres(userLat, userLng, stepCoords[i][0], stepCoords[i][1]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  // Advance if user is within 30m of the step waypoint
  if (bestDist < 30 && best < stepCoords.length - 1) return best + 1;
  return best;
}

/** Return how many metres remain until the next step waypoint */
export function distanceToNextStep(
  userLat: number,
  userLng: number,
  nextCoord: [number, number],
): number {
  return haversineMetres(userLat, userLng, nextCoord[0], nextCoord[1]);
}

/** Check whether user has deviated significantly from the route polyline */
export function isOffRoute(
  userLat: number,
  userLng: number,
  routeCoords: [number, number][],
  thresholdMetres = 50,
): boolean {
  for (const [lat, lng] of routeCoords) {
    if (haversineMetres(userLat, userLng, lat, lng) < thresholdMetres) return false;
  }
  return true;
}

/** Build an English instruction from an OSRM step */
function buildInstruction(step: OsrmStep): string {
  const maneuver = step.maneuver;
  const street = step.name ? `onto ${step.name}` : '';
  const mod = maneuver.modifier ?? '';

  switch (maneuver.type) {
    case 'depart':    return `Head ${mod} ${street}`.trim();
    case 'arrive':    return 'You have reached your destination';
    case 'turn':      return `Turn ${mod} ${street}`.trim();
    case 'new name':  return `Continue ${mod} ${street}`.trim();
    case 'merge':     return `Merge ${mod} ${street}`.trim();
    case 'on ramp':   return `Take the ramp ${mod} ${street}`.trim();
    case 'off ramp':  return `Take the exit ${mod} ${street}`.trim();
    case 'fork':      return `At the fork, keep ${mod} ${street}`.trim();
    case 'end of road': return `At the end of the road, turn ${mod} ${street}`.trim();
    case 'roundabout':
    case 'rotary':    return `Enter the roundabout and exit ${street}`.trim();
    case 'roundabout turn': return `At the roundabout, turn ${mod}`.trim();
    case 'continue':  return `Continue ${mod} ${street}`.trim();
    default:          return step.name ? `Continue on ${step.name}` : 'Continue straight';
  }
}

/** Build a Tamil instruction */
function buildTamilInstruction(step: OsrmStep): string {
  const maneuver = step.maneuver;
  const street = step.name ? ` ${step.name} இல்` : '';
  const mod = maneuver.modifier ?? '';
  const tamilMod =
    mod.includes('left')  ? 'இடதுபுறம்'  :
    mod.includes('right') ? 'வலதுபுறம்'  :
    mod.includes('straight') ? 'நேராக'   : mod;

  switch (maneuver.type) {
    case 'depart':    return `${tamilMod} திசையில் தொடரவும்${street}`;
    case 'arrive':    return 'நீங்கள் உங்கள் இலக்கை அடைந்துவிட்டீர்கள்';
    case 'turn':      return `${tamilMod} திரும்பவும்${street}`;
    case 'roundabout':
    case 'rotary':    return `வட்டச் சாலையில் நுழைந்து வெளியேறவும்${street}`;
    case 'fork':      return `பிரிவில் ${tamilMod} சென்றீர்கள்${street}`;
    default:          return step.name ? `${step.name} வழியாக நேராக செல்லவும்` : 'நேராக செல்லவும்';
  }
}

interface OsrmManeuver {
  type: string;
  modifier?: string;
  location: [number, number];
}

interface OsrmStep {
  maneuver: OsrmManeuver;
  name: string;
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
}

interface OsrmLeg {
  steps: OsrmStep[];
  distance: number;
  duration: number;
}

interface OsrmRoute {
  legs: OsrmLeg[];
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
}

/** Fetch route from OSRM public API */
export async function fetchRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  lang = 'en-US',
): Promise<RouteResult> {
  const isTamil = lang === 'ta-IN';
  const url =
    `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}` +
    `?steps=true&geometries=geojson&overview=full`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM error ${res.status}`);
  const data = await res.json();

  if (!data.routes?.length) throw new Error('No route found');

  const route: OsrmRoute = data.routes[0];

  // Full route polyline (lng,lat → lat,lng for Leaflet)
  const routeCoords: [number, number][] = route.geometry.coordinates.map(
    ([lng, lat]) => [lat, lng],
  );

  // Build step list — attach the maneuver lat/lng for proximity tracking
  const steps: RouteStep[] = route.legs.flatMap((leg: OsrmLeg) =>
    leg.steps.map((step: OsrmStep): RouteStep => ({
      instruction: isTamil ? buildTamilInstruction(step) : buildInstruction(step),
      distance: step.distance > 5 ? fmtDistance(step.distance) : '',
      maneuver: step.maneuver.type,
      modifier: step.maneuver.modifier,
      // store waypoint for live proximity tracking [lat, lng]
      lat: step.maneuver.location[1],
      lng: step.maneuver.location[0],
    })),
  );

  return {
    steps,
    routeCoords,
    totalDistance: fmtDistance(route.distance),
    totalDuration: fmtDuration(route.duration),
    destLat: toLat,
    destLng: toLng,
  };
}

/** Build a voice instruction for a step */
export function voiceInstruction(step: RouteStep, lang = 'en-US'): string {
  return step.instruction;
}
