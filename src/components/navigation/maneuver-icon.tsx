import {
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  CircleDot,
  MapPin,
  CornerUpRight,
  CornerUpLeft,
  Undo2,
  Redo2,
  RotateCw,
  Ship,
  type LucideIcon,
} from 'lucide-react';

const maneuverIconMap: Record<number, LucideIcon> = {
  0: ArrowUp, // kNone
  1: CircleDot, // kStart
  2: ArrowUpRight, // kStartRight
  3: ArrowUpLeft, // kStartLeft
  4: MapPin, // kDestination
  5: MapPin, // kDestinationRight
  6: MapPin, // kDestinationLeft
  7: ArrowUp, // kBecomes
  8: ArrowUp, // kContinue
  9: ArrowUp, // kContinue
  10: ArrowUpRight, // kSlightRight
  11: CornerUpRight, // kRight
  12: CornerUpRight, // kSharpRight
  13: Undo2, // kUturnRight
  14: Redo2, // kUturnLeft
  15: CornerUpLeft, // kSharpLeft
  16: CornerUpLeft, // kLeft
  17: ArrowUpLeft, // kSlightLeft
  18: ArrowUp, // kRampStraight
  19: ArrowUpRight, // kRampRight
  20: ArrowUpLeft, // kRampLeft
  21: ArrowUpRight, // kExitRight
  22: ArrowUpLeft, // kExitLeft
  23: ArrowUp, // kStayStraight
  24: ArrowUpRight, // kStayRight
  25: RotateCw, // kRoundaboutEnter
  26: RotateCw, // kRoundaboutExit
  27: RotateCw, // kRoundabout
  28: Ship, // kFerryEnter
  29: Ship, // kFerryExit
  30: ArrowUp, // kTransit
  31: ArrowUp, // kTransitTransfer
  32: ArrowUp, // kTransitRemainOn
  33: ArrowUp, // kTransitConnectionStart
  34: ArrowUp, // kTransitConnectionTransfer
  35: ArrowUp, // kTransitConnectionDestination
  36: ArrowUp, // kPostTransitConnectionDestination
  37: ArrowUp, // kMerge
};

interface ManeuverIconProps {
  type: number;
  className?: string;
}

export const ManeuverIcon = ({
  type,
  className = 'size-8',
}: ManeuverIconProps) => {
  const Icon = maneuverIconMap[type] ?? ArrowUp;
  return <Icon className={className} />;
};
