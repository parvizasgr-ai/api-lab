// YouTube Data API v3 klienti (yalnız YOUTUBE_API_KEY təyin olunubsa).
// search.list → video ID-ləri, videos.list → müddət (contentDetails.duration, ISO 8601: PT3M45S).
// Video faylı yüklənmir və axın edilmir — yalnız metadata; oxutma brauzerdə IFrame Player API ilə.
import { ApiError } from '../../errors.js';

export interface YoutubeVideo {
  youtubeId: string;
  title: string;
  channel: string;
  durationSec: number;
}

const API = 'https://www.googleapis.com/youtube/v3';

export function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

const decodeEntities = (s: string) =>
  s.replace(/&(amp|quot|#39|lt|gt);/g, (_, e) => ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' })[e as string]!);

export async function searchYoutube(fetchFn: typeof fetch, apiKey: string, q: string, max: number): Promise<YoutubeVideo[]> {
  const get = async (url: string) => {
    let res: Response;
    try {
      res = await fetchFn(url, { signal: AbortSignal.timeout(5000) });
    } catch {
      throw new ApiError(502, 'BAD_GATEWAY', 'YouTube API cavab vermədi');
    }
    if (!res.ok) throw new ApiError(502, 'BAD_GATEWAY', `YouTube API xətası: HTTP ${res.status}`);
    return res.json() as Promise<any>;
  };
  const search = await get(
    `${API}/search?part=snippet&type=video&videoCategoryId=10&maxResults=${max}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(apiKey)}`,
  );
  const ids: string[] = (search.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const details = await get(`${API}/videos?part=contentDetails,snippet&id=${ids.join(',')}&key=${encodeURIComponent(apiKey)}`);
  return (details.items ?? [])
    .map((v: any) => ({
      youtubeId: v.id,
      title: decodeEntities(v.snippet?.title ?? ''),
      channel: decodeEntities(v.snippet?.channelTitle ?? ''),
      durationSec: parseIsoDuration(v.contentDetails?.duration ?? ''),
    }))
    .filter((v: YoutubeVideo) => v.durationSec > 0); // canlı yayımların müddəti yoxdur
}
