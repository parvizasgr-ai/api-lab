-- 14. Ən çox dinlənən treklər (GROUP BY + ORDER BY + LIMIT)
-- POST /api/v1/music/tracks/{id}/play-dən sonra play_count artmalıdır.
SELECT t.id, t.artist, t.title, t.youtube_id,
       COUNT(ph.id)             AS play_count,
       MAX(ph.played_at)        AS last_played
FROM tracks t
JOIN play_history ph ON ph.track_id = t.id
GROUP BY t.id
ORDER BY play_count DESC, last_played DESC
LIMIT 10;
