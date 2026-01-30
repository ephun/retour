import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';

import type {
  ActiveWaypoint,
  ParsedDirectionsGeometry,
  ValhallaRouteResponse,
} from '@/components/types';
import {
  getValhallaUrl,
  buildDirectionsRequest,
  parseDirectionsGeometry,
} from '@/utils/valhalla';
import {
  reverse_geocode,
  forward_geocode,
  parseGeocodeResponse,
} from '@/utils/geocode';
import { filterProfileSettings } from '@/utils/filter-profile-settings';
import {
  loadSurveillanceNodes,
  avoidSurveillanceOnRoute,
  findSurveillanceNearRoute,
  type SurveillanceType,
  loadIceActivityNodes,
  filterIceNodesByAge,
  avoidIceActivityOnRoute,
  findIceActivityNearRoute,
} from '@/utils/alpr';
import { getDirectionsLanguage } from '@/utils/directions-language';
import { useCommonStore } from '@/stores/common-store';
import { useDirectionsStore, type Waypoint } from '@/stores/directions-store';
import { router } from '@/routes';

const getActiveWaypoints = (waypoints: Waypoint[]): ActiveWaypoint[] =>
  waypoints.flatMap((wp) => wp.geocodeResults.filter((r) => r.selected));

async function fetchDirections() {
  const waypoints = useDirectionsStore.getState().waypoints;
  const profile = router.state.location.search.profile;
  const { dateTime, settings: rawSettings } = useCommonStore.getState();

  const activeWaypoints = getActiveWaypoints(waypoints);
  if (activeWaypoints.length < 2) {
    return null;
  }

  const settings = filterProfileSettings(profile || 'bicycle', rawSettings);
  const language = getDirectionsLanguage();

  const usedProfile = profile || 'bicycle';

  const valhallaRequest = buildDirectionsRequest({
    profile: usedProfile,
    activeWaypoints,
    // @ts-expect-error todo: initial settings and filtered settings types mismatch
    settings,
    dateTime,
    language,
  });

  const { data } = await axios.get<ValhallaRouteResponse>(
    getValhallaUrl() + '/route',
    {
      params: { json: JSON.stringify(valhallaRequest.json) },
      headers: { 'Content-Type': 'application/json' },
    }
  );

  // Parse geometry for main route
  (data as ParsedDirectionsGeometry).decodedGeometry =
    parseDirectionsGeometry(data);

  // Parse geometry for alternates
  data.alternates?.forEach((alternate, i) => {
    if (alternate) {
      (data.alternates![i] as ParsedDirectionsGeometry).decodedGeometry =
        parseDirectionsGeometry(alternate);
    }
  });

  let result = data as ParsedDirectionsGeometry;
  const baseExcludePolygons = (settings.directions.exclude_polygons ||
    []) as unknown as number[][][];
  let accumulatedPolygons: number[][][] = [...baseExcludePolygons];

  // Post-process: reroute to avoid enabled surveillance types
  const avoidTypes: SurveillanceType[] = [];
  if (rawSettings.avoid_alpr) avoidTypes.push('alpr');
  if (rawSettings.avoid_speed_cameras) avoidTypes.push('speed_camera');
  if (rawSettings.avoid_red_light_cameras) avoidTypes.push('red_light_camera');
  if (rawSettings.avoid_traffic_cameras) avoidTypes.push('traffic_camera');
  if (rawSettings.avoid_cctv) avoidTypes.push('cctv');

  if (avoidTypes.length > 0) {
    const allNodes = await loadSurveillanceNodes();
    const filteredNodes = allNodes.filter((n) => avoidTypes.includes(n.type));
    let valhallaProfile = usedProfile as string;
    if (valhallaProfile === 'car') valhallaProfile = 'auto';

    const avoidResult = await avoidSurveillanceOnRoute(
      result,
      filteredNodes,
      rawSettings.surveillance_avoid_radius || 100,
      {
        profile: valhallaProfile,
        costingOptions: { [valhallaProfile]: { ...settings.costing } },
        language,
        activeWaypoints,
        dateTime,
        alternates: rawSettings.alternates,
        existingExcludePolygons: accumulatedPolygons,
      }
    );
    result = avoidResult.route;
    accumulatedPolygons = [
      ...accumulatedPolygons,
      ...avoidResult.excludePolygons,
    ];
  }

  // Post-process: reroute to avoid ICE activity areas
  if (rawSettings.avoid_ice_activity) {
    let iceNodes = await loadIceActivityNodes();
    if (rawSettings.ice_activity_max_age > 0) {
      iceNodes = filterIceNodesByAge(
        iceNodes,
        rawSettings.ice_activity_max_age
      );
    }
    let valhallaProfile = usedProfile as string;
    if (valhallaProfile === 'car') valhallaProfile = 'auto';

    const avoidResult = await avoidIceActivityOnRoute(
      result,
      iceNodes,
      rawSettings.ice_activity_avoid_radius || 500,
      {
        profile: valhallaProfile,
        costingOptions: { [valhallaProfile]: { ...settings.costing } },
        language,
        activeWaypoints,
        dateTime,
        alternates: rawSettings.alternates,
        existingExcludePolygons: accumulatedPolygons,
      }
    );
    result = avoidResult.route;
  }

  return result;
}

