import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useFeedStore, type AvoidanceFeed } from '@/stores/feed-store';
import { SURVEILLANCE_LABELS } from '@/utils/alpr';
import { SliderSetting } from '@/components/ui/slider-setting';

interface FeedCardProps {
  feed: AvoidanceFeed;
  onToggleChanged: () => void;
}

export const FeedCard = ({ feed, onToggleChanged }: FeedCardProps) => {
  const toggleFeedEnabled = useFeedStore((state) => state.toggleFeedEnabled);
  const toggleFeedShowOnMap = useFeedStore(
    (state) => state.toggleFeedShowOnMap
  );
  const toggleVisibleType = useFeedStore((state) => state.toggleVisibleType);
  const updateFeedConfig = useFeedStore((state) => state.updateFeedConfig);
  const removeFeed = useFeedStore((state) => state.removeFeed);
  const unavoidableCount = useFeedStore(
    (state) => state.unavoidableCount[feed.id] ?? 0
  );

  const handleToggleEnabled = () => {
    toggleFeedEnabled(feed.id);
    onToggleChanged();
  };

  const handleToggleShowOnMap = () => {
    toggleFeedShowOnMap(feed.id);
    // no reroute needed, just visual
  };

  const handleRemove = () => {
    removeFeed(feed.id);
  };

  const feedTypeLabel = () => {
    switch (feed.type) {
      case 'builtin-surveillance':
        return 'OpenStreetMap';
      case 'iceout':
        return 'iceout.org API';
      case 'geojson':
        return feed.url || 'GeoJSON feed';
      default:
        return feed.type;
    }
  };

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={feed.enabled}
            onCheckedChange={handleToggleEnabled}
          />
          <span className="text-sm font-medium">{feed.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleToggleShowOnMap}
            title={feed.showOnMap ? 'Hide from map' : 'Show on map'}
          >
            {feed.showOnMap ? (
              <Eye className="size-3.5" />
            ) : (
              <EyeOff className="size-3.5 text-muted-foreground" />
            )}
          </Button>
          {feed.removable && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive"
              onClick={handleRemove}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-0.5 pl-6">
        <div>Source: {feedTypeLabel()}</div>
        {feed.pointCount > 0 && (
          <div>{feed.pointCount.toLocaleString()} points loaded</div>
        )}
        {feed.enabled && unavoidableCount > 0 && (
          <div className="text-amber-600">
            {unavoidableCount} could not be avoided (shown on map)
          </div>
        )}
      </div>

      {/* Surveillance type toggles (visual only) */}
      {feed.type === 'builtin-surveillance' &&
        feed.visibleTypes &&
        feed.showOnMap && (
          <div className="pl-6 pt-1">
            <div className="text-xs text-muted-foreground mb-1">
              Types (visual only):
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(feed.visibleTypes).map(([type, visible]) => (
                <label
                  key={type}
                  className="flex items-center gap-1 text-xs cursor-pointer"
                >
                  <Checkbox
                    className="size-3"
                    checked={visible}
                    onCheckedChange={() => toggleVisibleType(feed.id, type)}
                  />
                  {SURVEILLANCE_LABELS[
                    type as keyof typeof SURVEILLANCE_LABELS
                  ] || type}
                </label>
              ))}
            </div>
          </div>
        )}

      {/* ICE max age config */}
      {feed.type === 'iceout' && (
        <div className="pl-6 pt-1">
          <SliderSetting
            id={`${feed.id}-max-age`}
            label="Max age"
            description="Only consider reports from within this many days"
            min={0}
            max={365}
            step={1}
            value={feed.maxAgeDays ?? 30}
            unit="days"
            onValueChange={(values) => {
              updateFeedConfig(feed.id, { maxAgeDays: values[0] ?? 30 });
            }}
            onValueCommit={() => {
              if (feed.enabled) onToggleChanged();
            }}
            onInputChange={(values) => {
              let value = values[0] ?? 30;
              if (isNaN(value)) value = 0;
              value = Math.max(0, Math.min(365, value));
              updateFeedConfig(feed.id, { maxAgeDays: value });
              if (feed.enabled) onToggleChanged();
            }}
          />
        </div>
      )}
    </div>
  );
};
