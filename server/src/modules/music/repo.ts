// Musiqi repo — treklər, playlist-lər (kompozit PK), dinləmə tarixçəsi.
import type { DB } from '../../db.js';

export interface TrackRow {
  id: number;
  youtube_id: string;
  title: string;
  artist: string;
  genre: string;
  duration_sec: number;
}

export interface PlaylistRow {
  id: number;
  owner_id: number; // = user_id
  name: string;
  created_at: string;
}

export interface TrackFilter {
  q?: string;
  artist?: string;
  genre?: string;
}

function where(f: TrackFilter) {
  return {
    sql: `WHERE (@q::text IS NULL OR title ILIKE @q OR artist ILIKE @q)
            AND (@artist::text IS NULL OR artist ILIKE @artist)
            AND (@genre::text IS NULL OR genre = @genre)`,
    params: { q: f.q ? `%${f.q}%` : null, artist: f.artist ? `%${f.artist}%` : null, genre: f.genre ?? null },
  };
}

export const musicRepo = {
  async count(db: DB, f: TrackFilter) {
    const w = where(f);
    return (await db.prepare(`SELECT COUNT(*) FROM tracks ${w.sql}`).pluck().get(w.params)) as number;
  },

  async search(db: DB, f: TrackFilter, limit: number, offset: number) {
    const w = where(f);
    return (await db.prepare(`SELECT * FROM tracks ${w.sql} ORDER BY id LIMIT @limit OFFSET @offset`).all({ ...w.params, limit, offset })) as TrackRow[];
  },

  get: async (db: DB, id: number) => (await db.prepare(`SELECT * FROM tracks WHERE id = ?`).get(id)) as TrackRow | undefined,

  byYoutubeIds: async (db: DB, ids: string[]) =>
    (await db.prepare(`SELECT * FROM tracks WHERE youtube_id = ANY(?::text[])`).all([ids])) as TrackRow[],

  // YouTube cache: artıq varsa toxunulmur (youtube_id UNIQUE)
  cacheTrack: (db: DB, t: Omit<TrackRow, 'id'>) =>
    db
      .prepare(
        `INSERT INTO tracks (youtube_id, title, artist, genre, duration_sec) VALUES (@youtube_id, @title, @artist, @genre, @duration_sec)
         ON CONFLICT (youtube_id) DO NOTHING`,
      )
      .run(t),

  insertPlay: (db: DB, userId: number, trackId: number, at: string) =>
    db.prepare(`INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)`).run(userId, trackId, at),

  popular: async (db: DB, limit: number) =>
    (await db
            .prepare(
              `SELECT t.*, COUNT(ph.id) AS play_count
         FROM tracks t JOIN play_history ph ON ph.track_id = t.id
         GROUP BY t.id ORDER BY play_count DESC, MAX(ph.played_at) DESC LIMIT ?`,
            )
            .all(limit)) as (TrackRow & { play_count: number })[],

  playlists: async (db: DB, userId: number) =>
    (await db.prepare(`SELECT id, user_id AS owner_id, name, created_at FROM playlists WHERE user_id = ? ORDER BY id`).all(userId)) as PlaylistRow[],

  getPlaylist: async (db: DB, id: number) =>
    (await db.prepare(`SELECT id, user_id AS owner_id, name, created_at FROM playlists WHERE id = ?`).get(id)) as PlaylistRow | undefined,

  playlistTracks: async (db: DB, playlistId: number) =>
    (await db
            .prepare(
              `SELECT pt.position, t.* FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
         WHERE pt.playlist_id = ? ORDER BY pt.position`,
            )
            .all(playlistId)) as (TrackRow & { position: number })[],

  insertPlaylist: async (db: DB, userId: number, name: string, at: string) =>
    Number((await db.prepare(`INSERT INTO playlists (user_id, name, created_at) VALUES (?, ?, ?)`).run(userId, name, at)).lastInsertRowid),

  nextPosition: async (db: DB, playlistId: number) =>
    (await db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 FROM playlist_tracks WHERE playlist_id = ?`).pluck().get(playlistId)) as number,

  shiftFrom: (db: DB, playlistId: number, position: number, delta: 1 | -1) =>
    db.prepare(`UPDATE playlist_tracks SET position = position + ? WHERE playlist_id = ? AND position >= ?`).run(delta, playlistId, position),

  insertPlaylistTrack: (db: DB, playlistId: number, trackId: number, position: number) =>
    db.prepare(`INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)`).run(playlistId, trackId, position),

  removePlaylistTrack: async (db: DB, playlistId: number, trackId: number) =>
    (await db.prepare(`DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ? RETURNING position`).get(playlistId, trackId)) as
      Promise<| { position: number }>
      | undefined,
};
