// Musiqi: DB axtarışı, YouTube rejimi (mock fetch + cache), play → play_history, playlist-lər.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

describe('music search + play', () => {
  const t = createTestApp();

  it('DB axtarışı (YOUTUBE_API_KEY yoxdur): q, genre, source=db', async () => {
    const res = await t.api().get('/api/v1/music/search?q=Coldplay');
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'searchMusic');
    expect(res.body).toMatchObject({ total: 2, source: 'db' });
    expect(res.body.items[0].thumbnailUrl).toBe(`https://i.ytimg.com/vi/${res.body.items[0].youtubeId}/hqdefault.jpg`);
    expect((await t.api().get('/api/v1/music/search?genre=Rok')).body.total).toBe(5);
    expect((await t.api().get('/api/v1/music/search?size=500')).status).toBe(422);
  });

  it('play → embed URL (video axını yoxdur) + play_history-də 1 sətir', async () => {
    const { access_token } = await t.login();
    const before = t.db.prepare(`SELECT COUNT(*) FROM play_history WHERE track_id = 1`).pluck().get() as number;
    const res = await t.api().post('/api/v1/music/tracks/1/play').set(bearer(access_token));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'playTrack');
    expect(res.body).toMatchObject({ trackId: 1, youtubeId: '_0tlQUW5X0U', embedUrl: 'https://www.youtube.com/embed/_0tlQUW5X0U' });
    expect(t.db.prepare(`SELECT COUNT(*) FROM play_history WHERE track_id = 1`).pluck().get()).toBe(before + 1);
    expect((await t.api().post('/api/v1/music/tracks/1/play')).status).toBe(401);
    const nf = await t.api().post('/api/v1/music/tracks/999/play').set(bearer(access_token));
    expect(nf.status).toBe(404);
    expect(nf.body.code).toBe('TRACK_NOT_FOUND');
    expectMatchesSpec(await t.api().get('/api/v1/music/tracks/2'), 'getTrack');
  });
});

describe('YouTube rejimi (YOUTUBE_API_KEY təyin olunub)', () => {
  function youtubeApp(fail = false) {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      if (fail) return new Response('quota', { status: 403 });
      const body = url.includes('/search?')
        ? { items: [{ id: { videoId: 'AAAAAAAAAAA' } }, { id: { videoId: '_0tlQUW5X0U' } }] }
        : {
            items: [
              { id: 'AAAAAAAAAAA', snippet: { title: 'Mugham &amp; Jazz', channelTitle: 'Baku Live' }, contentDetails: { duration: 'PT4M5S' } },
              { id: '_0tlQUW5X0U', snippet: { title: 'Running Scared', channelTitle: 'Eurovision' }, contentDetails: { duration: 'PT3M3S' } },
            ],
          };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    return { ...createTestApp({ config: { youtubeApiKey: 'test-key', fetch: fakeFetch } }), calls };
  }

  it('nəticələr tracks-ə cache olunur (mövcud youtube_id təkrarlanmır), source=youtube', async () => {
    const t = youtubeApp();
    const res = await t.api().get('/api/v1/music/search?q=mugham');
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'searchMusic');
    expect(res.body.source).toBe('youtube');
    expect(res.body.items.map((x: { title: string; durationSec: number }) => [x.title, x.durationSec])).toEqual([
      ['Mugham & Jazz', 245],
      ['Running Scared', 183], // artıq DB-də idi — seed məlumatı saxlanılır
    ]);
    expect(t.calls[0]).toContain('key=test-key');
    expect(t.db.prepare(`SELECT COUNT(*) FROM tracks`).pluck().get()).toBe(31);
    await t.api().get('/api/v1/music/search?q=mugham');
    expect(t.db.prepare(`SELECT COUNT(*) FROM tracks`).pluck().get()).toBe(31);
    // q olmadan — həmişə DB
    expect((await t.api().get('/api/v1/music/search?genre=Pop')).body.source).toBe('db');
  });

  it('YouTube xətası → 502 BAD_GATEWAY', async () => {
    const t = youtubeApp(true);
    const res = await t.api().get('/api/v1/music/search?q=mugham');
    expect(res.status).toBe(502);
    expectMatchesSpec(res, 'searchMusic');
  });
});