export function useDirectionsQuery() {
  const showLoading = useCommonStore((state) => state.showLoading);
  const zoomTo = useCommonStore((state) => state.zoomTo);
  const receiveRouteResults = useDirectionsStore(
    (state) => state.receiveRouteResults
  );
  const setIntersectingSurveillance = useDirectionsStore(
    (state) => state.setIntersectingSurveillance
  );
  const setIntersectingIceActivity = useDirectionsStore(
    (state) => state.setIntersectingIceActivity
  );
  const clearRoutes = useDirectionsStore((state) => state.clearRoutes);

  return useQuery({
    queryKey: ['directions'],
    queryFn: async () => {
      showLoading(true);
      try {
        const data = await fetchDirections();
        if (data) {
          receiveRouteResults({ data });
          zoomTo(data.decodedGeometry);

          // Detect surveillance nodes that the final route still intersects
          const { settings: rawS } = useCommonStore.getState();
          const detectTypes: SurveillanceType[] = [];
          if (rawS.avoid_alpr) detectTypes.push('alpr');
          if (rawS.avoid_speed_cameras) detectTypes.push('speed_camera');
          if (rawS.avoid_red_light_cameras)
            detectTypes.push('red_light_camera');
          if (rawS.avoid_traffic_cameras) detectTypes.push('traffic_camera');
          if (rawS.avoid_cctv) detectTypes.push('cctv');

          if (detectTypes.length > 0 || rawS.show_surveillance) {
            const allNodes = await loadSurveillanceNodes();
            const radius = rawS.surveillance_avoid_radius || 100;
            const relevantNodes =
              detectTypes.length > 0
                ? allNodes.filter((n) => detectTypes.includes(n.type))
                : allNodes;
            const hits = findSurveillanceNearRoute(
              data.decodedGeometry,
              relevantNodes,
              radius
            );
            setIntersectingSurveillance(hits);
          } else {
            setIntersectingSurveillance([]);
          }

          // Detect ICE activity nodes near route
          if (rawS.avoid_ice_activity || rawS.show_ice_activity) {
            let iceNodes = await loadIceActivityNodes();
            if (rawS.ice_activity_max_age > 0) {
              iceNodes = filterIceNodesByAge(
                iceNodes,
                rawS.ice_activity_max_age
              );
            }
            const iceRadius = rawS.ice_activity_avoid_radius || 500;
            const iceHits = findIceActivityNearRoute(
              data.decodedGeometry,
              iceNodes,
              iceRadius
            );
            setIntersectingIceActivity(iceHits);
          } else {
            setIntersectingIceActivity([]);
          }
        }
        return data;
      } catch (error) {
        clearRoutes();
        if (axios.isAxiosError(error) && error.response) {
          const response = error.response;
          let error_msg = response.data.error;
          if (response.data.error_code === 154) {
            error_msg += ` for route.`;
          }
          toast.warning(`${response.data.status}`, {
            description: `${error_msg}`,
            position: 'bottom-center',
            duration: 5000,
            closeButton: true,
          });
        }
        throw error;
      } finally {
        setTimeout(() => showLoading(false), 500);
      }
    },
    enabled: false,
    retry: false,
  });
}

async function fetchReverseGeocode(lng: number, lat: number) {
  const response = await reverse_geocode(lng, lat);
  const addresses = parseGeocodeResponse(response.data, [lng, lat]);

  if (addresses.length === 0) {
    toast.warning('No addresses', {
      description: 'Sorry, no addresses can be found.',
      position: 'bottom-center',
      duration: 5000,
      closeButton: true,
    });
  }

  return addresses as ActiveWaypoint[];
}

export function useReverseGeocodeDirections() {
  const receiveGeocodeResults = useDirectionsStore(
    (state) => state.receiveGeocodeResults
  );
  const updateTextInput = useDirectionsStore((state) => state.updateTextInput);
  const addEmptyWaypointToEnd = useDirectionsStore(
    (state) => state.addEmptyWaypointToEnd
  );
  const updatePlaceholderAddressAtIndex = useDirectionsStore(
    (state) => state.updatePlaceholderAddressAtIndex
  );

  const reverseGeocode = async (
    lng: number,
    lat: number,
    index: number,
    options?: { isPermalink?: boolean }
  ) => {
    // For permalink loading, add waypoint if needed
    if (options?.isPermalink && index > 1) {
      addEmptyWaypointToEnd();
    }

    // Set placeholder immediately
    updatePlaceholderAddressAtIndex(index, lng, lat);

    try {
      const addresses = await fetchReverseGeocode(lng, lat);
      receiveGeocodeResults({
        addresses,
        index,
      });
      updateTextInput({
        inputValue: addresses[0]?.title || '',
        index,
        addressindex: 0,
      });
      return addresses;
    } catch (error) {
      console.error('Reverse geocode error:', error);
      throw error;
    }
  };

  return { reverseGeocode };
}

async function fetchForwardGeocode(
  userInput: string,
  lngLat?: [number, number]
): Promise<ActiveWaypoint[]> {
  if (lngLat) {
    return [
      {
        title: lngLat.toString(),
        key: 0,
        selected: false,
        addresslnglat: lngLat,
        sourcelnglat: lngLat,
        displaylnglat: lngLat,
        addressindex: 0,
      },
    ];
  }

  const response = await forward_geocode(userInput);
  const addresses = parseGeocodeResponse(response.data);

  if (addresses.length === 0) {
    toast.warning('No addresses', {
      description: 'Sorry, no addresses can be found.',
      position: 'bottom-center',
      duration: 5000,
      closeButton: true,
    });
  }

  return addresses as ActiveWaypoint[];
}

export function useForwardGeocodeDirections() {
  const receiveGeocodeResults = useDirectionsStore(
    (state) => state.receiveGeocodeResults
  );

  const forwardGeocode = async (
    userInput: string,
    index: number,
    lngLat?: [number, number]
  ) => {
    try {
      const addresses = await fetchForwardGeocode(userInput, lngLat);
      receiveGeocodeResults({
        addresses,
        index,
      });
      return addresses;
    } catch (error) {
      console.error('Forward geocode error:', error);
      throw error;
    }
  };

  return { forwardGeocode };
}
