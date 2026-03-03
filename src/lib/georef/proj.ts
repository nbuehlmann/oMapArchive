import proj4 from 'proj4'

export const wgs84ToWebMercator = (lng: number, lat: number): [number, number] =>
  proj4('EPSG:4326', 'EPSG:3857', [lng, lat]) as [number, number]
