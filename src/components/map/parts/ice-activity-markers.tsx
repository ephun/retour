import { useEffect, useState, useMemo } from 'react';
import { Source, Layer, Marker } from 'react-map-gl/maplibre';
import { useFeedStore } from '@/stores/feed-store';
import { useDirectionsStore } from '@/stores/directions-store';
import {
  loadIceActivityNodes,
  filterIceNodesByAge,
  type IceActivityNode,
} from '@/utils/alpr';

const ICE_COLOR = '#1d4ed8';
const CIRCLE_SEGMENTS = 32;
const ICE_DISPLAY_RADIUS = 500;

export const ICE_ACTIVITY_LAYER_ID = 'ice-activity-fill';

/** Generate a GeoJSON Polygon circle around a point with a given radius in meters. */
function circlePolygon(
  lon: number,
  lat: number,
  radiusMeters: number
): number[][] {
  const coords: number[][] = [];
  const dLat = radiusMeters / 111320;
  const dLon = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
    const angle = (i / CIRCLE_SEGMENTS) * 2 * Math.PI;
    coords.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return coords;
}

export const IceActivityMarkers = () => {
  const iceFeed = useFeedStore((state) =>
    state.feeds.find((f) => f.id === 'builtin-iceout')
  );
  const showOnMap = iceFeed?.showOnMap ?? false;
  const maxAgeDays = iceFeed?.maxAgeDays ?? 30;
  const intersecting = useDirectionsStore(
    (state) => state.intersectingIceActivity
  );
  const [allNodes, setAllNodes] = useState<IceActivityNode[]>([]);

  useEffect(() => {
    if (showOnMap && allNodes.length === 0) {
      loadIceActivityNodes().then(setAllNodes);
    }
  }, [showOnMap, allNodes.length]);

  const nodes = useMemo(() => {
    if (!showOnMap || allNodes.length === 0) return [];
    if (maxAgeDays > 0) return filterIceNodesByAge(allNodes, maxAgeDays);
    return allNodes;
  }, [showOnMap, allNodes, maxAgeDays]);

  const intersectingIds = useMemo(
    () => new Set(intersecting.map((a) => a.id)),
    [intersecting]
  );

  const geojson: GeoJSON.FeatureCollection | null = useMemo(() => {
    if (!showOnMap || nodes.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: nodes
        .filter((node) => !intersectingIds.has(node.id))
        .map((node) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              circlePolygon(node.lon, node.lat, ICE_DISPLAY_RADIUS),
            ],
          },
          properties: {
            id: node.id,
            address: node.address,
            occurred: node.occurred,
            activity: node.activity,
          },
        })),
    };
  }, [showOnMap, nodes, intersectingIds]);

  return (
    <>
      {geojson && (
        <Source id="ice-activity-source" type="geojson" data={geojson}>
          <Layer
            id={ICE_ACTIVITY_LAYER_ID}
            type="fill"
            paint={{
              'fill-color': ICE_COLOR,
              'fill-opacity': 0.2,
            }}
          />
          <Layer
            id="ice-activity-outline"
            type="line"
            paint={{
              'line-color': ICE_COLOR,
              'line-width': 1.5,
              'line-opacity': 0.4,
            }}
          />
        </Source>
      )}
      {intersecting.map((node, i) => (
        <Marker
          key={node.id}
          longitude={node.lon}
          latitude={node.lat}
          anchor="center"
        >
          <div
            title={node.address || `ICE Activity #${node.id}`}
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: ICE_COLOR,
              border: '2px solid #fff',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 6px ${ICE_COLOR}99`,
            }}
          >
            {i + 1}
          </div>
        </Marker>
      ))}
    </>
  );
};
