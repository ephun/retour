import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { MapGeoJSONFeature } from 'maplibre-gl';
import { useParams, useSearch } from '@tanstack/react-router';
import {
  Map,
  Marker,
  Popup,
  type MapRef,
  NavigationControl,
  GeolocateControl,
  type GeolocateErrorEvent,
} from 'react-map-gl/maplibre';
import type { MaplibreTerradrawControl } from '@watergis/maplibre-gl-terradraw';
import type maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { reverse_geocode } from '@/utils/geocode';
import { DrawControl } from './draw-control';
import type { Summary } from '@/components/types';

import { MapStyleControl } from './map-style-control';
import { getInitialMapStyle, getCustomStyle, getMapStyleUrl } from './utils';
import {
  CLICK_DELAY_MS,
  DEFAULT_MAP_STYLE_ID,
  DOUBLE_TAP_THRESHOLD_MS,
} from './constants';
import type { MapStyleType } from './types';
import { RouteLines } from './parts/route-lines';
import { HighlightSegment } from './parts/highlight-segment';
import { SurveillanceMarkers } from './parts/surveillance-markers';
import { IceActivityMarkers } from './parts/ice-activity-markers';
import { NavigationOverlay } from '@/components/navigation/navigation-overlay';
import { useNavigationStore } from '@/stores/navigation-store';
import { MapContextMenu } from './parts/map-context-menu';
import { RouteHoverPopup } from './parts/route-hover-popup';
import { TilesInfoPopup } from './parts/tiles-info-popup';
import {
  VALHALLA_EDGES_LAYER_ID,
  VALHALLA_NODES_LAYER_ID,
} from '@/components/tiles/valhalla-layers';
import { MarkerIcon, type MarkerColor } from './parts/marker-icon';
import { maxBounds } from './constants';
import { getInitialMapPosition, LAST_CENTER_KEY } from './utils';
import { useCommonStore } from '@/stores/common-store';
import { useDirectionsStore } from '@/stores/directions-store';
import { useIsochronesStore } from '@/stores/isochrones-store';
import {
  useDirectionsQuery,
  useReverseGeocodeDirections,
} from '@/hooks/use-directions-queries';
import {
  useIsochronesQuery,
  useReverseGeocodeIsochrones,
} from '@/hooks/use-isochrones-queries';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-is-mobile';

const { center, zoom: zoom_initial } = getInitialMapPosition();

interface MarkerData {
  id: string;
  lng: number;
  lat: number;
  type: 'waypoint' | 'isocenter';
  index?: number;
  title?: string;
  color?: MarkerColor;
  shape?: string;
  number?: string;
}

