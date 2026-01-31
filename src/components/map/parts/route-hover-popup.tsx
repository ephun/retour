import { Popup } from 'react-map-gl/maplibre';
import { MoveHorizontal, Clock } from 'lucide-react';
import { formatDuration } from '@/utils/date-time';
import { formatDistance } from '@/utils/units';
import { useUnitSystem } from '@/hooks/use-unit-system';
import type { Summary } from '@/components/types';

interface RouteHoverPopupProps {
  lng: number;
  lat: number;
  summary: Summary;
}

export function RouteHoverPopup({ lng, lat, summary }: RouteHoverPopupProps) {
  const [unitSystem] = useUnitSystem();
  return (
    <Popup
      longitude={lng}
      latitude={lat}
      anchor="bottom"
      closeButton={false}
      closeOnClick={false}
      maxWidth="none"
    >
      <div className="min-w-[120px] p-3">
        <div className="font-bold text-muted-foreground">Route Summary</div>
        <div className="flex items-center gap-1">
          <MoveHorizontal className="size-3.5" />
          <span>{formatDistance(summary.length, unitSystem)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="size-3.5" />
          <span>{formatDuration(summary.time)}</span>
        </div>
      </div>
    </Popup>
  );
}
