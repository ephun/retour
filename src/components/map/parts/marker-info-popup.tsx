import { X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const displayProperties = Object.entries(properties).filter(
    ([key, value]) =>
      value !== undefined &&
      value !== null &&
      value !== '' &&
      !['id', 'type'].includes(key)
  );

  return (
    <div className="min-w-[200px] max-w-[300px]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-sm">{type}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0"
          onClick={onClose}
        >
          <X className="size-3" />
        </Button>
      </div>

      <div className="text-xs space-y-1 text-muted-foreground">
        <div>
          <span className="font-medium">Source:</span> {feedName}
        </div>

        {displayProperties.map(([key, value]) => (
          <div key={key}>
            <span className="font-medium capitalize">
              {key.replace(/_/g, ' ')}:
            </span>{' '}
            {String(value)}
          </div>
        ))}

        {distanceFromRoute !== undefined && (
          <div>
            <span className="font-medium">Distance from route:</span>{' '}
            {distanceFromRoute < 1000
              ? `${Math.round(distanceFromRoute)}m`
              : `${(distanceFromRoute / 1000).toFixed(1)}km`}
          </div>
        )}

        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 hover:underline mt-1"
          >
            <ExternalLink className="size-3" />
            View source
          </a>
        )}
      </div>
    </div>
  );
};
