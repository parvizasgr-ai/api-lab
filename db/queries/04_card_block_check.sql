-- 04. "Kartı bloklamışam, status_history-də görünürmü?" (JOIN + trigger nəticəsi)
-- Dərs 3: POST /api/v1/cards/1/block-dan sonra işlət. Gözlənilən: card_id=1 üçün yeni ACTIVE → BLOCKED sətri.
SELECT c.id AS card_id, c.last4, c.status AS current_status,
       h.old_status, h.new_status, h.reason, u.username AS changed_by, h.changed_at
FROM cards c
LEFT JOIN card_status_history h ON h.card_id = c.id
LEFT JOIN users u ON u.id = h.changed_by
ORDER BY c.id, h.changed_at;
