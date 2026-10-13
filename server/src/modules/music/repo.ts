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
    sql: `WHERE (@q IS NULL OR title LIKE @q OR artist LIKE @q)
            AND (@artist IS NULL OR artist LIKE @artist)
            AND (@genre IS NULL OR genre = @genre)`,
    params: { q: f.q ? `%${f.q}%` : null, artist: f.artist ? `%${f.artist}%` : null, genre: f.genre ?? null },
  };
}

export const musicRepo = {
  count(db: DB, f: TrackFilter) {
    const w = where(f);
    return db.prepare(`SELECT COUNT(*) FROM tracks ${w.sql}`).pluck().get(w.params) as number;
  },

  search(db: DB, f: TrackFilter, limit: number, offset: number) {
    const w = where(f);
    return db.prepare(`SELECT * FROM tracks ${w.sql} ORDER BY id LIMIT @limit OFFSET @offset`).all({ ...w.params, limit, offset }) as TrackRow[];
  },

  get: (db: DB, id: number) => db.prepare(`SELECT * FROM tracks WHERE id = ?`).get(id) as TrackRow | undefined,

  byYoutubeIds: (db: DB, ids: string[]) =>
    db.prepare(`SELECT * FROM tracks WHERE youtube_id IN (SELECT value FROM json_each(?))`).all(JSON.stringify(ids)) as TrackRow[],

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

  popular: (db: DB, limit: number) =>
    db
      .prepare(
        `SELECT t.*, COUNT(ph.id) AS play_count
         FROM tracks t JOIN play_history ph ON ph.track_id = t.id
         GROUP BY t.id ORDER BY play_count DESC, MAX(ph.played_at) DESC LIMIT ?`,
      )
      .all(limit) as (TrackRow & { play_count: number })[],

  playlists: (db: DB, userId: number) =>
    db.prepare(`SELECT id, user_id AS owner_id, name, created_at FROM playlists WHERE user_id = ? ORDER BY id`).all(userId) as PlaylistRow[],

  getPlaylist: (db: DB, id: number) =>
    db.prepare(`SELECT id, user_id AS owner_id, name, created_at FROM playlists WHERE id = ?`).get(id) as PlaylistRow | undefined,

  playlistTracks: (db: DB, playlistId: number) =>
    db
      .prepare(
        `SELECT pt.position, t.* FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
         WHERE pt.playlist_id = ? ORDER BY pt.position`,
      )
      .all(playlistId) as (TrackRow & { position: number })[],

  insertPlaylist: (db: DB, userId: number, name: string, at: string) =>
    Number(db.prepare(`INSERT INTO playlists (user_id, name, created_at) VALUES (?, ?, ?)`).run(userId, name, at).lastInsertRowid),

  nextPosition: (db: DB, playlistId: number) =>
    db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 FROM playlist_tracks WHERE playlist_id = ?`).pluck().get(playlistId) as number,

  shiftFrom: (db: DB, playlistId: number, position: number, delta: 1 | -1) =>
    db.prepare(`UPDATE playlist_tracks SET position = position + ? WHERE playlist_id = ? AND position >= ?`).run(delta, playlistId, position),

  insertPlaylistTrack: (db: DB, playlistId: number, trackId: number, position: number) =>
    db.prepare(`INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)`).run(playlistId, trackId, position),

  removePlaylistTrack: (db: DB, playlistId: number, trackId: number) =>
    db.prepare(`DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ? RETURNING position`).get(playlistId, trackId) as
      | { position: number }
      | undefined,
};
