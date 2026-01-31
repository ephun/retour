import { useSyncExternalStore, useCallback } from 'react';
import { getUnitSystem, setUnitSystem, type UnitSystem } from '@/utils/units';

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify() {
  listeners.forEach((l) => l());
}

export function useUnitSystem(): [UnitSystem, (system: UnitSystem) => void] {
  const system = useSyncExternalStore(
    subscribe,
    getUnitSystem,
    () => 'metric' as UnitSystem
  );

  const update = useCallback((newSystem: UnitSystem) => {
    setUnitSystem(newSystem);
    notify();
  }, []);

  return [system, update];
}
