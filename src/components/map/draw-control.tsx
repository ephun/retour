import { useRef, useMemo, useState, useCallback } from 'react';
import { useControl } from 'react-map-gl/maplibre';
import { MaplibreTerradrawControl } from '@watergis/maplibre-gl-terradraw';
import '@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css';
import { formatDistanceMeters } from '@/utils/units';
import { useUnitSystem } from '@/hooks/use-unit-system';

interface DrawControlProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  onUpdate?: () => void;
  controlRef?: React.MutableRefObject<MaplibreTerradrawControl | null>;
}

/** Haversine distance between two [lng, lat] points, returns meters. */
function haversineDistance(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function computeLineDistance(
  controlRef: React.MutableRefObject<MaplibreTerradrawControl | null>
): number | null {
  if (!controlRef.current) return null;
  const td = controlRef.current.getTerraDrawInstance();
  if (!td) return null;
  const snapshot = td.getSnapshot();
  const lines = snapshot.filter(
    (f) =>
      f.properties?.mode === 'linestring' && f.geometry.type === 'LineString'
  );
  if (lines.length === 0) return null;
  const lastLine = lines[lines.length - 1]!;
  const coords = lastLine.geometry.coordinates as [number, number][];
  if (coords.length < 2) return null;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(coords[i - 1]!, coords[i]!);
  }
  return total;
}

export function DrawControl({
  position = 'top-right',
  onUpdate,
  controlRef,
}: DrawControlProps) {
  const finishHandlerRef = useRef<((id: string | number) => void) | null>(null);
  const changeHandlerRef = useRef<
    ((ids: (string | number)[], type: string) => void) | null
  >(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [measureMeters, setMeasureMeters] = useState<number | null>(null);
  const [unitSystem] = useUnitSystem();

  const debouncedOnUpdate = useMemo(() => {
    if (!onUpdate) return undefined;
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        onUpdate();
        debounceTimeoutRef.current = null;
      }, 50);
    };
  }, [onUpdate]);

  const clearOldLines = useCallback(
    (keepId?: string | number) => {
      if (!controlRef?.current) return;
      const td = controlRef.current.getTerraDrawInstance();
      if (!td) return;
      const snapshot = td.getSnapshot();
      const lineIds = snapshot
        .filter(
          (f) =>
            f.properties?.mode === 'linestring' &&
            f.id !== undefined &&
            f.id !== keepId
        )
        .map((f) => f.id)
        .filter((id): id is string | number => id !== undefined);
      if (lineIds.length > 0) {
        td.removeFeatures(lineIds);
      }
    },
    [controlRef]
  );

  useControl<MaplibreTerradrawControl>(
    () => {
      const control = new MaplibreTerradrawControl({
        modes: ['linestring', 'select', 'delete-selection'],
        open: true,
      });

      if (controlRef) {
        controlRef.current = control;
      }

      return control;
    },
    () => {
      if (controlRef?.current) {
        const terraDrawInstance = controlRef.current.getTerraDrawInstance();
        if (terraDrawInstance) {
          finishHandlerRef.current = (id: string | number) => {
            // Keep only the just-finished line, remove all others
            clearOldLines(id);
            if (controlRef) {
              setMeasureMeters(computeLineDistance(controlRef));
            }
            if (debouncedOnUpdate) debouncedOnUpdate();
          };
          terraDrawInstance.on('finish', finishHandlerRef.current);

          changeHandlerRef.current = (
            _ids: (string | number)[],
            type: string
          ) => {
            if (controlRef) {
              setMeasureMeters(computeLineDistance(controlRef));
            }
            if (type === 'delete' && debouncedOnUpdate) {
              debouncedOnUpdate();
            }
          };
          terraDrawInstance.on('change', changeHandlerRef.current);
        }
      }
    },
    () => {
      if (controlRef?.current) {
        const terraDrawInstance = controlRef.current.getTerraDrawInstance();
        if (terraDrawInstance) {
          if (finishHandlerRef.current) {
            terraDrawInstance.off('finish', finishHandlerRef.current);
          }
          if (changeHandlerRef.current) {
            terraDrawInstance.off('change', changeHandlerRef.current);
          }
        }
      }

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    },
    {
      position: position,
    }
  );

  if (measureMeters === null) return null;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-background/90 backdrop-blur rounded-lg px-4 py-2 shadow-lg border text-sm font-medium pointer-events-none">
      {formatDistanceMeters(measureMeters, unitSystem)}
    </div>
  );
}
