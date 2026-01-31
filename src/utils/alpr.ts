import axios from 'axios';
import { getValhallaUrl } from './valhalla';
import type {
  ActiveWaypoints,
  ValhallaRouteResponse,
  ParsedDirectionsGeometry,
} from '@/components/types';
import { makeLocations, parseDirectionsGeometry } from './valhalla';

export type SurveillanceType =
  | 'alpr'
  | 'traffic_camera'
  | 'speed_camera'
  | 'red_light_camera'
  | 'cctv'
  | 'gunshot_detector'
  | 'other';

export interface SurveillanceNode {
  id: number;
  lat: number;
  lon: number;
  type: SurveillanceType;
}

export const SURVEILLANCE_LABELS: Record<SurveillanceType, string> = {
  alpr: 'ALPR',
  traffic_camera: 'Traffic Camera',
  speed_camera: 'Speed Camera',
  red_light_camera: 'Red Light Camera',
  cctv: 'CCTV',
  gunshot_detector: 'Gunshot Detector',
  other: 'Other',
};

export const SURVEILLANCE_COLORS: Record<SurveillanceType, string> = {
  alpr: '#dc2626',
  speed_camera: '#ea580c',
  red_light_camera: '#d97706',
  traffic_camera: '#ca8a04',
  cctv: '#6b7280',
  gunshot_detector: '#7c3aed',
  other: '#475569',
};

export interface IceActivityNode {
  id: number;
  lat: number;
  lon: number;
  address?: string;
  occurred?: string;
  activity?: string;
}

let cachedIceNodes: IceActivityNode[] | null = null;

export async function loadIceActivityNodes(): Promise<IceActivityNode[]> {
  if (cachedIceNodes) return cachedIceNodes;
  const response = await fetch('http://localhost:8844/api/reports');
  cachedIceNodes = (await response.json()) as IceActivityNode[];
  return cachedIceNodes;
}

export function filterIceNodesByAge(
  nodes: IceActivityNode[],
  maxAgeDays: number
): IceActivityNode[] {
  if (maxAgeDays <= 0) return nodes;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return nodes.filter((n) => {
    if (!n.occurred) return false;
    const ts = new Date(n.occurred).getTime();
    return !isNaN(ts) && ts >= cutoff;
  });
}

export function findIceActivityNearRoute(
  geometry: number[][],
  nodes: IceActivityNode[],
  radiusMeters: number
): IceActivityNode[] {
  const bufferDeg = (radiusMeters / 111320) * 1.5;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const p of geometry) {
    if (p[0]! < minLat) minLat = p[0]!;
    if (p[0]! > maxLat) maxLat = p[0]!;
    if (p[1]! < minLon) minLon = p[1]!;
    if (p[1]! > maxLon) maxLon = p[1]!;
  }
  minLat -= bufferDeg;
  maxLat += bufferDeg;
  minLon -= bufferDeg;
  maxLon += bufferDeg;

  const candidates = nodes.filter(
    (n) =>
      n.lat >= minLat && n.lat <= maxLat && n.lon >= minLon && n.lon <= maxLon
  );

  const results: { node: IceActivityNode; minDist: number }[] = [];

  for (const node of candidates) {
    let minDist = Infinity;
    for (let i = 0; i < geometry.length - 1; i++) {
      const d = distToSegment(
        node.lat,
        node.lon,
        geometry[i]![0]!,
        geometry[i]![1]!,
        geometry[i + 1]![0]!,
        geometry[i + 1]![1]!
      );
      if (d < minDist) minDist = d;
    }
    if (minDist <= radiusMeters) {
      results.push({ node, minDist });
    }
  }

  results.sort((a, b) => a.minDist - b.minDist);
  return results.map((r) => r.node);
}

