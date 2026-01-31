const UNITS_STORAGE_KEY = 'detour-unit-system';

export type UnitSystem = 'metric' | 'imperial';

export function getUnitSystem(): UnitSystem {
  if (typeof window === 'undefined') return 'metric';
  const stored = localStorage.getItem(UNITS_STORAGE_KEY);
  if (stored === 'imperial') return 'imperial';
  return 'metric';
}

export function setUnitSystem(system: UnitSystem): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(UNITS_STORAGE_KEY, system);
}

const KM_TO_MI = 0.621371;
const M_TO_FT = 3.28084;

/** Format a distance in km for display. */
export function formatDistance(km: number, system: UnitSystem): string {
  if (system === 'imperial') {
    const mi = km * KM_TO_MI;
    if (mi < 0.1) {
      return `${Math.round(km * 1000 * M_TO_FT)} ft`;
    }
    return `${mi.toFixed(mi > 100 ? 0 : 1)} mi`;
  }
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(km > 1000 ? 0 : 1)} km`;
}

/** Format a distance in meters for display. */
export function formatDistanceMeters(
  meters: number,
  system: UnitSystem
): string {
  if (system === 'imperial') {
    const ft = meters * M_TO_FT;
    if (ft >= 5280) {
      return `${(ft / 5280).toFixed(1)} mi`;
    }
    return `${Math.round(ft)} ft`;
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/** Format elevation in meters for display. */
export function formatElevation(meters: number, system: UnitSystem): string {
  if (system === 'imperial') {
    return `${Math.round(meters * M_TO_FT)} ft`;
  }
  return `${meters} m`;
}

/** Format speed from m/s for display. */
export function formatSpeed(
  speedMs: number | null,
  system: UnitSystem
): string {
  if (speedMs === null || speedMs < 0) return '--';
  if (system === 'imperial') {
    return `${Math.round(speedMs * 2.23694)} mph`;
  }
  return `${Math.round(speedMs * 3.6)} km/h`;
}

/** Format area in km² for display. */
export function formatArea(kmSq: number, system: UnitSystem): string {
  if (system === 'imperial') {
    const miSq = kmSq * 0.386102;
    return `${miSq > 1 ? miSq.toFixed(0) : miSq.toFixed(1)} mi²`;
  }
  return `${kmSq > 1 ? kmSq.toFixed(0) : kmSq.toFixed(1)} km²`;
}

/** Format maneuver length (input is in km from Valhalla, multiplied by 1000 already in some places). */
export function formatManeuverLength(
  lengthKm: number,
  system: UnitSystem
): string {
  if (system === 'imperial') {
    const mi = lengthKm * KM_TO_MI;
    if (mi < 0.1) {
      return `${Math.round(lengthKm * 1000 * M_TO_FT)} ft`;
    }
    return `${mi.toFixed(2)} mi`;
  }
  const meters = lengthKm * 1000;
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}
