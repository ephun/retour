import { useNavigationStore } from '@/stores/navigation-store';
import { ManeuverIcon } from './maneuver-icon';
import { Button } from '@/components/ui/button';
import { X, Volume2, VolumeX } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-is-mobile';

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatSpeed(speedMs: number | null): string {
  if (speedMs === null || speedMs < 0) return '--';
  return `${Math.round(speedMs * 3.6)} km/h`;
}

function formatETA(
  maneuvers: { time: number }[],
  currentIndex: number
): string {
  let remainingSeconds = 0;
  for (let i = currentIndex; i < maneuvers.length; i++) {
    remainingSeconds += maneuvers[i]!.time;
  }
  const minutes = Math.ceil(remainingSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function getRemainingDistance(
  maneuvers: { length: number }[],
  currentIndex: number
): string {
  let remaining = 0;
  for (let i = currentIndex; i < maneuvers.length; i++) {
    remaining += maneuvers[i]!.length;
  }
  return `${remaining.toFixed(1)} km`;
}

export const NavigationOverlay = () => {
  const isMobile = useIsMobile();
  const isNavigating = useNavigationStore((s) => s.isNavigating);
  const currentManeuverIndex = useNavigationStore(
    (s) => s.currentManeuverIndex
  );
  const maneuvers = useNavigationStore((s) => s.maneuvers);
  const distanceToNextManeuver = useNavigationStore(
    (s) => s.distanceToNextManeuver
  );
  const userPosition = useNavigationStore((s) => s.userPosition);
  const voiceEnabled = useNavigationStore((s) => s.voiceEnabled);
  const stopNavigation = useNavigationStore((s) => s.stopNavigation);
  const toggleVoice = useNavigationStore((s) => s.toggleVoice);

  if (!isNavigating || maneuvers.length === 0) return null;

  const currentManeuver = maneuvers[currentManeuverIndex];
  const nextManeuver = maneuvers[currentManeuverIndex + 1];

  if (!currentManeuver) return null;

  const streetName = currentManeuver.street_names?.join(', ') ?? 'Unknown road';

  return (
    <div
      className={
        isMobile
          ? 'absolute inset-x-0 top-0 z-50 flex flex-col gap-2 p-3 pointer-events-none'
          : 'absolute left-0 top-0 z-50 flex flex-col gap-2 p-3 w-96 pointer-events-none'
      }
    >
      {/* Top bar */}
      <div className="bg-background/90 backdrop-blur rounded-lg p-3 shadow-lg pointer-events-auto flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{streetName}</div>
          <div className="text-xs text-muted-foreground flex gap-2">
            <span>{formatETA(maneuvers, currentManeuverIndex)}</span>
            <span>&middot;</span>
            <span>{getRemainingDistance(maneuvers, currentManeuverIndex)}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={toggleVoice}
        >
          {voiceEnabled ? (
            <Volume2 className="size-4" />
          ) : (
            <VolumeX className="size-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={stopNavigation}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Next maneuver card */}
      <div className="bg-primary/90 text-primary-foreground backdrop-blur rounded-lg p-4 shadow-lg pointer-events-auto">
        <div className="flex items-center gap-3">
          <ManeuverIcon
            type={nextManeuver?.type ?? currentManeuver.type}
            className="size-10 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold">
              {formatDistance(distanceToNextManeuver)}
            </div>
            <div className="text-sm opacity-90 line-clamp-2">
              {nextManeuver?.verbal_pre_transition_instruction ??
                currentManeuver.verbal_pre_transition_instruction}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom speed display */}
      <div className="bg-background/90 backdrop-blur rounded-lg px-3 py-2 shadow-lg pointer-events-auto self-start">
        <div className="text-lg font-mono font-semibold">
          {formatSpeed(userPosition?.speed ?? null)}
        </div>
      </div>
    </div>
  );
};
