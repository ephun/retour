import { useCommonStore } from '@/stores/common-store';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useParams } from '@tanstack/react-router';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { MobileBottomSheet } from '@/components/ui/mobile-bottom-sheet';
import { RoutePlannerContent } from './route-planner-content';

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

export const RoutePlanner = () => {
  const { activeTab } = useParams({ from: '/$activeTab' });
  const directionsPanelOpen = useCommonStore(
    (state) => state.directionsPanelOpen
  );
  const toggleDirections = useCommonStore((state) => state.toggleDirections);
  const isMobile = useIsMobile();

  const tabConfig = TAB_CONFIG[activeTab as keyof typeof TAB_CONFIG];

  if (isMobile) {
    return (
      <MobileBottomSheet open={true}>
        <RoutePlannerContent />
      </MobileBottomSheet>
    );
  }

  return (
    <Sheet open={directionsPanelOpen} modal={false}>
      <SheetTrigger className="absolute top-4 left-4 z-10" asChild>
        <Button onClick={toggleDirections} data-testid="open-directions-button">
          {tabConfig.title}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[400px] sm:max-w-[unset] max-h-screen overflow-y-auto gap-1"
      >
        <SheetHeader className="justify-between">
          <SheetTitle className="sr-only">{tabConfig.title}</SheetTitle>
          <SheetDescription className="sr-only">
            {tabConfig.description}
          </SheetDescription>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDirections}
            data-testid="close-directions-button"
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>
        <RoutePlannerContent />
      </SheetContent>
    </Sheet>
  );
};
