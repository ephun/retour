import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { DirectionsControl } from './directions/directions';
import { IsochronesControl } from './isochrones/isochrones';

const TilesControl = lazy(() =>
  import('./tiles/tiles').then((module) => ({ default: module.TilesControl }))
);
import { useCommonStore } from '@/stores/common-store';
import { getValhallaUrl } from '@/utils/valhalla';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useParams, useNavigate } from '@tanstack/react-router';
import { ProfilePicker } from './profile-picker';
import { SettingsButton } from './settings-button';
import type { Profile } from '@/stores/common-store';
import { useDirectionsQuery } from '@/hooks/use-directions-queries';
import { useIsochronesQuery } from '@/hooks/use-isochrones-queries';

const TAB_CONFIG = {
  directions: {
    title: 'Directions',
    description: 'Plan a route between multiple locations',
  },
  isochrones: {
    title: 'Isochrones',
    description: 'Calculate reachable areas from a location',
  },
  tiles: {
    title: 'Tiles',
    description: 'View and manage map tiles',
  },
} as const;

export const RoutePlannerContent = () => {
  const { activeTab } = useParams({ from: '/$activeTab' });
  const navigate = useNavigate({ from: '/$activeTab' });
  const { refetch: refetchDirections } = useDirectionsQuery();
  const { refetch: refetchIsochrones } = useIsochronesQuery();
  const loading = useCommonStore((state) => state.loading);

  const {
    data: lastUpdate,
    isLoading: isLoadingLastUpdate,
    isError: isErrorLastUpdate,
  } = useQuery({
    queryKey: ['lastUpdate'],
    queryFn: async () => {
      const response = await fetch(`${getValhallaUrl()}/status`);
      const data = await response.json();
      return new Date(data.tileset_last_modified * 1000);
    },
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });

  const handleTabChange = (value: string) => {
    navigate({ params: { activeTab: value } });
  };

  const handleProfileChange = (value: Profile) => {
    navigate({
      search: (prev) => ({ ...prev, profile: value }),
      replace: true,
    });

    if (activeTab === 'isochrones') {
      refetchIsochrones();
      setTimeout(() => {
        refetchDirections();
      }, 1000);
    } else {
      refetchDirections();
      setTimeout(() => {
        refetchIsochrones();
      }, 1000);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="directions" data-testid="directions-tab-button">
          Directions
        </TabsTrigger>
        <TabsTrigger value="isochrones" data-testid="isochrones-tab-button">
          Isochrones
        </TabsTrigger>
        <TabsTrigger value="tiles" data-testid="tiles-tab-button">
          Tiles
        </TabsTrigger>
      </TabsList>

      {activeTab !== 'tiles' && (
        <div className="flex justify-between px-2 mb-1 mt-2">
          <ProfilePicker
            loading={loading}
            onProfileChange={handleProfileChange}
          />
          <SettingsButton />
        </div>
      )}

      <TabsContent value="directions" className="flex flex-col gap-3 px-2">
        <DirectionsControl />
      </TabsContent>
      <TabsContent value="isochrones" className="flex flex-col gap-3 px-2">
        <IsochronesControl />
      </TabsContent>
      <TabsContent
        value="tiles"
        className="flex flex-col gap-3 px-2 flex-1 overflow-hidden min-h-0"
      >
        <Suspense fallback={<div>Loading...</div>}>
          <TilesControl />
        </Suspense>
      </TabsContent>

      {activeTab !== 'tiles' && (
        <div className="flex p-2 text-sm">
          {isLoadingLastUpdate && (
            <span className="text-muted-foreground">
              Loading last update...
            </span>
          )}
          {isErrorLastUpdate && (
            <span className="text-destructive">
              Failed to load last update
            </span>
          )}
          {lastUpdate && (
            <span>
              Last Data Update: {format(lastUpdate, 'yyyy-MM-dd, HH:mm')}
            </span>
          )}
        </div>
      )}
    </Tabs>
  );
};
