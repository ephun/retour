import { useEffect, useState, useMemo, useCallback } from 'react';
import { Source, Layer, Marker, Popup, useMap } from 'react-map-gl/maplibre';
import { useFeedStore } from '@/stores/feed-store';
import { useDirectionsStore } from '@/stores/directions-store';
import {
  loadSurveillanceNodes,
  SURVEILLANCE_COLORS,
  SURVEILLANCE_LABELS,
  type SurveillanceNode,
  type SurveillanceType,
} from '@/utils/alpr';
import { MarkerInfoPopup } from './marker-info-popup';

export const SURVEILLANCE_LAYER_ID = 'surveillance-circles';

interface SelectedFeature {
  lng: number;
  lat: number;
  properties: Record<string, unknown>;
}

export const SurveillanceMarkers = () => {
  const survFeed = useFeedStore((state) =>
    state.feeds.find((f) => f.id === 'builtin-surveillance')
  );
  const showOnMap = survFeed?.showOnMap ?? false;
  const visibleTypes = survFeed?.visibleTypes;
  const intersecting = useDirectionsStore(
    (state) => state.intersectingSurveillance
  );
  const [nodes, setNodes] = useState<SurveillanceNode[]>([]);
  const [selectedFeature, setSelectedFeature] =
    useState<SelectedFeature | null>(null);

  const { mainMap } = useMap();

  useEffect(() => {
    if (showOnMap && nodes.length === 0) {
      loadSurveillanceNodes().then(setNodes);
    }
  }, [showOnMap, nodes.length]);

  // Click handler for the circle layer
  useEffect(() => {
    if (!mainMap) return;
    const map = mainMap.getMap();

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [SURVEILLANCE_LAYER_ID],
      });

      if (features && features.length > 0) {
        const feature = features[0]!;
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        const {
          type: rawType,
          osm_id,
          id: featureId,
        } = (feature.properties || {}) as Record<string, unknown>;
        const nodeType = rawType as SurveillanceType;

        setSelectedFeature({
          lng: coords[0]!,
          lat: coords[1]!,
          properties: {
            osm_id: osm_id || featureId,
            type: SURVEILLANCE_LABELS[nodeType] || nodeType || 'Unknown',
          },
        });
      }
    };

    const setCursor = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const resetCursor = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', SURVEILLANCE_LAYER_ID, handleClick);
    map.on('mouseenter', SURVEILLANCE_LAYER_ID, setCursor);
    map.on('mouseleave', SURVEILLANCE_LAYER_ID, resetCursor);

    return () => {
      map.off('click', SURVEILLANCE_LAYER_ID, handleClick);
      map.off('mouseenter', SURVEILLANCE_LAYER_ID, setCursor);
      map.off('mouseleave', SURVEILLANCE_LAYER_ID, resetCursor);
    };
  }, [mainMap]);

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
        .filter((node) => !visibleTypes || visibleTypes[node.type] !== false)
        .map((node) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [node.lon, node.lat],
          },
          properties: {
            id: node.id,
            type: node.type,
            osm_id: node.id,
          },
        })),
    };
  }, [showOnMap, nodes, intersectingIds, visibleTypes]);

  const colorMatch: unknown[] = [
    'match',
    ['get', 'type'],
    ...Object.entries(SURVEILLANCE_COLORS).flatMap(([type, color]) => [
      type,
      color,
    ]),
    '#475569',
  ];

  const handleMarkerClick = useCallback((node: SurveillanceNode) => {
    setSelectedFeature({
      lng: node.lon,
      lat: node.lat,
      properties: {
        osm_id: node.id,
        type: SURVEILLANCE_LABELS[node.type] || node.type,
      },
    });
  }, []);

  const osmUrl = selectedFeature?.properties?.osm_id
    ? `https://www.openstreetmap.org/node/${selectedFeature.properties.osm_id}`
    : undefined;

  return (
    <>
      {geojson && (
        <Source id="surveillance-source" type="geojson" data={geojson}>
          <Layer
            id={SURVEILLANCE_LAYER_ID}
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
            onClick={() => handleMarkerClick(node)}
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
              cursor: 'pointer',
            }}
          >
            {i + 1}
          </div>
        </Marker>
      ))}

      {selectedFeature && (
        <Popup
          longitude={selectedFeature.lng}
          latitude={selectedFeature.lat}
          closeButton={false}
          closeOnClick={false}
          maxWidth="none"
          anchor="bottom"
        >
          <MarkerInfoPopup
            type={String(selectedFeature.properties.type || 'Surveillance')}
            feedName="Surveillance Cameras"
            properties={selectedFeature.properties}
            sourceUrl={osmUrl}
            onClose={() => setSelectedFeature(null)}
          />
        </Popup>
      )}
    </>
  );
};
