// Pagination və sort köməkçiləri.
// Sort: client "-price" göndərir, biz onu YALNIZ icazəli sütunlara çeviririk (whitelist) —
// istifadəçi mətni heç vaxt birbaşa SQL-ə yazılmır (SQL injection qorunması).

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export const offsetOf = (page: number, size: number) => (page - 1) * size;

export function pageOf<T>(items: T[], page: number, size: number, total: number): Page<T> {
  return { items, page, size, total, totalPages: Math.ceil(total / size) };
}

export function orderBy(sort: string, columns: Record<string, string>, tieBreaker = 'id'): string {
  const desc = sort.startsWith('-');
  const column = columns[desc ? sort.slice(1) : sort];
  if (!column) throw new Error(`Naməlum sort sahəsi: ${sort}`); // validation buna imkan vermir
  return `${column} ${desc ? 'DESC' : 'ASC'}, ${tieBreaker} ${desc ? 'DESC' : 'ASC'}`;
}
