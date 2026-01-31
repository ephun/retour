import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFeedStore, type AvoidanceFeed } from '@/stores/feed-store';

interface AddFeedDialogProps {
  onClose: () => void;
  onAdded: () => void;
}

export const AddFeedDialog = ({ onClose, onAdded }: AddFeedDialogProps) => {
  const addFeed = useFeedStore((state) => state.addFeed);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!url.trim()) {
      setError('URL is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Validate URL and try to fetch
      const response = await fetch(url.trim());
      const data = await response.json();

      if (data.type !== 'FeatureCollection') {
        setError('URL must return a GeoJSON FeatureCollection');
        setLoading(false);
        return;
      }

      const pointCount = (data.features || []).filter(
        (f: { geometry?: { type: string } }) => f.geometry?.type === 'Point'
      ).length;

      const feed: AvoidanceFeed = {
        id: `custom-${Date.now()}`,
        name: name.trim(),
        url: url.trim(),
        type: 'geojson',
        enabled: false,
        showOnMap: false,
        pointCount,
        lastFetched: new Date().toISOString(),
        removable: true,
      };

      addFeed(feed);
      onAdded();
    } catch {
      setError(
        'Failed to fetch or parse feed. Ensure the URL returns valid GeoJSON.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="text-sm font-medium">Add Custom Feed</div>
      <Input
        placeholder="Feed name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="GeoJSON URL"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleAdd} disabled={loading}>
          {loading ? 'Loading...' : 'Add'}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
