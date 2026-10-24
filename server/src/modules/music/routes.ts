// Musiqi endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { MusicService, toTrack } from './service.js';

export function musicHandlers(ctx: AppContext): Handlers {
  const music = new MusicService(ctx);
  return {
    searchMusic: async (req, res) => res.json(await music.search(req.valid.query as any)),
    getTrack: async (req, res) => res.json(toTrack(await music.getTrack(req.valid.params.trackId))),
    playTrack: async (req, res) => res.json(await music.play(req.auth!, req.valid.params.trackId)),
    listPlaylists: async (req, res) => res.json(await music.playlists(req.auth!)),
    createPlaylist: async (req, res) => {
      const playlist = await music.createPlaylist(req.auth!, req.valid.body.name);
      res.status(201).location(`/api/v1/music/playlists/${playlist.id}`).json(playlist);
    },
    getPlaylist: async (req, res) => res.json(await music.getPlaylist(req.auth!, req.valid.params.playlistId)),
    addPlaylistTrack: async (req, res) => {
      const playlist = await music.addTrack(req, req.valid.params.playlistId, req.valid.body);
      res.status(201).location(`/api/v1/music/playlists/${playlist.id}`).json(playlist);
    },
    removePlaylistTrack: async (req, res) => {
      await music.removeTrack(req, req.valid.params.playlistId, req.valid.params.trackId);
      res.status(204).end();
    },
  };
}
