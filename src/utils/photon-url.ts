const PHOTON_URL_STORAGE_KEY = 'photon_base_url';

const DEFAULT_PHOTON_URL =
  import.meta.env.VITE_NOMINATIM_URL || 'https://photon.komoot.io';

export function getPhotonUrl(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_PHOTON_URL;
  }

  const stored = localStorage.getItem(PHOTON_URL_STORAGE_KEY);
  return stored || DEFAULT_PHOTON_URL;
}

export function setPhotonUrl(url: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const trimmedUrl = url.trim();

  if (trimmedUrl === '' || trimmedUrl === DEFAULT_PHOTON_URL) {
    localStorage.removeItem(PHOTON_URL_STORAGE_KEY);
  } else {
    localStorage.setItem(PHOTON_URL_STORAGE_KEY, trimmedUrl);
  }
}

export function getDefaultPhotonUrl(): string {
  return DEFAULT_PHOTON_URL;
}

export interface PhotonConnectionTestResult {
  reachable: boolean;
  error?: string;
}

export async function testPhotonConnection(
  url: string
): Promise<PhotonConnectionTestResult> {
  const trimmedUrl = url.trim().replace(/\/$/, '');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${trimmedUrl}/api?q=test&limit=1`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        reachable: false,
        error: `Server returned status ${response.status}`,
      };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { reachable: false, error: 'Invalid response format' };
    }

    if (
      !data ||
      typeof data !== 'object' ||
      !('type' in data) ||
      (data as Record<string, unknown>).type !== 'FeatureCollection'
    ) {
      return { reachable: false, error: 'Not a valid Photon server' };
    }

    return { reachable: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { reachable: false, error: 'Connection timeout' };
    }
    return { reachable: false, error: 'Server unreachable' };
  }
}