export const MapComponent = () => {
  const isMobile = useIsMobile();
  const { activeTab } = useParams({ from: '/$activeTab' });
  const coordinates = useCommonStore((state) => state.coordinates);
  const directionsPanelOpen = useCommonStore(
    (state) => state.directionsPanelOpen
  );
  const setMapReady = useCommonStore((state) => state.setMapReady);
  const { style } = useSearch({ from: '/$activeTab' });
  const [showContextPopup, setShowContextPopup] = useState(false);
  const [popupLngLat, setPopupLngLat] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [popupAddress, setPopupAddress] = useState<string>('');
  const bottomSheetSnap = useCommonStore((state) => state.bottomSheetSnap);
  const waypoints = useDirectionsStore((state) => state.waypoints);

  const isNavigating = useNavigationStore((s) => s.isNavigating);
  const navUserPosition = useNavigationStore((s) => s.userPosition);

  const { refetch: refetchDirections } = useDirectionsQuery();
  const { refetch: refetchIsochrones } = useIsochronesQuery();
  const { reverseGeocode: reverseGeocodeDirections } =
    useReverseGeocodeDirections();
  const { reverseGeocode: reverseGeocodeIsochrones } =
    useReverseGeocodeIsochrones();
  const [routeHoverPopup, setRouteHoverPopup] = useState<{
    lng: number;
    lat: number;
    summary: Summary;
  } | null>(null);
  const [tilesPopup, setTilesPopup] = useState<{
    lng: number;
    lat: number;
    features: MapGeoJSONFeature[];
  } | null>(null);
  const [viewState, setViewState] = useState({
    longitude: center[0],
    latitude: center[1],
    zoom: zoom_initial,
  });
  const [currentMapStyle, setCurrentMapStyle] = useState<MapStyleType>(
    getInitialMapStyle(style)
  );
  const [customStyleData, setCustomStyleData] =
    useState<maplibregl.StyleSpecification | null>(() => getCustomStyle());

  const resolvedMapStyle = useMemo(() => {
    if (currentMapStyle === 'custom') {
      return customStyleData ?? getMapStyleUrl('shortbread');
    }
    return getMapStyleUrl(currentMapStyle);
  }, [
    currentMapStyle,
    customStyleData,
  ]) as unknown as maplibregl.StyleSpecification;

  const mapRef = useRef<MapRef>(null);
  const drawRef = useRef<MaplibreTerradrawControl | null>(null);
  const touchStartTimeRef = useRef<number | null>(null);
  const touchLocationRef = useRef<{ x: number; y: number } | null>(null);
  const handledLongPressRef = useRef<boolean>(false);
  const clickStateRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    pendingLngLat: { lng: number; lat: number } | null;
    lastTapTime: number;
  }>({
    timer: null,
    pendingLngLat: null,
    lastTapTime: 0,
  });

  const cancelPendingClick = useCallback(() => {
    if (clickStateRef.current.timer) {
      clearTimeout(clickStateRef.current.timer);
      clickStateRef.current.timer = null;
      clickStateRef.current.pendingLngLat = null;
    }
  }, []);

  const handleStyleChange = useCallback((style: MapStyleType) => {
    setCurrentMapStyle(style);

    const url = new URL(window.location.href);
    if (style !== DEFAULT_MAP_STYLE_ID) {
      url.searchParams.set('style', style);
    } else {
      url.searchParams.delete('style');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleCustomStyleLoaded = useCallback(
    (styleData: maplibregl.StyleSpecification) => {
      setCustomStyleData(styleData);
      setCurrentMapStyle('custom');

      const url = new URL(window.location.href);
      url.searchParams.set('style', 'custom');
      window.history.replaceState({}, '', url.toString());
    },
    []
  );

  // Draw control is now a measurement/ruler tool only - no route refetch
  const handleDrawUpdate = useCallback(() => {
    // Measurement tool - no side effects needed
  }, []);

  const updateWaypointPosition = useCallback(
    (object: {
      latLng: { lat: number; lng: number };
      index: number;
      fromDrag?: boolean;
    }) => {
      reverseGeocodeDirections(
        object.latLng.lng,
        object.latLng.lat,
        object.index
      ).then(() => {
        refetchDirections();
      });
    },
    [reverseGeocodeDirections, refetchDirections]
  );

  const updateIsoPosition = useCallback(
    (lng: number, lat: number) => {
      reverseGeocodeIsochrones(lng, lat).then(() => {
        refetchIsochrones();
      });
    },
    [reverseGeocodeIsochrones, refetchIsochrones]
  );

  const handleAddWaypoint = useCallback(
    (index: number) => {
      if (!popupLngLat) return;
      setShowContextPopup(false);

      updateWaypointPosition({
        latLng: { lat: popupLngLat.lat, lng: popupLngLat.lng },
        index,
      });
    },
    [popupLngLat, updateWaypointPosition]
  );

  const handleAddIsoWaypoint = useCallback(() => {
    if (!popupLngLat) return;
    setShowContextPopup(false);
    updateIsoPosition(popupLngLat.lng, popupLngLat.lat);
  }, [popupLngLat, updateIsoPosition]);

  // Update markers when waypoints or isochrone centers change
  const geocodeResults = useIsochronesStore((state) => state.geocodeResults);
  const markers = useMemo(() => {
    const newMarkers: MarkerData[] = [];

    // Add waypoint markers
    waypoints.forEach((waypoint, index) => {
      waypoint.geocodeResults.forEach((address) => {
        if (address.selected) {
          newMarkers.push({
            id: `waypoint-${index}`,
            lng: address.displaylnglat[0],
            lat: address.displaylnglat[1],
            type: 'waypoint',
            index: index,
            title: address.title,
            color: 'green',
            number: (index + 1).toString(),
          });
        }
      });
    });

    // Add isochrone center marker
    geocodeResults.forEach((address) => {
      if (address.selected) {
        newMarkers.push({
          id: 'iso-center',
          lng: address.displaylnglat[0],
          lat: address.displaylnglat[1],
          type: 'isocenter',
          title: address.title,
          color: 'purple',
          shape: 'star',
          number: '1',
        });
      }
    });

    return newMarkers;
  }, [waypoints, geocodeResults]);

  // Zoom to coordinates
  useEffect(() => {
    if (coordinates && coordinates.length > 0 && mapRef.current) {
      const firstCoord = coordinates[0];
      if (!firstCoord || !firstCoord[0] || !firstCoord[1]) return;

      const bounds: [[number, number], [number, number]] = coordinates.reduce<
        [[number, number], [number, number]]
      >(
        (acc, coord) => {
          if (!coord || !coord[0] || !coord[1]) return acc;
          return [
            [Math.min(acc[0][0], coord[1]), Math.min(acc[0][1], coord[0])],
            [Math.max(acc[1][0], coord[1]), Math.max(acc[1][1], coord[0])],
          ];
        },
        [
          [firstCoord[1], firstCoord[0]],
          [firstCoord[1], firstCoord[0]],
        ]
      );

      const bottomPadding = isMobile
        ? bottomSheetSnap === 2
          ? window.innerHeight * 0.92
          : bottomSheetSnap === 1
            ? window.innerHeight * 0.5
            : window.innerHeight * 0.12
        : 50;

      const paddingTopLeft = [
        isMobile ? 50 : directionsPanelOpen ? 420 : 50,
        50,
      ];

      const paddingBottomRight = [50, bottomPadding];

      mapRef.current.fitBounds(bounds, {
        padding: {
          top: paddingTopLeft[1] as number,
          bottom: paddingBottomRight[1] as number,
          left: paddingTopLeft[0] as number,
          right: paddingBottomRight[0] as number,
        },
        maxZoom: coordinates.length === 1 ? 11 : 18,
      });
    }
  }, [coordinates, directionsPanelOpen, isMobile, bottomSheetSnap]);

  // Auto-follow user position during navigation
  useEffect(() => {
    if (!isNavigating || !navUserPosition || !mapRef.current) return;
    mapRef.current.easeTo({
      center: [navUserPosition.lng, navUserPosition.lat],
      zoom: 17,
      bearing: navUserPosition.heading ?? 0,
      duration: 500,
    });
  }, [isNavigating, navUserPosition]);

  const handleMapTilesClick = useCallback(
    (event: maplibregl.MapLayerMouseEvent) => {
      if (!mapRef.current) return;

      const map = mapRef.current.getMap();

      const availableLayers = [
        VALHALLA_EDGES_LAYER_ID,
        VALHALLA_NODES_LAYER_ID,
      ].filter((layerId) => map.getLayer(layerId));

      if (availableLayers.length === 0) return;

      const features = map.queryRenderedFeatures(event.point, {
        layers: availableLayers,
      });

      const { lng, lat } = event.lngLat;

      if (features && features.length > 0) {
        setTilesPopup({ lng, lat, features });
      }
    },
    []
  );

  const handleMapClick = useCallback(
    (event: maplibregl.MapLayerMouseEvent) => {
      // Prevent click if we just handled a long press
      if (handledLongPressRef.current) {
        handledLongPressRef.current = false;
        return;
      }

      if (showContextPopup) {
        setShowContextPopup(false);
        return;
      }

      // Check if TerraDraw is in an active drawing mode
      if (drawRef.current) {
        const terraDrawInstance = drawRef.current.getTerraDrawInstance();
        if (terraDrawInstance) {
          const mode = terraDrawInstance.getMode();
          if (
            mode === 'linestring' ||
            mode === 'select' ||
            mode === 'delete-selection'
          ) {
            return;
          }
        }
      }

      // For tiles tab, handle tile clicks
      if (activeTab === 'tiles') {
        cancelPendingClick();
        clickStateRef.current.pendingLngLat = event.lngLat;
        clickStateRef.current.timer = setTimeout(() => {
          handleMapTilesClick(event);
          clickStateRef.current.timer = null;
          clickStateRef.current.pendingLngLat = null;
        }, CLICK_DELAY_MS);
      }
    },
    [showContextPopup, cancelPendingClick, activeTab, handleMapTilesClick]
  );

  // handle double-click to cancel the pending single-click popup
  const handleMapDblClick = useCallback(() => {
    cancelPendingClick();
  }, [cancelPendingClick]);

  // cleanup timeout on unmount
  useEffect(() => {
    return () => {
      cancelPendingClick();
    };
  }, [cancelPendingClick]);

  const handleMapContextMenu = useCallback(
    (event: { lngLat: { lng: number; lat: number } }) => {
      if (activeTab === 'tiles') return;

      const { lngLat } = event;
      setPopupLngLat(lngLat);
      setPopupAddress('');
      setShowContextPopup(true);

      reverse_geocode(lngLat.lng, lngLat.lat)
        .then(({ data }) => {
          const feature = data.features?.[0];
          if (feature) {
            const p = feature.properties;
            const parts: string[] = [];
            if (p.name) parts.push(p.name);
            if (p.housenumber && p.street) {
              parts.push(`${p.housenumber} ${p.street}`);
            } else if (p.street) {
              parts.push(p.street);
            }
            if (p.city) parts.push(p.city);
            if (p.state) parts.push(p.state);
            setPopupAddress(parts.join(', ') || 'Unknown location');
          }
        })
        .catch(() => {
          setPopupAddress('');
        });
    },
    [activeTab]
  );

  // Handle move end to save position
  const handleMoveEnd = useCallback(() => {
    if (!mapRef.current) return;
    const { lng, lat } = mapRef.current.getCenter();
    const zoom = mapRef.current.getZoom();

    const last_center = JSON.stringify({
      center: [lat, lng],
      zoom_level: zoom,
    });
    localStorage.setItem(LAST_CENTER_KEY, last_center);
  }, []);

  const handleTouchStart = useCallback(
    (event: maplibregl.MapTouchEvent) => {
      if (activeTab === 'tiles') return;

      const now = Date.now();
      const touchCount = event.originalEvent.touches.length;

      // multi-finger touch (pinch-to-zoom, etc.) - cancel any pending click popup
      if (touchCount > 1) {
        cancelPendingClick();
        return;
      }

      touchStartTimeRef.current = now;
      touchLocationRef.current = { x: event.point.x, y: event.point.y };
      handledLongPressRef.current = false;

      // detect double-tap: if two single-finger taps occur within threshold, cancel pending click
      if (now - clickStateRef.current.lastTapTime < DOUBLE_TAP_THRESHOLD_MS) {
        cancelPendingClick();
      }
      clickStateRef.current.lastTapTime = now;
    },
    [cancelPendingClick, activeTab]
  );

  const handleTouchEnd = useCallback(
    (event: maplibregl.MapTouchEvent) => {
      if (activeTab === 'tiles') return;

      const longTouchTimeMS = 100;
      const acceptableMoveDistance = 20;

      if (touchStartTimeRef.current && touchLocationRef.current) {
        const touchTime = new Date().getTime() - touchStartTimeRef.current;
        const didNotMoveMap =
          Math.abs(event.point.x - touchLocationRef.current.x) <
            acceptableMoveDistance &&
          Math.abs(event.point.y - touchLocationRef.current.y) <
            acceptableMoveDistance;

        if (touchTime > longTouchTimeMS && didNotMoveMap) {
          if (drawRef.current) {
            const terraDrawInstance = drawRef.current.getTerraDrawInstance();
            if (terraDrawInstance) {
              const mode = terraDrawInstance.getMode();
              if (
                mode === 'polygon' ||
                mode === 'select' ||
                mode === 'delete-selection'
              ) {
                touchStartTimeRef.current = null;
                touchLocationRef.current = null;
                return;
              }
            }
          }

          handledLongPressRef.current = true;
          handleMapContextMenu({ lngLat: event.lngLat });
        }
      }

      touchStartTimeRef.current = null;
      touchLocationRef.current = null;
    },
    [handleMapContextMenu, activeTab]
  );

  // Handle route line hover
  const onRouteLineHover = useCallback(
    (event: maplibregl.MapLayerMouseEvent) => {
      if (!mapRef.current) return;

      const map = mapRef.current.getMap();
      map.getCanvas().style.cursor = 'pointer';

      const feature = event.features?.[0];
      if (feature && feature.properties?.summary) {
        // Parse the summary if it's a string
        const summary =
          typeof feature.properties.summary === 'string'
            ? JSON.parse(feature.properties.summary)
            : feature.properties.summary;

        setRouteHoverPopup({
          lng: event.lngLat.lng,
          lat: event.lngLat.lat,
          summary: summary as Summary,
        });
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (event: maplibregl.MapLayerMouseEvent) => {
      if (!mapRef.current) return;

      const features = event.features;
      const isOverRoute =
        features &&
        features.length > 0 &&
        features[0]?.layer?.id === 'routes-line';

      if (isOverRoute) {
        onRouteLineHover(event);
      } else {
        if (routeHoverPopup) {
          setRouteHoverPopup(null);
        }
        const map = mapRef.current.getMap();
        if (map.getCanvas().style.cursor === 'pointer') {
          map.getCanvas().style.cursor = '';
        }
      }
    },
    [routeHoverPopup, onRouteLineHover]
  );

  const handleMouseLeave = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();
    map.getCanvas().style.cursor = '';
    setRouteHoverPopup(null);
  }, []);

  const handleGeolocateError = useCallback((error: GeolocateErrorEvent) => {
    let defaultMessage = "We couldn't get your location. Please try again.";
    if (error.PERMISSION_DENIED) {
      defaultMessage =
        "We couldn't get your location. Please check your browser settings and allow location access.";
    }

    toast.error(defaultMessage);
  }, []);

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={(evt) => setViewState(evt.viewState)}
      onMoveEnd={handleMoveEnd}
      onLoad={() => setMapReady(true)}
      onClick={handleMapClick}
      onDblClick={handleMapDblClick}
      onContextMenu={handleMapContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      interactiveLayerIds={
        activeTab === 'tiles'
          ? [VALHALLA_EDGES_LAYER_ID, VALHALLA_NODES_LAYER_ID]
          : ['routes-line']
      }
      mapStyle={resolvedMapStyle}
      style={{ width: '100%', height: '100vh' }}
      maxBounds={maxBounds}
      minZoom={2}
      maxZoom={18}
      data-testid="map"
      id="mainMap"
    >
      <NavigationControl />
      <GeolocateControl onError={handleGeolocateError} />
      <DrawControl onUpdate={handleDrawUpdate} controlRef={drawRef} />
      <MapStyleControl
        customStyleData={customStyleData}
        onStyleChange={handleStyleChange}
        onCustomStyleLoaded={handleCustomStyleLoaded}
      />
      <RouteLines />
      <HighlightSegment />
      <SurveillanceMarkers />
      <IceActivityMarkers />
      {markers.map((marker) => (
        <Marker
          anchor="bottom"
          key={marker.id}
          longitude={marker.lng}
          latitude={marker.lat}
          draggable={true}
          onDragEnd={(e) => {
            if (marker.type === 'waypoint') {
              updateWaypointPosition({
                latLng: { lat: e.lngLat.lat, lng: e.lngLat.lng },
                index: marker.index ?? 0,
                fromDrag: true,
              });
            } else if (marker.type === 'isocenter') {
              updateIsoPosition(e.lngLat.lng, e.lngLat.lat);
            }
          }}
        >
          <MarkerIcon color={marker.color!} number={marker.number} />
        </Marker>
      ))}

      {showContextPopup && popupLngLat && (
        <Popup
          longitude={popupLngLat.lng}
          latitude={popupLngLat.lat}
          closeButton={false}
          closeOnClick={false}
          maxWidth="none"
        >
          <MapContextMenu
            activeTab={activeTab}
            onAddWaypoint={handleAddWaypoint}
            onAddIsoWaypoint={handleAddIsoWaypoint}
            popupLocation={popupLngLat}
            address={popupAddress}
            onClose={() => setShowContextPopup(false)}
          />
        </Popup>
      )}

      {routeHoverPopup && (
        <RouteHoverPopup
          lng={routeHoverPopup.lng}
          lat={routeHoverPopup.lat}
          summary={routeHoverPopup.summary}
        />
      )}

      {tilesPopup && (
        <Popup
          longitude={tilesPopup.lng}
          latitude={tilesPopup.lat}
          closeButton={false}
          maxWidth="none"
          onClose={() => setTilesPopup(null)}
        >
          <TilesInfoPopup
            features={tilesPopup.features}
            onClose={() => setTilesPopup(null)}
          />
        </Popup>
      )}

      <NavigationOverlay />

      {isNavigating && navUserPosition && (
        <Marker
          longitude={navUserPosition.lng}
          latitude={navUserPosition.lat}
          anchor="center"
        >
          <div
            className="size-5 rounded-full bg-blue-500 border-2 border-white shadow-lg"
            style={{
              transform: navUserPosition.heading
                ? `rotate(${navUserPosition.heading}deg)`
                : undefined,
              boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.3)',
            }}
          />
        </Marker>
      )}
    </Map>
  );
};
