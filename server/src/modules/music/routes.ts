// Musiqi endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { MusicService, toTrack } from './service.js';

export function musicHandlers(ctx: AppContext): Handlers {
  const music = new MusicService(ctx);
  return {
    searchMusic: async (req, res) => res.json(await music.search(req.valid.query as any)),
    getTrack: (req, res) => res.json(toTrack(music.getTrack(req.valid.params.trackId))),
    playTrack: (req, res) => res.json(music.play(req.auth!, req.valid.params.trackId)),
    listPlaylists: (req, res) => res.json(music.playlists(req.auth!)),
    createPlaylist: (req, res) => {
      const playlist = music.createPlaylist(req.auth!, req.valid.body.name);
      res.status(201).location(`/api/v1/music/playlists/${playlist.id}`).json(playlist);
    },
    getPlaylist: (req, res) => res.json(music.getPlaylist(req.auth!, req.valid.params.playlistId)),
    addPlaylistTrack: (req, res) => {
      const playlist = music.addTrack(req, req.valid.params.playlistId, req.valid.body);
      res.status(201).location(`/api/v1/music/playlists/${playlist.id}`).json(playlist);
    },
    removePlaylistTrack: (req, res) => {
      music.removeTrack(req, req.valid.params.playlistId, req.valid.params.trackId);
      res.status(204).end();
    },
  };
}