export async function avoidIceActivityOnRoute(
  initialRoute: ParsedDirectionsGeometry,
  nodes: IceActivityNode[],
  radiusMeters: number,
  params: FullRouteParams,
  maxIterations: number = 20
): Promise<AvoidanceResult> {
  let currentRoute = initialRoute;
  const excludedIds = new Set<number>();
  const excludedPolygons: number[][][] = [];
  let lastRouteShape = '';

  for (let iter = 0; iter < maxIterations; iter++) {
    const nearby = findIceActivityNearRoute(
      currentRoute.decodedGeometry,
      nodes,
      radiusMeters
    );

    if (nearby.length === 0) {
      console.log(
        `[ICE Activity] Route clear after ${iter} iteration(s), ${excludedIds.size} nodes excluded`
      );
      break;
    }

    const newNodes = nearby.filter((a) => !excludedIds.has(a.id));

    if (newNodes.length === 0) {
      console.warn(
        `[ICE Activity] ${nearby.length} nodes still near route but already excluded — cannot avoid further.`
      );
      break;
    }

    for (const node of newNodes) {
      excludedIds.add(node.id);
      excludedPolygons.push(squarePolygon(node.lon, node.lat, radiusMeters));
    }

    console.log(
      `[ICE Activity] Iteration ${iter}: ${nearby.length} near route, ${newNodes.length} new, ${excludedPolygons.length} total exclusions`
    );

    const newRoute = await routeWithExclusions(excludedPolygons, params);
    if (!newRoute) {
      console.warn(
        '[ICE Activity] Reroute failed. Returning last successful route.'
      );
      break;
    }

    const newShape = newRoute.trip.legs.map((l) => l.shape).join('|');
    if (newShape === lastRouteShape) {
      console.warn(
        '[ICE Activity] Route unchanged despite new exclusions. Returning best route.'
      );
      break;
    }
    lastRouteShape = newShape;
    currentRoute = newRoute;
  }

  return { route: currentRoute, excludePolygons: excludedPolygons };
}

let cachedNodes: SurveillanceNode[] | null = null;

export async function loadSurveillanceNodes(): Promise<SurveillanceNode[]> {
  if (cachedNodes) return cachedNodes;
  const response = await fetch(
    `${import.meta.env.BASE_URL}data/surveillance-nodes.json`
  );
  cachedNodes = (await response.json()) as SurveillanceNode[];
  return cachedNodes;
}

/** Haversine distance in meters. */
function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Minimum distance from point P to line segment A-B, returns meters. */
function distToSegment(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const dx = bLon - aLon;
  const dy = bLat - aLat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distanceMeters(pLat, pLon, aLat, aLon);
  const t = Math.max(
    0,
    Math.min(1, ((pLon - aLon) * dx + (pLat - aLat) * dy) / lenSq)
  );
  return distanceMeters(pLat, pLon, aLat + t * dy, aLon + t * dx);
}

/** Generate a square exclusion polygon around a point. */
function squarePolygon(
  lon: number,
  lat: number,
  radiusMeters: number
): number[][] {
  const dLat = radiusMeters / 111320;
  const dLon = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ];
}

/**
 * Find surveillance nodes within radius of any segment of the route geometry.
 * Returns them sorted by minimum distance to the route (closest first).
 */
export function findSurveillanceNearRoute(
  geometry: number[][],
  nodes: SurveillanceNode[],
  radiusMeters: number
): SurveillanceNode[] {
  const bufferDeg = (radiusMeters / 111320) * 1.5;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const p of geometry) {
    if (p[0]! < minLat) minLat = p[0]!;
    if (p[0]! > maxLat) maxLat = p[0]!;
    if (p[1]! < minLon) minLon = p[1]!;
    if (p[1]! > maxLon) maxLon = p[1]!;
  }
  minLat -= bufferDeg;
  maxLat += bufferDeg;
  minLon -= bufferDeg;
  maxLon += bufferDeg;

  const candidates = nodes.filter(
    (n) =>
      n.lat >= minLat && n.lat <= maxLat && n.lon >= minLon && n.lon <= maxLon
  );

  const results: { node: SurveillanceNode; minDist: number }[] = [];

  for (const node of candidates) {
    let minDist = Infinity;
    for (let i = 0; i < geometry.length - 1; i++) {
      const d = distToSegment(
        node.lat,
        node.lon,
        geometry[i]![0]!,
        geometry[i]![1]!,
        geometry[i + 1]![0]!,
        geometry[i + 1]![1]!
      );
      if (d < minDist) minDist = d;
    }
    if (minDist <= radiusMeters) {
      results.push({ node, minDist });
    }
  }

  results.sort((a, b) => a.minDist - b.minDist);
  return results.map((r) => r.node);
}

interface FullRouteParams {
  profile: string;
  costingOptions: Record<string, unknown>;
  language: string;
  activeWaypoints: ActiveWaypoints;
  dateTime?: { type: number; value: string };
  alternates?: number;
  existingExcludePolygons?: unknown[];
}

