-- 05. Bütün kartların icmalı (VIEW) — status üzrə say (GROUP BY)
SELECT owner, status, COUNT(*) AS cards, GROUP_CONCAT(masked_number, ', ') AS numbers
FROM v_card_overview
GROUP BY owner, status
ORDER BY owner, status;
