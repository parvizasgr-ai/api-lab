// Mock "Google ilə daxil ol" razılıq səhifəsi (server-side HTML, JS yoxdur).
const SCOPE_LABELS: Record<string, string> = {
  openid: 'Sizi tanımaq (istifadəçi ID-si)',
  profile: 'Adınız və profil şəkliniz',
  email: 'Email ünvanınız',
  'accounts:read': 'Bank hesablarınızı oxumaq',
  'cards:read': 'Kartlarınızı oxumaq',
  'cards:write': 'Kartlarınızı bloklamaq / açmaq',
  'transfers:write': 'Köçürmə etmək',
  'bookings:read': 'Bronlarınızı oxumaq',
  'bookings:write': 'Bron etmək',
  'books:write': 'Kitablara rəy yazmaq',
  'music:write': 'Playlist və dinləmə tarixçəsi',
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface ConsentPageInput {
  clientId: string;
  clientName: string;
  redirectUri: string;
  scope: string;
  state: string;
  users: { username: string; full_name: string; email: string }[];
  selected?: string;
  error?: string;
}

export function renderConsentPage(p: ConsentPageInput): string {
  const scopes = p.scope.split(' ').filter(Boolean);
  const accounts = p.users
    .map(
      (u, i) => `
      <label class="account">
        <input type="radio" name="username" value="${esc(u.username)}" ${(p.selected ? p.selected === u.username : i === 0) ? 'checked' : ''}>
        <span class="avatar">${esc(u.full_name.charAt(0))}</span>
        <span><b>${esc(u.full_name)}</b><br><small>${esc(u.email)}</small></span>
      </label>`,
    )
    .join('');
  return `<!doctype html>
<html lang="az">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Google ilə daxil ol (mock)</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f1f3f4; margin: 0; padding: 24px 16px; color: #202124; }
  main { max-width: 440px; margin: 0 auto; background: #fff; border: 1px solid #dadce0; border-radius: 8px; padding: 32px 28px; }
  .logo { font-size: 22px; font-weight: 600; letter-spacing: -0.5px; }
  .logo span:nth-child(1){color:#4285f4} .logo span:nth-child(2){color:#ea4335} .logo span:nth-child(3){color:#fbbc05}
  .logo span:nth-child(4){color:#4285f4} .logo span:nth-child(5){color:#34a853} .logo span:nth-child(6){color:#ea4335}
  .mock { display: inline-block; font-size: 11px; background: #fef7e0; color: #8a6d00; border-radius: 4px; padding: 2px 6px; margin-left: 6px; }
  h1 { font-size: 20px; font-weight: 500; margin: 16px 0 4px; }
  .account { display: flex; gap: 12px; align-items: center; border: 1px solid #dadce0; border-radius: 6px; padding: 10px 12px; margin: 8px 0; cursor: pointer; }
  .avatar { width: 32px; height: 32px; border-radius: 50%; background: #1a73e8; color: #fff; display: grid; place-items: center; font-weight: 600; }
  ul { padding-left: 20px; } li { margin: 4px 0; }
  input[type=password] { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #dadce0; border-radius: 4px; font-size: 15px; }
  .error { background: #fce8e6; color: #c5221f; padding: 8px 12px; border-radius: 4px; }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
  button { border: 0; border-radius: 4px; padding: 10px 20px; font-size: 14px; cursor: pointer; }
  .allow { background: #1a73e8; color: #fff; } .deny { background: transparent; color: #1a73e8; }
  code { background: #f1f3f4; padding: 1px 4px; border-radius: 3px; font-size: 12px; word-break: break-all; }
  small { color: #5f6368; }
</style>
</head>
<body>
<main>
  <div class="logo"><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span><span class="mock">MOCK</span></div>
  <h1>Hesab seçin</h1>
  <p><b>${esc(p.clientName)}</b> tətbiqinə davam etmək üçün</p>
  ${p.error ? `<p class="error">${esc(p.error)}</p>` : ''}
  <form method="post" action="/oauth/authorize">
    <input type="hidden" name="client_id" value="${esc(p.clientId)}">
    <input type="hidden" name="redirect_uri" value="${esc(p.redirectUri)}">
    <input type="hidden" name="scope" value="${esc(p.scope)}">
    <input type="hidden" name="state" value="${esc(p.state)}">
    ${accounts}
    <p><label>Parol<br><input type="password" name="password" autocomplete="current-password"></label></p>
    <p>Bu tətbiq aşağıdakılara giriş istəyir:</p>
    <ul>${scopes.map((s) => `<li>${esc(SCOPE_LABELS[s] ?? s)} <small>(${esc(s)})</small></li>`).join('')}</ul>
    <p><small>Razılıqdan sonra yönləndiriləcəksiniz: <code>${esc(p.redirectUri)}</code></small></p>
    <div class="buttons">
      <button class="deny" name="decision" value="deny">İmtina</button>
      <button class="allow" name="decision" value="allow">İcazə ver</button>
    </div>
  </form>
</main>
</body>
</html>`;
}