async function routeWithExclusions(
  polygons: number[][][],
  params: FullRouteParams
): Promise<ParsedDirectionsGeometry | null> {
  const existingPolygons = (params.existingExcludePolygons ||
    []) as number[][][];

  const request: Record<string, unknown> = {
    costing: params.profile,
    costing_options: params.costingOptions,
    locations: makeLocations(params.activeWaypoints),
    exclude_polygons: [...existingPolygons, ...polygons],
    units: 'kilometers',
    alternates: params.alternates || 0,
    id: 'valhalla_directions',
    language: params.language,
  };

  if (params.dateTime && params.dateTime.type > -1) {
    request.date_time = params.dateTime;
  }

  try {
    const { data } = await axios.get<ValhallaRouteResponse>(
      getValhallaUrl() + '/route',
      {
        params: { json: JSON.stringify(request) },
        headers: { 'Content-Type': 'application/json' },
      }
    );

    (data as ParsedDirectionsGeometry).decodedGeometry =
      parseDirectionsGeometry(data);

    data.alternates?.forEach((alternate, i) => {
      if (alternate) {
        (data.alternates![i] as ParsedDirectionsGeometry).decodedGeometry =
          parseDirectionsGeometry(alternate);
      }
    });

    return data as ParsedDirectionsGeometry;
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response) {
      console.error(
        `[Surveillance] Route with ${polygons.length} exclusion polygons failed:`,
        e.response.data
      );
    } else {
      console.error(
        `[Surveillance] Route with ${polygons.length} exclusion polygons failed:`,
        e
      );
    }
    return null;
  }
}

/**
 * Aggressively avoid surveillance nodes. Finds the shortest route with no
 * nodes within the detection radius, even if substantially longer.
 */
export interface AvoidanceResult {
  route: ParsedDirectionsGeometry;
  excludePolygons: number[][][];
}

export async function avoidSurveillanceOnRoute(
  initialRoute: ParsedDirectionsGeometry,
  nodes: SurveillanceNode[],
  radiusMeters: number,
  params: FullRouteParams,
  maxIterations: number = 20
): Promise<AvoidanceResult> {
  let currentRoute = initialRoute;
  const excludedIds = new Set<number>();
  const excludedPolygons: number[][][] = [];
  let lastRouteShape = '';

  for (let iter = 0; iter < maxIterations; iter++) {
    const nearby = findSurveillanceNearRoute(
      currentRoute.decodedGeometry,
      nodes,
      radiusMeters
    );

    if (nearby.length === 0) {
      console.log(
        `[Surveillance] Route clear after ${iter} iteration(s), ${excludedIds.size} nodes excluded`
      );
      break;
    }

    const newNodes = nearby.filter((a) => !excludedIds.has(a.id));

    if (newNodes.length === 0) {
      console.warn(
        `[Surveillance] ${nearby.length} nodes still near route but already excluded — cannot avoid further.`
      );
      break;
    }

    for (const node of newNodes) {
      excludedIds.add(node.id);
      excludedPolygons.push(squarePolygon(node.lon, node.lat, radiusMeters));
    }

    console.log(
      `[Surveillance] Iteration ${iter}: ${nearby.length} near route, ${newNodes.length} new, ${excludedPolygons.length} total exclusions`
    );

    const newRoute = await routeWithExclusions(excludedPolygons, params);
    if (!newRoute) {
      console.warn(
        '[Surveillance] Reroute failed. Returning last successful route.'
      );
      break;
    }

    const newShape = newRoute.trip.legs.map((l) => l.shape).join('|');
    if (newShape === lastRouteShape) {
      console.warn(
        '[Surveillance] Route unchanged despite new exclusions. Returning best route.'
      );
      break;
    }
    lastRouteShape = newShape;
    currentRoute = newRoute;
  }

  return { route: currentRoute, excludePolygons: excludedPolygons };
}

/**
 * Generic avoidance point (used by unified avoidance system).
 */
export interface GenericAvoidancePoint {
  id: number | string;
  lat: number;
  lon: number;
  type: string;
  feedId: string;
}

/**
 * Find generic avoidance points near route.
 */
