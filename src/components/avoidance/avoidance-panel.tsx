import { ShieldAlert } from 'lucide-react';
import { useFeedStore } from '@/stores/feed-store';
import { FeedCard } from './feed-card';
import { useDirectionsQuery } from '@/hooks/use-directions-queries';

export const AvoidancePlaceholder = () => {
  const feeds = useFeedStore((state) => state.feeds);
  const { refetch: refetchDirections } = useDirectionsQuery();

  const handleToggleChanged = () => {
    refetchDirections();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldAlert className="size-4" />
        Avoidance
      </div>

      <div className="space-y-2">
        {feeds.map((feed) => (
          <FeedCard
            key={feed.id}
            feed={feed}
            onToggleChanged={handleToggleChanged}
          />
        ))}
      </div>
    </div>
  );
};
