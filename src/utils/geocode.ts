import type { PhotonResponse } from '@/components/types';
import axios from 'axios';
import { getPhotonUrl } from './photon-url';

export const forward_geocode = (userInput: string) =>
  axios.get<PhotonResponse>(`${getPhotonUrl()}/api`, {
    params: {
      q: userInput,
      limit: 5,
    },
  });

export const reverse_geocode = (lon: number, lat: number) =>
  axios.get<PhotonResponse>(`${getPhotonUrl()}/reverse`, {
    params: {
      lon,
      lat,
      limit: 1,
    },
  });

function buildDisplayName(props: Record<string, string | undefined>): string {
  const parts: string[] = [];
  if (props.name) parts.push(props.name);
  if (props.housenumber && props.street) {
    parts.push(`${props.housenumber} ${props.street}`);
  } else if (props.street) {
    parts.push(props.street);
  } else if (props.housenumber) {
    parts.push(props.housenumber);
  }
  if (props.city) parts.push(props.city);
  if (props.state) parts.push(props.state);
  if (props.country) parts.push(props.country);
  return parts.join(', ') || 'Unknown location';
}

export const parseGeocodeResponse = (
  results: PhotonResponse,
  lngLat?: [number, number]
) => {
  if (!results.features || results.features.length === 0) {
    if (lngLat) {
      return [
        {
          title: lngLat.toString(),
          description: '',
          selected: true,
          addresslnglat: lngLat,
          sourcelnglat: lngLat,
          displaylnglat: lngLat,
          key: 0,
          addressindex: 0,
        },
      ];
    }
    return [];
  }

  return results.features.map((feature, index) => {
    const coords: [number, number] = [
      feature.geometry.coordinates[0],
      feature.geometry.coordinates[1],
    ];
    const props = feature.properties;
    const displayName = buildDisplayName(props);
    const osmType =
      props.osm_type === 'N'
        ? 'node'
        : props.osm_type === 'W'
          ? 'way'
          : 'relation';
    const osmLink = props.osm_id
      ? `https://www.openstreetmap.org/${osmType}/${props.osm_id}`
      : '';

    return {
      title: displayName,
      description: osmLink,
      selected: index === 0 && lngLat !== undefined,
      addresslnglat: coords,
      sourcelnglat: lngLat ?? coords,
      displaylnglat: lngLat ?? coords,
      key: index,
      addressindex: index,
    };
  });
};
