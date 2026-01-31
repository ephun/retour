import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { useDirectionsStore } from '@/stores/directions-store';
import { Copy, X } from 'lucide-react';
import { toast } from 'sonner';

interface MapContextMenuProps {
  activeTab: string;
  onAddWaypoint: (index: number) => void;
  onAddIsoWaypoint: () => void;
  popupLocation: { lng: number; lat: number };
  address: string;
  onClose: () => void;
}

export function MapContextMenu({
  activeTab,
  onAddWaypoint,
  onAddIsoWaypoint,
  popupLocation,
  address,
  onClose,
}: MapContextMenuProps) {
  const waypointCount = useDirectionsStore((state) => state.waypoints.length);
  const addWaypointAtIndex = useDirectionsStore(
    (state) => state.addWaypointAtIndex
  );

  const coordStr = `${popupLocation.lat.toFixed(6)}, ${popupLocation.lng.toFixed(6)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(coordStr).then(() => {
      toast.success('Coordinates copied');
    });
  };

  const showDirectionsButtons =
    activeTab === 'directions' || activeTab === 'avoid';

  return (
    <div className="flex flex-col gap-2 p-3 min-w-[200px]">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onClose}
        className="absolute right-1 top-1"
      >
        <X className="size-4" />
      </Button>

      {showDirectionsButtons && (
        <ButtonGroup
          orientation="vertical"
          data-testid="button-group-right-context"
        >
          <Button variant="outline" size="sm" onClick={() => onAddWaypoint(0)}>
            Directions from here
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              addWaypointAtIndex({
                index: waypointCount - 1,
                placeholder: popupLocation,
              });
              onAddWaypoint(waypointCount - 1);
            }}
          >
            Add as via point
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddWaypoint(waypointCount - 1)}
          >
            Directions to here
          </Button>
        </ButtonGroup>
      )}

      {activeTab === 'isochrones' && (
        <ButtonGroup orientation="vertical">
          <Button variant="outline" size="sm" onClick={onAddIsoWaypoint}>
            Set center here
          </Button>
        </ButtonGroup>
      )}

      <div className="border-t border-border pt-2 mt-1">
        {address && (
          <div className="font-semibold text-sm pr-6 mb-1">{address}</div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-mono">{coordStr}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopy}
            className="size-5 shrink-0"
          >
            <Copy className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
