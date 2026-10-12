-- 18. Audit jurnalı: istifadəçi üzrə hərəkətlərin sayı (GROUP BY) — trigger-lərin yazdıqları daxil
SELECT u.username, a.action, COUNT(*) AS events, MAX(a.created_at) AS last_event
FROM audit_log a
LEFT JOIN users u ON u.id = a.user_id
GROUP BY u.username, a.action
ORDER BY u.username, events DESC;
