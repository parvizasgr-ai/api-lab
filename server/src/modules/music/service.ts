// Musiqi: axtarış (DB və ya YouTube + cache), oxutma (embed URL + play_history), playlist-lər.
import type { Request } from 'express';
import type { AppContext } from '../../app.js';
import { conflict, notFound } from '../../errors.js';
import { loadOwned } from '../../lib/bola.js';
import { isoNow } from '../../lib/crypto.js';
import { offsetOf, pageOf } from '../../lib/listing.js';
import type { AuthContext } from '../../types.js';
import { musicRepo, type PlaylistRow, type TrackRow } from './repo.js';
import { searchYoutube } from './youtube.js';

export const toTrack = (t: TrackRow) => ({
  id: t.id,
  youtubeId: t.youtube_id,
  title: t.title,
  artist: t.artist,
  genre: t.genre,
  durationSec: t.duration_sec,
  thumbnailUrl: `https://i.ytimg.com/vi/${t.youtube_id}/hqdefault.jpg`,
});

export class MusicService {
  constructor(private ctx: AppContext) {}

  private get db() {
    return this.ctx.db;
  }

  async search(q: { q?: string; artist?: string; genre?: string; page: number; size: number }) {
    const { youtubeApiKey, fetch } = this.ctx.config;
    if (youtubeApiKey && q.q) {
      const videos = await searchYoutube(fetch, youtubeApiKey, q.q, q.size);
      await this.db.transaction(async () => {
                for (const v of videos) {
                  await musicRepo.cacheTrack(this.db, { youtube_id: v.youtubeId, title: v.title, artist: v.channel, genre: 'YouTube', duration_sec: v.durationSec });
                }
              })();
      const byId = new Map((await musicRepo.byYoutubeIds(this.db, videos.map((v) => v.youtubeId))).map((t) => [t.youtube_id, t]));
      const items = videos.map((v) => byId.get(v.youtubeId)!).map(toTrack);
      return { ...pageOf(items, 1, q.size, items.length), source: 'youtube' as const };
    }
    const filter = { q: q.q, artist: q.artist, genre: q.genre };
    const total = await musicRepo.count(this.db, filter);
    const rows = await musicRepo.search(this.db, filter, q.size, offsetOf(q.page, q.size));
    return { ...pageOf(rows.map(toTrack), q.page, q.size, total), source: 'db' as const };
  }

  async getTrack(id: number) {
    const t = await musicRepo.get(this.db, id);
    if (!t) throw notFound('TRACK_NOT_FOUND', 'Trek tapılmadı');
    return t;
  }

  async play(auth: AuthContext, trackId: number) {
    const t = await this.getTrack(trackId);
    const startedAt = isoNow(this.ctx.config.now());
    await musicRepo.insertPlay(this.db, auth.userId, t.id, startedAt);
    return { trackId: t.id, youtubeId: t.youtube_id, embedUrl: `https://www.youtube.com/embed/${t.youtube_id}`, startedAt };
  }

  async popular(limit = 10) {
    return (await musicRepo.popular(this.db, limit)).map((t) => ({ ...toTrack(t), playCount: t.play_count }));
  }

  private toPlaylist = async (p: PlaylistRow) => ({
    id: p.id,
    name: p.name,
    createdAt: p.created_at,
    tracks: (await musicRepo.playlistTracks(this.db, p.id)).map((t) => ({ position: t.position, track: toTrack(t) })),
  });

  async playlists(auth: AuthContext) {
    return { items: await Promise.all((await musicRepo.playlists(this.db, auth.userId)).map((p) => this.toPlaylist(p))) };
  }

  private async owned(auth: AuthContext | undefined, id: number) {
    return loadOwned(await musicRepo.getPlaylist(this.db, id), auth, 'PLAYLIST_NOT_FOUND', 'Playlist tapılmadı');
  }

  async getPlaylist(auth: AuthContext, id: number) {
    return this.toPlaylist(await this.owned(auth, id));
  }

  async createPlaylist(auth: AuthContext, name: string) {
    const id = await musicRepo.insertPlaylist(this.db, auth.userId, name, isoNow(this.ctx.config.now()));
    return this.toPlaylist((await musicRepo.getPlaylist(this.db, id))!);
  }

  async addTrack(req: Request, playlistId: number, body: { trackId: number; position?: number }) {
    await this.db.transaction(async () => {
            await this.owned(req.auth, playlistId);
            await this.getTrack(body.trackId);
            const next = await musicRepo.nextPosition(this.db, playlistId);
            const position = Math.min(body.position ?? next, next);
            try {
              await musicRepo.shiftFrom(this.db, playlistId, position, 1); // araya əlavə: sonrakılar 1 pillə aşağı
              await musicRepo.insertPlaylistTrack(this.db, playlistId, body.trackId, position);
            } catch (err) {
              // PRIMARY KEY (playlist_id, track_id) — eyni trek iki dəfə ola bilməz
              if ((err as { code?: string }).code === '23505') throw conflict('TRACK_ALREADY_IN_PLAYLIST', 'Bu trek artıq playlist-dədir');
              throw err;
            }
          })();
    return this.getPlaylist(req.auth!, playlistId);
  }

  async removeTrack(req: Request, playlistId: number, trackId: number) {
    await this.db.transaction(async () => {
            await this.owned(req.auth, playlistId);
            const removed = await musicRepo.removePlaylistTrack(this.db, playlistId, trackId);
            if (!removed) throw notFound('TRACK_NOT_IN_PLAYLIST', 'Trek bu playlist-də deyil');
            await musicRepo.shiftFrom(this.db, playlistId, removed.position + 1, -1); // boşluq qalmasın
          })();
  }
}
