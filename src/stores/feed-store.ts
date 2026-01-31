import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type FeedType = 'geojson' | 'builtin-surveillance' | 'iceout';

export interface AvoidanceFeed {
  id: string;
  name: string;
  url: string;
  type: FeedType;
  enabled: boolean;
  showOnMap: boolean;
  pointCount: number;
  lastFetched: string | null;
  removable: boolean;
  // Feed-specific config
  maxAgeDays?: number;
  // For surveillance: which types to show visually
  visibleTypes?: Record<string, boolean>;
}

export interface AvoidancePoint {
  id: number | string;
  lat: number;
  lon: number;
  type: string;
  label: string;
  feedId: string;
  properties?: Record<string, unknown>;
}

const FEEDS_STORAGE_KEY = 'avoidance_feeds';

function loadFeedsFromStorage(): AvoidanceFeed[] {
  try {
    const stored = localStorage.getItem(FEEDS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return getDefaultFeeds();
}

function saveFeedsToStorage(feeds: AvoidanceFeed[]) {
  localStorage.setItem(FEEDS_STORAGE_KEY, JSON.stringify(feeds));
}

function getDefaultFeeds(): AvoidanceFeed[] {
  return [
    {
      id: 'builtin-surveillance',
      name: 'Surveillance Cameras',
      url: '',
      type: 'builtin-surveillance',
      enabled: false,
      showOnMap: false,
      pointCount: 0,
      lastFetched: null,
      removable: false,
      visibleTypes: {
        alpr: true,
        speed_camera: true,
        red_light_camera: true,
        traffic_camera: true,
        cctv: true,
        gunshot_detector: true,
        other: true,
      },
    },
    {
      id: 'builtin-iceout',
      name: 'ICE Activity',
      url: '',
      type: 'iceout',
      enabled: false,
      showOnMap: false,
      pointCount: 0,
      lastFetched: null,
      removable: false,
      maxAgeDays: 30,
    },
  ];
}

interface FeedState {
  feeds: AvoidanceFeed[];
  unavoidableCount: Record<string, number>;
}

interface FeedActions {
  toggleFeedEnabled: (feedId: string) => void;
  toggleFeedShowOnMap: (feedId: string) => void;
  updateFeedPointCount: (feedId: string, count: number) => void;
  updateFeedLastFetched: (feedId: string) => void;
  setUnavoidableCount: (feedId: string, count: number) => void;
  updateFeedConfig: (feedId: string, config: Partial<AvoidanceFeed>) => void;
  addFeed: (feed: AvoidanceFeed) => void;
  removeFeed: (feedId: string) => void;
  toggleVisibleType: (feedId: string, type: string) => void;
}

type FeedStore = FeedState & FeedActions;

export const useFeedStore = create<FeedStore>()(
  devtools(
    immer((set) => ({
      feeds: loadFeedsFromStorage(),
      unavoidableCount: {},

      toggleFeedEnabled: (feedId) =>
        set(
          (state) => {
            const feed = state.feeds.find((f) => f.id === feedId);
            if (feed) {
              feed.enabled = !feed.enabled;
              saveFeedsToStorage(state.feeds);
            }
          },
          undefined,
          'toggleFeedEnabled'
        ),

      toggleFeedShowOnMap: (feedId) =>
        set(
          (state) => {
            const feed = state.feeds.find((f) => f.id === feedId);
            if (feed) {
              feed.showOnMap = !feed.showOnMap;
              saveFeedsToStorage(state.feeds);
            }
          },
          undefined,
          'toggleFeedShowOnMap'
        ),

      updateFeedPointCount: (feedId, count) =>
        set(
          (state) => {
            const feed = state.feeds.find((f) => f.id === feedId);
            if (feed) {
              feed.pointCount = count;
            }
          },
          undefined,
          'updateFeedPointCount'
        ),

      updateFeedLastFetched: (feedId) =>
        set(
          (state) => {
            const feed = state.feeds.find((f) => f.id === feedId);
            if (feed) {
              feed.lastFetched = new Date().toISOString();
              saveFeedsToStorage(state.feeds);
            }
          },
          undefined,
          'updateFeedLastFetched'
        ),

      setUnavoidableCount: (feedId, count) =>
        set(
          (state) => {
            state.unavoidableCount[feedId] = count;
          },
          undefined,
          'setUnavoidableCount'
        ),

      updateFeedConfig: (feedId, config) =>
        set(
          (state) => {
            const feed = state.feeds.find((f) => f.id === feedId);
            if (feed) {
              Object.assign(feed, config);
              saveFeedsToStorage(state.feeds);
            }
          },
          undefined,
          'updateFeedConfig'
        ),

      addFeed: (feed) =>
        set(
          (state) => {
            state.feeds.push(feed);
            saveFeedsToStorage(state.feeds);
          },
          undefined,
          'addFeed'
        ),

      removeFeed: (feedId) =>
        set(
          (state) => {
            state.feeds = state.feeds.filter((f) => f.id !== feedId);
            saveFeedsToStorage(state.feeds);
          },
          undefined,
          'removeFeed'
        ),

      toggleVisibleType: (feedId, type) =>
        set(
          (state) => {
            const feed = state.feeds.find((f) => f.id === feedId);
            if (feed?.visibleTypes) {
              feed.visibleTypes[type] = !feed.visibleTypes[type];
              saveFeedsToStorage(state.feeds);
            }
          },
          undefined,
          'toggleVisibleType'
        ),
    })),
    { name: 'feed-store' }
  )
);
