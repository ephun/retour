import { useEffect, useState, useMemo } from 'react';
import { Source, Layer, Marker } from 'react-map-gl/maplibre';
import { useCommonStore } from '@/stores/common-store';
import { useDirectionsStore } from '@/stores/directions-store';
import {
  loadSurveillanceNodes,
  SURVEILLANCE_COLORS,
  SURVEILLANCE_LABELS,
  type SurveillanceNode,
} from '@/utils/alpr';

export const SurveillanceMarkers = () => {
  const showSurveillance = useCommonStore(
    (state) => state.settings.show_surveillance
  );
  const intersecting = useDirectionsStore(
    (state) => state.intersectingSurveillance
  );
  const [nodes, setNodes] = useState<SurveillanceNode[]>([]);

  useEffect(() => {
    if (showSurveillance && nodes.length === 0) {
      loadSurveillanceNodes().then(setNodes);
    }
  }, [showSurveillance, nodes.length]);

  const intersectingIds = useMemo(
    () => new Set(intersecting.map((a) => a.id)),
    [intersecting]
  );

  const geojson: GeoJSON.FeatureCollection | null = useMemo(() => {
    if (!showSurveillance || nodes.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: nodes
        .filter((node) => !intersectingIds.has(node.id))
        .map((node) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [node.lon, node.lat],
          },
          properties: { id: node.id, type: node.type },
        })),
    };
  }, [showSurveillance, nodes, intersectingIds]);

  // Build the match expression for circle-color based on type
  const colorMatch: unknown[] = [
    'match',
    ['get', 'type'],
    ...Object.entries(SURVEILLANCE_COLORS).flatMap(([type, color]) => [
      type,
      color,
    ]),
    '#475569', // fallback
  ];

  return (
    <>
      {geojson && (
        <Source id="surveillance-source" type="geojson" data={geojson}>
          <Layer
            id="surveillance-circles"
            type="circle"
            paint={{
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                8,
                2,
                12,
                5,
                16,
                10,
              ],
              'circle-color': colorMatch as unknown as string,
              'circle-opacity': 0.8,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#000',
              'circle-stroke-opacity': 0.3,
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
            title={SURVEILLANCE_LABELS[node.type]}
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: SURVEILLANCE_COLORS[node.type],
              border: '2px solid #fff',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 6px ${SURVEILLANCE_COLORS[node.type]}99`,
            }}
          >
            {i + 1}
          </div>
        </Marker>
      ))}
    </>
  );
};