export function findPointsNearRoute(
  geometry: number[][],
  points: GenericAvoidancePoint[],
  radiusMeters: number
): GenericAvoidancePoint[] {
  const bufferDeg = (radiusMeters / 111320) * 1.5;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const p of geometry) {
    if (p[0]! < minLat) minLat = p[0]!;
    if (p[0]! > maxLat) maxLat = p[0]!;
    if (p[1]! < minLon) minLon = p[1]!;
    if (p[1]! > maxLon) maxLon = p[1]!;
  }
  minLat -= bufferDeg;
  maxLat += bufferDeg;
  minLon -= bufferDeg;
  maxLon += bufferDeg;

  const candidates = points.filter(
    (n) =>
      n.lat >= minLat && n.lat <= maxLat && n.lon >= minLon && n.lon <= maxLon
  );

  const results: { point: GenericAvoidancePoint; minDist: number }[] = [];

  for (const point of candidates) {
    let minDist = Infinity;
    for (let i = 0; i < geometry.length - 1; i++) {
      const d = distToSegment(
        point.lat,
        point.lon,
        geometry[i]![0]!,
        geometry[i]![1]!,
        geometry[i + 1]![0]!,
        geometry[i + 1]![1]!
      );
      if (d < minDist) minDist = d;
    }
    if (minDist <= radiusMeters) {
      results.push({ point, minDist });
    }
  }

  results.sort((a, b) => a.minDist - b.minDist);
  return results.map((r) => r.point);
}

/**
 * Unified avoidance with adaptive radius.
 * Collects ALL avoidance points from ALL feeds into one loop.
 * Starts with startRadius (default 50m), halves on failure.
 */
export async function avoidPointsUnified(
  initialRoute: ParsedDirectionsGeometry,
  points: GenericAvoidancePoint[],
  params: FullRouteParams,
  startRadius: number = 50,
  maxIterations: number = 20
): Promise<AvoidanceResult> {
  let currentRoute = initialRoute;
  const excludedIds = new Set<number | string>();
  const excludedPolygons: number[][][] = [];
  let lastRouteShape = '';
  let currentRadius = startRadius;
  const detectionRadius = startRadius; // detect at the starting radius

  for (let iter = 0; iter < maxIterations; iter++) {
    const nearby = findPointsNearRoute(
      currentRoute.decodedGeometry,
      points,
      detectionRadius
    );

    if (nearby.length === 0) {
      console.log(
        `[Avoidance] Route clear after ${iter} iteration(s), ${excludedIds.size} points excluded`
      );
      break;
    }

    const newPoints = nearby.filter((p) => !excludedIds.has(p.id));

    if (newPoints.length === 0) {
      console.warn(
        `[Avoidance] ${nearby.length} points still near route but already excluded — cannot avoid further.`
      );
      break;
    }

    // Create exclusion polygons for new points
    const newPolygons: number[][][] = [];
    for (const point of newPoints) {
      excludedIds.add(point.id);
      newPolygons.push(squarePolygon(point.lon, point.lat, currentRadius));
    }
    excludedPolygons.push(...newPolygons);

    console.log(
      `[Avoidance] Iteration ${iter}: ${nearby.length} near route, ${newPoints.length} new, ${excludedPolygons.length} total exclusions (radius=${currentRadius}m)`
    );

    // Try to reroute with adaptive radius
    let newRoute = await routeWithExclusions(excludedPolygons, params);

    if (!newRoute && currentRadius > 10) {
      // Adaptive: halve the radius and rebuild polygons for just the failed points
      console.log(
        `[Avoidance] Reroute failed at ${currentRadius}m, retrying at ${currentRadius / 2}m`
      );
      // Remove the failed polygons and retry with smaller radius
      excludedPolygons.splice(
        excludedPolygons.length - newPolygons.length,
        newPolygons.length
      );
      currentRadius = Math.max(10, currentRadius / 2);
      const smallerPolygons: number[][][] = [];
      for (const point of newPoints) {
        smallerPolygons.push(
          squarePolygon(point.lon, point.lat, currentRadius)
        );
      }
      excludedPolygons.push(...smallerPolygons);
      newRoute = await routeWithExclusions(excludedPolygons, params);
    }

    if (!newRoute) {
      console.warn(
        '[Avoidance] Reroute failed even with reduced radius. Returning last successful route.'
      );
      // Remove the failed polygons
      for (const point of newPoints) {
        excludedIds.delete(point.id);
      }
      excludedPolygons.splice(
        excludedPolygons.length - newPoints.length,
        newPoints.length
      );
      break;
    }

    const newShape = newRoute.trip.legs.map((l) => l.shape).join('|');
    if (newShape === lastRouteShape) {
      console.warn(
        '[Avoidance] Route unchanged despite new exclusions. Returning best route.'
      );
      break;
    }
    lastRouteShape = newShape;
    currentRoute = newRoute;
  }

  return { route: currentRoute, excludePolygons: excludedPolygons };
}
