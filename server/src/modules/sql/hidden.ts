// Playground-da dəyəri gizli olan sütunlar (hash-lər və sirlər).
export const HIDDEN_COLUMNS = [
  { table: 'users', column: 'password_hash' },
  { table: 'refresh_tokens', column: 'token_hash' },
  { table: 'api_keys', column: 'key_hash' },
  { table: 'oauth_clients', column: 'client_secret_hash' },
  { table: 'oauth_codes', column: 'code' }, // 60 saniyəlik birdəfəlik sirr
];

export const isHidden = (table: string, column: string) => HIDDEN_COLUMNS.some((h) => h.table === table && h.column === column);
