import { useState } from 'react';
import { ShieldAlert, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFeedStore } from '@/stores/feed-store';
import { FeedCard } from './feed-card';
import { AddFeedDialog } from './add-feed-dialog';
import { useDirectionsQuery } from '@/hooks/use-directions-queries';

export const AvoidancePlaceholder = () => {
  const feeds = useFeedStore((state) => state.feeds);
  const [showAddDialog, setShowAddDialog] = useState(false);
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

      {showAddDialog ? (
        <AddFeedDialog
          onClose={() => setShowAddDialog(false)}
          onAdded={() => {
            setShowAddDialog(false);
          }}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="size-3.5" />
          Add Feed
        </Button>
      )}
    </div>
  );
};
