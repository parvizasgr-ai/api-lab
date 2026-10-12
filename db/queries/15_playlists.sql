-- 15. Playlist-lər və trekləri sırası ilə (3 cədvəl JOIN)
SELECT p.id AS playlist_id, u.username, p.name AS playlist, pt.position, t.artist, t.title
FROM playlists p
JOIN users u            ON u.id = p.user_id
JOIN playlist_tracks pt ON pt.playlist_id = p.id
JOIN tracks t           ON t.id = pt.track_id
ORDER BY p.id, pt.position;
