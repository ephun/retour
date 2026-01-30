export function getPointAtIndex(
  decodedGeometry: number[][],
  index: number
): [number, number] {
  const point = decodedGeometry[index];
  if (!point) return [0, 0];
  return [point[0]!, point[1]!];
}

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findClosestRoutePoint(
  userPos: { lat: number; lng: number },
  decodedGeometry: number[][]
): { index: number; distance: number } {
  let minDist = Infinity;
  let minIndex = 0;

  for (let i = 0; i < decodedGeometry.length; i++) {
    const point = decodedGeometry[i]!;
    const dist = distanceMeters(userPos.lat, userPos.lng, point[0]!, point[1]!);
    if (dist < minDist) {
      minDist = dist;
      minIndex = i;
    }
  }

  return { index: minIndex, distance: minDist };
}

export function isOffRoute(
  userPos: { lat: number; lng: number },
  decodedGeometry: number[][]
): boolean {
  const { distance } = findClosestRoutePoint(userPos, decodedGeometry);
  return distance > 100;
}
