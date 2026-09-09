import { env } from "$env/dynamic/public";

export const MAP_MAX_POLYLINES = Number(env.PUBLIC_MAP_MAX_POLYLINES || 100);
export const TIANDITU_API_KEY = env.PUBLIC_TIANDITU_KEY || "";

export const DEFAULT_MAP_CENTER: [number, number] = [104.1954, 35.8617];
export const DEFAULT_MAP_ZOOM = 4;
