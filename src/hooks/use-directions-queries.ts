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
  findSurveillanceNearRoute,
  loadIceActivityNodes,
  filterIceNodesByAge,
  findIceActivityNearRoute,
  avoidPointsUnified,
  findPointsNearRoute,
  type GenericAvoidancePoint,
} from '@/utils/alpr';
import { loadFeedPoints } from '@/utils/feed-loader';
import { getDirectionsLanguage } from '@/utils/directions-language';
import { useCommonStore } from '@/stores/common-store';
import { useDirectionsStore, type Waypoint } from '@/stores/directions-store';
import { useFeedStore } from '@/stores/feed-store';
import { router } from '@/routes';

const getActiveWaypoints = (waypoints: Waypoint[]): ActiveWaypoint[] =>
  waypoints.flatMap((wp) => wp.geocodeResults.filter((r) => r.selected));

async function fetchDirections() {
  const waypoints = useDirectionsStore.getState().waypoints;
  const profile = router.state.location.search.profile;
  const { dateTime, settings: rawSettings } = useCommonStore.getState();
  const feeds = useFeedStore.getState().feeds;

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

  // Unified avoidance: collect ALL enabled feed points into one array
  const enabledFeeds = feeds.filter((f) => f.enabled);

  if (enabledFeeds.length > 0) {
    const allAvoidancePoints: GenericAvoidancePoint[] = [];

    for (const feed of enabledFeeds) {
      try {
        const points = await loadFeedPoints(feed);
        const genericPoints: GenericAvoidancePoint[] = points.map((p) => ({
          id: p.id,
          lat: p.lat,
          lon: p.lon,
          type: p.type,
          feedId: p.feedId,
        }));
        allAvoidancePoints.push(...genericPoints);

        // Update point count in store
        useFeedStore.getState().updateFeedPointCount(feed.id, points.length);
        useFeedStore.getState().updateFeedLastFetched(feed.id);
      } catch (e) {
        console.error(`[Avoidance] Failed to load feed "${feed.name}":`, e);
      }
    }

    if (allAvoidancePoints.length > 0) {
      let valhallaProfile = usedProfile as string;
      if (valhallaProfile === 'car') valhallaProfile = 'auto';

      const avoidResult = await avoidPointsUnified(
        result,
        allAvoidancePoints,
        {
          profile: valhallaProfile,
          costingOptions: { [valhallaProfile]: { ...settings.costing } },
          language,
          activeWaypoints,
          dateTime,
          alternates: rawSettings.alternates,
          existingExcludePolygons: baseExcludePolygons,
        },
        50, // start radius
        20 // max iterations
      );
      result = avoidResult.route;

      // Count unavoidable points per feed
      const finalGeometry = result.decodedGeometry;
      for (const feed of enabledFeeds) {
        const feedPoints = allAvoidancePoints.filter(
          (p) => p.feedId === feed.id
        );
        const stillNear = findPointsNearRoute(finalGeometry, feedPoints, 50);
        useFeedStore.getState().setUnavoidableCount(feed.id, stillNear.length);
      }
    }
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
          const feeds = useFeedStore.getState().feeds;
          const survFeed = feeds.find((f) => f.id === 'builtin-surveillance');
          const iceFeed = feeds.find((f) => f.id === 'builtin-iceout');

          if (survFeed && (survFeed.enabled || survFeed.showOnMap)) {
            const allNodes = await loadSurveillanceNodes();
            const hits = findSurveillanceNearRoute(
              data.decodedGeometry,
              allNodes,
              50
            );
            setIntersectingSurveillance(hits);
          } else {
            setIntersectingSurveillance([]);
          }

          if (iceFeed && (iceFeed.enabled || iceFeed.showOnMap)) {
            let iceNodes = await loadIceActivityNodes();
            if (iceFeed.maxAgeDays && iceFeed.maxAgeDays > 0) {
              iceNodes = filterIceNodesByAge(iceNodes, iceFeed.maxAgeDays);
            }
            const iceHits = findIceActivityNearRoute(
              data.decodedGeometry,
              iceNodes,
              50
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
