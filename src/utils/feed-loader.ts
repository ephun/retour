import type { AvoidanceFeed, AvoidancePoint } from '@/stores/feed-store';
import { loadSurveillanceNodes, loadIceActivityNodes } from './alpr';

const feedCache = new Map<string, AvoidancePoint[]>();

export async function loadFeedPoints(
  feed: AvoidanceFeed
): Promise<AvoidancePoint[]> {
  const cacheKey = feed.id;
  const cached = feedCache.get(cacheKey);
  if (cached) return applyFeedFilters(cached, feed);

  let points: AvoidancePoint[];

  switch (feed.type) {
    case 'builtin-surveillance':
      points = await loadBuiltinSurveillance(feed);
      break;
    case 'iceout':
      points = await loadIceout(feed);
      break;
    case 'geojson':
      points = await loadGeoJSON(feed);
      break;
    default:
      points = [];
  }

  feedCache.set(cacheKey, points);
  return applyFeedFilters(points, feed);
}

export function clearFeedCache(feedId?: string) {
  if (feedId) {
    feedCache.delete(feedId);
  } else {
    feedCache.clear();
  }
}

function applyFeedFilters(
  points: AvoidancePoint[],
  feed: AvoidanceFeed
): AvoidancePoint[] {
  if (feed.type === 'iceout' && feed.maxAgeDays && feed.maxAgeDays > 0) {
    const cutoff = Date.now() - feed.maxAgeDays * 24 * 60 * 60 * 1000;
    return points.filter((p) => {
      const occurred = p.properties?.occurred as string | undefined;
      if (!occurred) return false;
      const ts = new Date(occurred).getTime();
      return !isNaN(ts) && ts >= cutoff;
    });
  }
  return points;
}

async function loadBuiltinSurveillance(
  feed: AvoidanceFeed
): Promise<AvoidancePoint[]> {
  const nodes = await loadSurveillanceNodes();
  return nodes.map((node) => ({
    id: node.id,
    lat: node.lat,
    lon: node.lon,
    type: node.type,
    label: node.type,
    feedId: feed.id,
    properties: { osm_id: node.id, type: node.type },
  }));
}

async function loadIceout(feed: AvoidanceFeed): Promise<AvoidancePoint[]> {
  const nodes = await loadIceActivityNodes();
  return nodes.map((node) => ({
    id: node.id,
    lat: node.lat,
    lon: node.lon,
    type: 'ice_activity',
    label: node.address || `ICE Report #${node.id}`,
    feedId: feed.id,
    properties: {
      address: node.address,
      occurred: node.occurred,
      activity: node.activity,
    },
  }));
}

async function loadGeoJSON(feed: AvoidanceFeed): Promise<AvoidancePoint[]> {
  if (!feed.url) return [];

  const response = await fetch(feed.url);
  const data = await response.json();

  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    console.warn(`[Feed] ${feed.name}: Not a valid GeoJSON FeatureCollection`);
    return [];
  }

  const points: AvoidancePoint[] = [];
  let idCounter = 0;

  for (const feature of data.features) {
    if (
      feature.geometry?.type === 'Point' &&
      Array.isArray(feature.geometry.coordinates)
    ) {
      const [lon, lat] = feature.geometry.coordinates;
      points.push({
        id: feature.properties?.id ?? `geojson-${feed.id}-${idCounter++}`,
        lat,
        lon,
        type: feature.properties?.type || 'custom',
        label:
          feature.properties?.name ||
          feature.properties?.title ||
          `Point ${idCounter}`,
        feedId: feed.id,
        properties: feature.properties || {},
      });
    }
  }

  return points;
}
