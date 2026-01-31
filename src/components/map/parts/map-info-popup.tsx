import { X, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface MapInfoPopupProps {
  popupLngLat: { lng: number; lat: number };
  address: string;
  onClose: () => void;
}

export function MapInfoPopup({
  popupLngLat,
  address,
  onClose,
}: MapInfoPopupProps) {
  const coordStr = `${popupLngLat.lat.toFixed(6)}, ${popupLngLat.lng.toFixed(6)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(coordStr).then(() => {
      toast.success('Coordinates copied');
    });
  };

  return (
    <div className="flex flex-col gap-1.5 p-2 min-w-[180px]">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onClose}
        className="absolute right-1 top-1"
      >
        <X className="size-4" />
      </Button>

      {address && <div className="font-semibold text-sm pr-6">{address}</div>}

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
  );
}