describe('playlists', () => {
  let t: ReturnType<typeof createTestApp>;
  let student: string;
  let rauf: string;
  beforeEach(async () => {
    t = createTestApp();
    student = (await t.login('student')).access_token;
    rauf = (await t.login('rauf')).access_token;
  });

  it('yarat → trek əlavə et (sona və araya) → çıxar (sıra yenidən nömrələnir)', async () => {
    const created = await t.api().post('/api/v1/music/playlists').set(bearer(student)).send({ name: 'Səhər qaçışı' });
    expect(created.status).toBe(201);
    expectMatchesSpec(created, 'createPlaylist');
    const id = created.body.id;
    expect(created.headers.location).toBe(`/api/v1/music/playlists/${id}`);

    await t.api().post(`/api/v1/music/playlists/${id}/tracks`).set(bearer(student)).send({ trackId: 24 });
    await t.api().post(`/api/v1/music/playlists/${id}/tracks`).set(bearer(student)).send({ trackId: 20 });
    const inserted = await t.api().post(`/api/v1/music/playlists/${id}/tracks`).set(bearer(student)).send({ trackId: 1, position: 1 });
    expect(inserted.status).toBe(201);
    expectMatchesSpec(inserted, 'addPlaylistTrack');
    expect(inserted.body.tracks.map((x: { position: number; track: { id: number } }) => [x.position, x.track.id])).toEqual([[1, 1], [2, 24], [3, 20]]);

    const removed = await t.api().delete(`/api/v1/music/playlists/${id}/tracks/24`).set(bearer(student));
    expect(removed.status).toBe(204);
    const after = await t.api().get(`/api/v1/music/playlists/${id}`).set(bearer(student));
    expectMatchesSpec(after, 'getPlaylist');
    expect(after.body.tracks.map((x: { position: number; track: { id: number } }) => [x.position, x.track.id])).toEqual([[1, 1], [2, 20]]);
    const mine = await t.api().get('/api/v1/music/playlists').set(bearer(student));
    expectMatchesSpec(mine, 'listPlaylists');
    expect(mine.body.items).toHaveLength(3);
  });

  it('error path-lər: təkrar trek 409 (sıra dəyişmir), başqasının playlist-i 403, playlist-də olmayan trek 404, boş ad 422', async () => {
    const dup = await t.api().post('/api/v1/music/playlists/1/tracks').set(bearer(student)).send({ trackId: 1, position: 1 });
    expect(dup.status).toBe(409);
    expectMatchesSpec(dup, 'addPlaylistTrack');
    expect(dup.body.code).toBe('TRACK_ALREADY_IN_PLAYLIST');
    expect(t.db.prepare(`SELECT track_id FROM playlist_tracks WHERE playlist_id = 1 ORDER BY position`).pluck().all()).toEqual([1, 2, 3, 4, 5]);

    expect((await t.api().get('/api/v1/music/playlists/1').set(bearer(rauf))).status).toBe(403);
    expect((await t.api().post('/api/v1/music/playlists/1/tracks').set(bearer(rauf)).send({ trackId: 9 })).status).toBe(403);
    const notIn = await t.api().delete('/api/v1/music/playlists/1/tracks/30').set(bearer(student));
    expect(notIn.status).toBe(404);
    expect(notIn.body.code).toBe('TRACK_NOT_IN_PLAYLIST');
    expect((await t.api().post('/api/v1/music/playlists').set(bearer(student)).send({ name: '' })).status).toBe(422);
    expect((await t.api().get('/api/v1/music/playlists/999').set(bearer(student))).status).toBe(404);
  });
});
