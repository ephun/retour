import { X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceMeters } from '@/utils/units';
import { useUnitSystem } from '@/hooks/use-unit-system';

const typeColors: Record<string, string> = {
  alpr: 'bg-red-500',
  speed_camera: 'bg-orange-500',
  red_light_camera: 'bg-yellow-500',
  traffic_camera: 'bg-blue-500',
  cctv: 'bg-purple-500',
  ice_activity: 'bg-amber-600',
};

interface MarkerInfoPopupProps {
  type: string;
  feedName: string;
  properties: Record<string, unknown>;
  sourceUrl?: string;
  distanceFromRoute?: number;
  onClose: () => void;
}

export const MarkerInfoPopup = ({
  type,
  feedName,
  properties,
  sourceUrl,
  distanceFromRoute,
  onClose,
}: MarkerInfoPopupProps) => {
  const [unitSystem] = useUnitSystem();
  const displayProperties = Object.entries(properties).filter(
    ([key, value]) =>
      value !== undefined &&
      value !== null &&
      value !== '' &&
      !['id', 'type', 'reportId'].includes(key)
  );

  const accentColor = typeColors[type.toLowerCase()] ?? 'bg-muted-foreground';

  return (
    <div className="min-w-[200px] max-w-[300px] p-3">
      <div className="flex items-center gap-2 mb-3 pr-6">
        <div className={`w-1 h-5 rounded-full ${accentColor}`} />
        <h3 className="font-bold text-sm">{type}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0 absolute right-1 top-1"
          onClick={onClose}
        >
          <X className="size-3" />
        </Button>
      </div>

      <div className="text-xs space-y-1.5 text-muted-foreground">
        <div className="flex gap-1.5">
          <span className="font-medium text-foreground/70">Source:</span>
          <span>{feedName}</span>
        </div>

        {displayProperties.map(([key, value]) => (
          <div key={key} className="flex gap-1.5">
            <span className="font-medium text-foreground/70 capitalize">
              {key.replace(/_/g, ' ')}:
            </span>
            <span>{String(value)}</span>
          </div>
        ))}

        {distanceFromRoute !== undefined && (
          <div className="flex gap-1.5 pt-1 border-t border-border/50">
            <span className="font-medium text-foreground/70">
              Distance from route:
            </span>
            <span>{formatDistanceMeters(distanceFromRoute, unitSystem)}</span>
          </div>
        )}

        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 hover:underline pt-1"
          >
            <ExternalLink className="size-3" />
            View source
          </a>
        )}

        {type.toLowerCase().includes('ice') && !!properties.reportId && (
          <a
            href={`https://iceout.org/en/reportInfo/${String(properties.reportId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 hover:underline pt-1"
          >
            <ExternalLink className="size-3" />
            View on iceout.org
          </a>
        )}
      </div>
    </div>
  );
};
