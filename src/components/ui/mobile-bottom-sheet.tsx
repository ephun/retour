import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useCommonStore } from '@/stores/common-store';

const SNAP_POINTS = [0.12, 0.5, 0.92] as const;

interface MobileBottomSheetProps {
  children: ReactNode;
  open: boolean;
}

export function MobileBottomSheet({ children, open }: MobileBottomSheetProps) {
  const [snapIndex, setSnapIndex] = useState(0);
  const setBottomSheetSnap = useCommonStore((s) => s.setBottomSheetSnap);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startY: number;
    startHeight: number;
    dragging: boolean;
  } | null>(null);
  const [currentHeight, setCurrentHeight] = useState(
    window.innerHeight * SNAP_POINTS[0]
  );
  const [transitioning, setTransitioning] = useState(false);

  const snapTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, SNAP_POINTS.length - 1)) as 0 | 1 | 2;
      setTransitioning(true);
      setSnapIndex(clamped);
      setBottomSheetSnap(clamped);
      setCurrentHeight(window.innerHeight * SNAP_POINTS[clamped]);
      setTimeout(() => setTransitioning(false), 300);
    },
    [setBottomSheetSnap]
  );

  useEffect(() => {
    snapTo(0);
  }, [snapTo]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // If content is scrolled down and we're at full snap, let content scroll
      if (snapIndex === 2 && contentRef.current && contentRef.current.scrollTop > 0) {
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      dragState.current = {
        startY: touch.clientY,
        startHeight: currentHeight,
        dragging: true,
      };
    },
    [snapIndex, currentHeight]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragState.current?.dragging) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dy = dragState.current.startY - touch.clientY;
      const newHeight = Math.max(
        window.innerHeight * 0.08,
        Math.min(window.innerHeight * 0.95, dragState.current.startHeight + dy)
      );
      setCurrentHeight(newHeight);
    },
    []
  );

  const handleTouchEnd = useCallback(() => {
    if (!dragState.current?.dragging) return;
    dragState.current.dragging = false;

    const fraction = currentHeight / window.innerHeight;

    // Find closest snap point
    let closest = 0;
    let minDist = Math.abs(fraction - SNAP_POINTS[0]!);
    for (let i = 1; i < SNAP_POINTS.length; i++) {
      const dist = Math.abs(fraction - SNAP_POINTS[i]!);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    snapTo(closest);
  }, [currentHeight, snapTo]);

  if (!open) return null;

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl border-t flex flex-col"
      style={{
        height: currentHeight,
        transition: transitioning ? 'height 0.3s ease-out' : 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Drag handle */}
      <div className="flex justify-center py-2 shrink-0 cursor-grab">
        <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
      </div>

      {/* Scrollable content */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4"
        style={{
          overflowY: snapIndex === 2 ? 'auto' : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
