// Auth service: JWT (access token) + refresh token rotation + API key + Basic.
//   * Access token — JWT HS256, 15 dəq, stateless (DB-yə baxmadan yoxlanılır).
//   * Refresh token — təsadüfi string, DB-də yalnız SHA-256 hash-i, 7 gün. Hər istifadədə yenisi verilir (rotation).
//   * Ləğv edilmiş refresh token yenidən gəlirsə → oğurlanma şübhəsi: istifadəçinin BÜTÜN refresh token-ləri ləğv olunur.
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { DB } from '../../db.js';
import type { Config } from '../../config.js';
import { ApiError } from '../../errors.js';
import { isoAfter, isoNow, randomToken, sha256, verifyPassword } from '../../lib/crypto.js';
import type { AuthContext } from '../../types.js';
import { authRepo, type UserRow } from './repo.js';

export interface TokenPair {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export class AuthService {
  private secret: Uint8Array;

  constructor(
    private db: DB,
    private config: Config,
  ) {
    this.secret = new TextEncoder().encode(config.jwtSecret);
  }

  verifyCredentials(username: string, password: string): UserRow | undefined {
    const user = authRepo.findUserByUsername(this.db, username);
    return user && verifyPassword(password, user.password_hash) ? user : undefined;
  }

  async issueAccessToken(
    user: Pick<UserRow, 'id' | 'username' | 'role'>,
    scopes: string[],
    options: { ttlSec?: number; now?: Date } = {},
  ): Promise<string> {
    const iat = Math.floor((options.now ?? this.config.now()).getTime() / 1000);
    return new SignJWT({ username: user.username, role: user.role, scope: scopes.join(' ') })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(user.id))
      .setIssuer(this.config.jwtIssuer)
      .setIssuedAt(iat)
      .setExpirationTime(iat + (options.ttlSec ?? this.config.accessTokenTtlSec))
      .sign(this.secret);
  }

  // Xəta mesajı: 'TOKEN_EXPIRED' və ya 'INVALID_TOKEN' (middleware HTTP 401-ə çevirir).
  async verifyAccessToken(token: string): Promise<AuthContext> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: this.config.jwtIssuer,
        currentDate: this.config.now(),
      });
      return {
        userId: Number(payload.sub),
        username: String(payload.username),
        role: payload.role === 'ADMIN' ? 'ADMIN' : 'USER',
        scopes: String(payload.scope ?? '').split(' ').filter(Boolean),
        via: 'bearer',
      };
    } catch (err) {
      throw new Error(err instanceof joseErrors.JWTExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN', { cause: err });
    }
  }

  findActiveApiKey(plainKey: string) {
    return authRepo.findActiveApiKey(this.db, sha256(plainKey));
  }

  private async issueTokenPair(user: UserRow): Promise<TokenPair> {
    const now = this.config.now();
    const scopes = authRepo.scopesOf(this.db, user.id);
    const refresh = randomToken('rt');
    authRepo.insertRefreshToken(this.db, user.id, sha256(refresh), isoAfter(now, this.config.refreshTokenTtlSec), isoNow(now));
    return {
      access_token: await this.issueAccessToken(user, scopes),
      token_type: 'Bearer',
      expires_in: this.config.accessTokenTtlSec,
      refresh_token: refresh,
      scope: scopes.join(' '),
    };
  }

  async login(username: string, password: string): Promise<{ user: UserRow; tokens: TokenPair }> {
    const user = this.verifyCredentials(username, password);
    // İstifadəçi yoxdur və ya parol səhvdir — eyni mesaj (user enumeration-un qarşısı alınır).
    if (!user) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Username və ya parol səhvdir');
    return { user, tokens: await this.issueTokenPair(user) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const now = isoNow(this.config.now());
    const row = authRepo.findRefreshToken(this.db, sha256(refreshToken));
    const invalid = new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token etibarsızdır və ya ləğv edilib');
    if (!row) throw invalid;
    if (row.revoked_at) {
      authRepo.revokeAllRefreshTokens(this.db, row.user_id, now); // reuse detection
      throw invalid;
    }
    if (row.expires_at <= now) throw invalid;
    const user = authRepo.findUserById(this.db, row.user_id);
    if (!user) throw invalid;
    // Rotation: köhnə token ləğv olunur, yenisi yazılır (hər ikisi sinxron, ilk await-dan əvvəl).
    authRepo.revokeRefreshToken(this.db, row.id, now);
    return this.issueTokenPair(user);
  }

  logout(userId: number, refreshToken: string): void {
    const row = authRepo.findRefreshToken(this.db, sha256(refreshToken));
    // Logout idempotentdir: token tapılmasa da 204 qaytarırıq.
    if (row && row.user_id === userId) authRepo.revokeRefreshToken(this.db, row.id, isoNow(this.config.now()));
  }

  profile(userId: number) {
    const user = authRepo.findUserById(this.db, userId);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'İstifadəçi tapılmadı');
    return {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      scopes: authRepo.scopesOf(this.db, user.id),
    };
  }
}
