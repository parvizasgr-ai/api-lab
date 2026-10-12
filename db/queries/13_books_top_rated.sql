-- 13. Kitablar və rəylər (LEFT JOIN + GROUP BY): istifadəçi rəylərinə görə orta bal
SELECT b.id, b.title, b.author, b.genre,
       COUNT(r.id)              AS review_count,
       ROUND(AVG(r.rating), 2)  AS avg_user_rating,
       b.rating                 AS catalog_rating
FROM books b
LEFT JOIN book_reviews r ON r.book_id = b.id
GROUP BY b.id
HAVING COUNT(r.id) > 0
ORDER BY avg_user_rating DESC, review_count DESC;
