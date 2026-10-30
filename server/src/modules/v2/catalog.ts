// Callbox API v2 — açıq (auth-suz) endpoint-lər: valyuta, aviareys, otel, kitab + OpenID Connect token endpoint-i.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { ApiError, conflict, notFound, OAuthError } from '../../errors.js';
import { isoNow } from '../../lib/crypto.js';
import { addDays, ageOn, daysBetween, invalid, list, money, randomCode, today } from './shared.js';

const round = (n: number, digits: number) => Number(n.toFixed(digits));

// Aviaşirkətin bilet nömrəsi prefiksi (IATA "airline accounting code")
const TICKET_PREFIX: Record<string, string> = { J2: '771', TK: '235', PC: '624', FZ: '141', LH: '220' };
const CHILD_PRICE_PERCENT = 75;
const MAX_NIGHTS = 30;

interface FlightRow {
  id: number; flight_no: string; airline_code: string; airline_name: string; from_code: string; to_code: string; depart_at: string;
  arrive_at: string; duration_min: number; stops: number; price_minor: number; currency: string; seats_left: number;
  from_city: string; from_name: string; to_city: string; to_name: string;
}
const FLIGHT_SELECT = `
  SELECT f.*, a1.city AS from_city, a1.name AS from_name, a2.city AS to_city, a2.name AS to_name
  FROM flights f JOIN airports a1 ON a1.code = f.from_code JOIN airports a2 ON a2.code = f.to_code`;

const toOffer = (f: FlightRow, adults: number, children: number) => {
  const child = Math.round((f.price_minor * CHILD_PRICE_PERCENT) / 100);
  return {
    id: f.id,
    object: 'flight_offer' as const,
    flightNumber: f.flight_no,
    airline: { iataCode: f.airline_code, name: f.airline_name },
    origin: { iataCode: f.from_code, city: f.from_city, name: f.from_name },
    destination: { iataCode: f.to_code, city: f.to_city, name: f.to_name },
    departureTime: f.depart_at,
    arrivalTime: f.arrive_at,
    durationMinutes: f.duration_min,
    stops: f.stops,
    seatsAvailable: f.seats_left,
    price: { currency: f.currency, adult: money(f.price_minor), child: money(child), total: money(f.price_minor * adults + child * children) },
  };
};

export function v2CatalogHandlers({ db, config, auth }: AppContext): Handlers {
  const now = () => config.now();

  const currencyCodes = async () => new Set((await db.prepare(`SELECT code FROM currencies`).pluck().all()) as string[]);

  return {
    // ---------------------------------------------------------------- OpenID Connect token endpoint (Keycloak üslubu)
    v2Token: async (req, res) => {
      const form = req.valid.body as { grant_type: string; client_id: string; username?: string; password?: string; refresh_token?: string; scope?: string };
      if (form.client_id !== config.publicClientId) throw new OAuthError(401, 'invalid_client', `Naməlum client_id: ${form.client_id}`);
      let tokens;
      try {
        if (form.grant_type === 'password') {
          if (!form.username || !form.password) throw new OAuthError(400, 'invalid_request', 'password grant üçün username və password məcburidir');
          tokens = (await auth.login(form.username, form.password)).tokens;
        } else if (form.grant_type === 'refresh_token') {
          if (!form.refresh_token) throw new OAuthError(400, 'invalid_request', 'refresh_token grant üçün refresh_token məcburidir');
          tokens = await auth.refresh(form.refresh_token);
        } else {
          throw new OAuthError(400, 'unsupported_grant_type', 'Dəstəklənən grant_type: password, refresh_token');
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') throw new OAuthError(400, 'invalid_grant', 'Invalid user credentials');
        if (err instanceof ApiError && err.code === 'INVALID_REFRESH_TOKEN') throw new OAuthError(400, 'invalid_grant', 'Refresh token etibarsızdır, vaxtı keçib və ya artıq istifadə olunub');
        throw err;
      }
      res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json({
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        refresh_expires_in: config.refreshTokenTtlSec,
        refresh_token: tokens.refresh_token,
        token_type: 'Bearer',
        'not-before-policy': 0,
        scope: tokens.scope,
      });
    },

    // ---------------------------------------------------------------- Currencies
    v2ListCurrencies: async (_req, res) => {
      const rows = (await db.prepare(`SELECT code, name, symbol, numeric_code, minor_units FROM currencies ORDER BY code`).all()) as {
        code: string; name: string; symbol: string; numeric_code: string | null; minor_units: number;
      }[];
      res.json(list('/api/v2/currencies', rows.map((r) => ({ code: r.code, object: 'currency' as const, name: r.name, symbol: r.symbol, numericCode: r.numeric_code, minorUnits: r.minor_units }))));
    },

    v2GetExchangeRates: async (req, res) => {
      const q = req.valid.query as { from: string; to?: string; date?: string; amount?: number };
      const codes = await currencyCodes();
      const targets = q.to ? [...new Set(q.to.split(','))] : [...codes].filter((c) => c !== q.from).sort();
      for (const [field, code] of [['from', q.from], ...targets.map((c) => ['to', c])] as [string, string][]) {
        if (!codes.has(code)) throw invalid('UNSUPPORTED_CURRENCY', `Dəstəklənməyən valyuta: ${code}`, field, `GET /api/v2/currencies siyahısına baxın`);
      }
      if (q.date && q.date > today(now())) throw invalid('INVALID_DATE', 'Gələcək tarix üçün məzənnə yoxdur', 'date');
      // Tələb olunan tarixdə məzənnə yoxdursa (həftəsonu / bayram) — ondan əvvəlki ən yaxın iş gününün məzənnəsi
      const date = (await db
        .prepare(`SELECT MAX(rate_date) FROM exchange_rates WHERE (@date::text IS NULL OR rate_date <= @date)`)
        .pluck()
        .get({ date: q.date ?? null })) as string | null;
      if (!date) throw notFound('RATE_NOT_FOUND', `Bu tarix üçün məzənnə tapılmadı: ${q.date}`);
      const azn = new Map<string, number>([['AZN', 1]]);
      for (const r of (await db.prepare(`SELECT quote, rate FROM exchange_rates WHERE rate_date = ?`).all(date)) as { quote: string; rate: string }[]) {
        azn.set(r.quote, Number(r.rate));
      }
      const rates: Record<string, number> = {};
      for (const code of targets) {
        if (code === q.from) rates[code] = 1;
        else if (azn.has(q.from) && azn.has(code)) rates[code] = round(azn.get(code)! / azn.get(q.from)!, 6);
        else throw notFound('RATE_NOT_FOUND', `${q.from}/${code} üçün ${date} tarixində məzənnə yoxdur`);
      }
      res.json({
        object: 'exchange_rate',
        base: q.from,
        date,
        requestedDate: q.date ?? null,
        source: 'CBAR (simulyasiya)',
        rates,
        ...(q.amount === undefined
          ? {}
          : { amount: q.amount, converted: Object.fromEntries(Object.entries(rates).map(([c, r]) => [c, round(q.amount! * r, 2)])) }),
      });
    },

    // ---------------------------------------------------------------- Flights
    v2ListAirports: async (req, res) => {
      const q = req.valid.query as { search?: string; country?: string };
      const rows = (await db
        .prepare(
          `SELECT * FROM airports
           WHERE (@search::text IS NULL OR code ILIKE @like OR city ILIKE @like OR name ILIKE @like)
             AND (@country::text IS NULL OR country ILIKE @country)
           ORDER BY code`,
        )
        .all({ search: q.search ?? null, like: `%${(q.search ?? '').replace(/[%_\\]/g, '\\$&')}%`, country: q.country ?? null })) as { code: string; city: string; country: string; name: string }[];
      res.json(list('/api/v2/airports', rows.map((a) => ({ iataCode: a.code, object: 'airport' as const, name: a.name, city: a.city, country: a.country }))));
    },

    v2SearchFlights: async (req, res) => {
      const q = req.valid.query as { origin: string; destination: string; departureDate: string; adults: number; children: number; maxStops?: number; sort: string };
      if (q.origin === q.destination) throw invalid('SAME_AIRPORT', 'origin və destination eyni ola bilməz', 'destination');
      if (q.departureDate < today(now())) throw invalid('INVALID_DATE', 'departureDate keçmişdə ola bilməz', 'departureDate');
      const known = new Set((await db.prepare(`SELECT code FROM airports WHERE code IN (?, ?)`).pluck().all(q.origin, q.destination)) as string[]);
      for (const field of ['origin', 'destination'] as const) {
        if (!known.has(q[field])) throw invalid('UNKNOWN_AIRPORT', `Naməlum IATA kodu: ${q[field]}`, field, 'GET /api/v2/airports siyahısına baxın');
      }
      const order = { price: 'f.price_minor, f.depart_at', departure: 'f.depart_at', duration: 'f.duration_min, f.depart_at' }[q.sort] ?? 'f.price_minor';
      const rows = (await db
        .prepare(
          `${FLIGHT_SELECT}
           WHERE f.from_code = @origin AND f.to_code = @destination AND substr(f.depart_at, 1, 10) = @date
             AND f.depart_at > @now AND f.seats_left >= @seats AND (@maxStops::int IS NULL OR f.stops <= @maxStops)
           ORDER BY ${order}, f.id`,
        )
        .all({ origin: q.origin, destination: q.destination, date: q.departureDate, now: isoNow(now()), seats: q.adults + q.children, maxStops: q.maxStops ?? null })) as FlightRow[];
      res.json(list('/api/v2/flights/search', rows.map((f) => toOffer(f, q.adults, q.children))));
    },

    v2CreateFlightBooking: async (req, res) => {
      const b = req.valid.body as {
        flightId: number;
        passengers: { type: 'ADULT' | 'CHILD'; firstName: string; lastName: string; dateOfBirth: string; gender: string; nationality: string; passport: { number: string; expiryDate: string } }[];
        contact: { email: string; phone: string };
      };
      const result = await db.transaction(async () => {
        const flight = (await db.prepare(`${FLIGHT_SELECT} WHERE f.id = ?`).get(b.flightId)) as FlightRow | undefined;
        if (!flight) throw notFound('FLIGHT_NOT_FOUND', `Reys tapılmadı: ${b.flightId}`);
        if (flight.depart_at <= isoNow(now())) throw invalid('FLIGHT_DEPARTED', 'Reys artıq uçub — bron mümkün deyil', 'flightId');
        const departDate = flight.depart_at.slice(0, 10);
        const seen = new Set<string>();
        b.passengers.forEach((p, i) => {
          const age = ageOn(p.dateOfBirth, departDate);
          if (p.dateOfBirth > today(now())) throw invalid('INVALID_DATE', 'Doğum tarixi gələcəkdə ola bilməz', `passengers[${i}].dateOfBirth`);
          if (p.type === 'ADULT' && age < 12) throw invalid('PASSENGER_TYPE_MISMATCH', 'ADULT sərnişin uçuş günü ən azı 12 yaşında olmalıdır', `passengers[${i}].type`, `Yaş: ${age}`);
          if (p.type === 'CHILD' && (age < 2 || age >= 12)) throw invalid('PASSENGER_TYPE_MISMATCH', 'CHILD sərnişin uçuş günü 2–11 yaşında olmalıdır', `passengers[${i}].type`, `Yaş: ${age}`);
          if (p.passport.expiryDate <= departDate) throw invalid('PASSPORT_EXPIRED', 'Pasportun müddəti uçuş tarixinə qədər bitir', `passengers[${i}].passport.expiryDate`);
          if (seen.has(p.passport.number)) throw invalid('DUPLICATE_PASSENGER', 'Eyni pasport nömrəsi iki dəfə göndərilib', `passengers[${i}].passport.number`);
          seen.add(p.passport.number);
        });
        if (!b.passengers.some((p) => p.type === 'ADULT')) throw invalid('ADULT_REQUIRED', 'Uşaq yalnız böyüklə uça bilər — ən azı 1 ADULT lazımdır', 'passengers');
        const n = b.passengers.length;
        // Yer yoxlaması UPDATE-in özündədir (seats_left >= n) — paralel bronlar mənfiyə sala bilməz
        const took = (await db.prepare(`UPDATE flights SET seats_left = seats_left - ? WHERE id = ? AND seats_left >= ?`).run(n, flight.id, n)).changes === 1;
        if (!took) throw conflict('SOLD_OUT', `Bu reysdə kifayət qədər boş yer yoxdur (qalıb: ${flight.seats_left}, lazımdır: ${n})`);
        const adults = b.passengers.filter((p) => p.type === 'ADULT').length;
        const offer = toOffer(flight, adults, n - adults);
        const at = isoNow(now());
        const pnr = randomCode(6);
        const bookingId = (await db
          .prepare(
            `INSERT INTO flight_bookings (flight_id, user_id, passengers, status, total_minor, currency, created_at, updated_at, pnr, contact_email, contact_phone)
             VALUES (?, NULL, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(flight.id, n, Math.round(offer.price.total * 100), flight.currency, at, at, pnr, b.contact.email.toLowerCase(), b.contact.phone)).lastInsertRowid!;
        const passengers = [];
        for (const [i, p] of b.passengers.entries()) {
          const ticketNumber = `${TICKET_PREFIX[flight.airline_code] ?? '999'}-${String(bookingId * 10 + i).padStart(10, '0')}`;
          const masked = `${p.passport.number.slice(0, 1)}****${p.passport.number.slice(-4)}`;
          await db
            .prepare(
              `INSERT INTO flight_passengers (booking_id, first_name, last_name, passport_no_masked, passenger_type, birth_date, nationality, ticket_number)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(bookingId, p.firstName, p.lastName, masked, p.type, p.dateOfBirth, p.nationality, ticketNumber);
          passengers.push({ type: p.type, firstName: p.firstName, lastName: p.lastName, passportNumberMasked: masked, ticketNumber });
        }
        return {
          id: bookingId,
          object: 'flight_booking' as const,
          pnr,
          status: 'CONFIRMED',
          flight: { ...offer, seatsAvailable: flight.seats_left - n },
          passengers,
          contact: { email: b.contact.email.toLowerCase(), phone: b.contact.phone },
          price: { currency: flight.currency, total: offer.price.total },
          createdAt: at,
        };
      }).immediate();
      res.status(201).json(result);
    },

    // ---------------------------------------------------------------- Hotels
    v2SearchHotels: async (req, res) => {
      const q = req.valid.query as { city: string; checkIn: string; checkOut: string; adults: number; minStars?: number; maxPrice?: number; sort: string };
      const nights = checkStay(q.checkIn, q.checkOut, today(now()));
      const hotels = (await db.prepare(`SELECT * FROM hotels WHERE lower(city) = lower(?) AND (?::int IS NULL OR stars >= ?) ORDER BY id`).all(q.city, q.minStars ?? null, q.minStars ?? null)) as {
        id: number; city: string; name: string; stars: number; rating: number; description: string; currency: string;
      }[];
      const amenities = (await db.prepare(`SELECT hotel_id, amenity FROM hotel_amenities ORDER BY amenity`).all()) as { hotel_id: number; amenity: string }[];
      const rooms = (await db
        .prepare(
          `SELECT r.* FROM hotel_rooms r
           WHERE r.capacity >= @adults AND r.hotel_id = ANY(@ids::int[])
             AND NOT EXISTS (SELECT 1 FROM hotel_bookings b WHERE b.room_id = r.id AND b.status = 'CONFIRMED' AND b.check_in < @checkOut AND b.check_out > @checkIn)
           ORDER BY r.price_per_night_minor, r.id`,
        )
        .all({ adults: q.adults, ids: `{${hotels.map((h) => h.id).join(',')}}`, checkIn: q.checkIn, checkOut: q.checkOut })) as {
        id: number; hotel_id: number; room_type: string; capacity: number; price_per_night_minor: number;
      }[];
      const results = hotels
        .map((h) => {
          const offers = rooms
            .filter((r) => r.hotel_id === h.id && (q.maxPrice === undefined || r.price_per_night_minor <= q.maxPrice * 100))
            .map((r) => ({ roomId: r.id, roomType: r.room_type, capacity: r.capacity, pricePerNight: money(r.price_per_night_minor), totalPrice: money(r.price_per_night_minor * nights), currency: h.currency }));
          return {
            hotel: { id: h.id, object: 'hotel' as const, name: h.name, city: h.city, stars: h.stars, rating: h.rating, description: h.description, amenities: amenities.filter((a) => a.hotel_id === h.id).map((a) => a.amenity) },
            checkIn: q.checkIn,
            checkOut: q.checkOut,
            nights,
            lowestTotalPrice: offers.length ? Math.min(...offers.map((o) => o.totalPrice)) : 0,
            currency: h.currency,
            rooms: offers,
          };
        })
        .filter((r) => r.rooms.length > 0)
        .sort((a, b) => (q.sort === 'rating' ? b.hotel.rating - a.hotel.rating : q.sort === 'stars' ? b.hotel.stars - a.hotel.stars : a.lowestTotalPrice - b.lowestTotalPrice) || a.hotel.id - b.hotel.id);
      res.json(list('/api/v2/hotels/search', results));
    },

    v2CreateHotelBooking: async (req, res) => {
      const b = req.valid.body as {
        hotelId: number; roomId: number; checkIn: string; checkOut: string; adults: number; children?: number;
        leadGuest: { firstName: string; lastName: string }; contact: { email: string; phone: string }; specialRequests?: string;
      };
      const nights = checkStay(b.checkIn, b.checkOut, today(now()));
      const result = await db.transaction(async () => {
        const hotel = (await db.prepare(`SELECT id, name, city, stars, currency FROM hotels WHERE id = ?`).get(b.hotelId)) as { id: number; name: string; city: string; stars: number; currency: string } | undefined;
        if (!hotel) throw notFound('HOTEL_NOT_FOUND', `Otel tapılmadı: ${b.hotelId}`);
        const room = (await db.prepare(`SELECT * FROM hotel_rooms WHERE id = ? AND hotel_id = ?`).get(b.roomId, b.hotelId)) as { id: number; room_type: string; capacity: number; price_per_night_minor: number } | undefined;
        if (!room) throw notFound('ROOM_NOT_FOUND', `Bu oteldə ${b.roomId} nömrəli otaq yoxdur`);
        const guests = b.adults + (b.children ?? 0);
        if (guests > room.capacity) throw invalid('ROOM_CAPACITY_EXCEEDED', `Otağın tutumu ${room.capacity} nəfərdir`, 'adults', `Göndərilən: ${guests}`);
        const overlap = await db
          .prepare(`SELECT 1 FROM hotel_bookings WHERE room_id = ? AND status = 'CONFIRMED' AND check_in < ? AND check_out > ? LIMIT 1`)
          .get(room.id, b.checkOut, b.checkIn);
        if (overlap) throw conflict('ROOM_NOT_AVAILABLE', 'Otaq bu tarixlərdə artıq bron olunub');
        const at = isoNow(now());
        const total = room.price_per_night_minor * nights;
        const code = `CBX-${randomCode(8)}`;
        const id = (await db
          .prepare(
            `INSERT INTO hotel_bookings (room_id, user_id, check_in, check_out, guests, status, total_minor, currency, created_at, updated_at,
                                         confirmation_code, guest_name, contact_email, contact_phone, special_requests)
             VALUES (?, NULL, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(room.id, b.checkIn, b.checkOut, guests, total, hotel.currency, at, at, code, `${b.leadGuest.firstName} ${b.leadGuest.lastName}`, b.contact.email.toLowerCase(), b.contact.phone, b.specialRequests ?? null)).lastInsertRowid!;
        return {
          id,
          object: 'hotel_booking' as const,
          confirmationNumber: code,
          status: 'CONFIRMED',
          hotel: { id: hotel.id, name: hotel.name, city: hotel.city, stars: hotel.stars },
          room: { id: room.id, roomType: room.room_type, capacity: room.capacity },
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          nights,
          guests: { adults: b.adults, children: b.children ?? 0 },
          leadGuest: b.leadGuest,
          contact: { email: b.contact.email.toLowerCase(), phone: b.contact.phone },
          specialRequests: b.specialRequests ?? null,
          price: { currency: hotel.currency, perNight: money(room.price_per_night_minor), total: money(total) },
          cancellationPolicy: { freeCancellationUntil: `${addDays(b.checkIn, -1)}T12:00:00Z`, penaltyAfter: money(room.price_per_night_minor) },
          createdAt: at,
        };
      }).immediate();
      res.status(201).json(result);
    },

    // ---------------------------------------------------------------- Books
    v2GetBook: async (req, res) => {
      const bookId = req.valid.params.bookId as number;
      const book = (await db.prepare(`SELECT * FROM books WHERE id = ?`).get(bookId)) as {
        id: number; title: string; author: string; genre: string; year: number | null; description: string; rating: number; pages: number;
      } | undefined;
      if (!book) throw notFound('BOOK_NOT_FOUND', `Kitab tapılmadı: ${bookId}`);
      const stats = (await db.prepare(`SELECT COUNT(*)::int AS count, ROUND(AVG(rating)::numeric, 1) AS avg FROM book_reviews WHERE book_id = ?`).get(bookId)) as { count: number; avg: string | null };
      res.json({
        id: book.id,
        object: 'book',
        title: book.title,
        author: book.author,
        genre: book.genre,
        publishedYear: book.year,
        pages: book.pages,
        description: book.description,
        rating: book.rating,
        reviews: { count: stats.count, averageRating: stats.avg === null ? null : Number(stats.avg), url: `/api/v2/books/${book.id}/reviews` },
      });
    },

    v2ListBookReviews: async (req, res) => {
      const bookId = req.valid.params.bookId as number;
      const q = req.valid.query as { limit: number; startingAfter?: number; sort: string; minRating?: number };
      if (!(await db.prepare(`SELECT 1 FROM books WHERE id = ?`).get(bookId))) throw notFound('BOOK_NOT_FOUND', `Kitab tapılmadı: ${bookId}`);
      const order = { newest: 'r.id DESC', highest: 'r.rating DESC, r.id DESC', lowest: 'r.rating ASC, r.id DESC' }[q.sort] ?? 'r.id DESC';
      const all = (await db
        .prepare(
          `SELECT r.id, r.rating, r.comment, r.created_at, u.username FROM book_reviews r JOIN users u ON u.id = r.user_id
           WHERE r.book_id = @bookId AND (@min::int IS NULL OR r.rating >= @min) ORDER BY ${order}`,
        )
        .all({ bookId, min: q.minRating ?? null })) as { id: number; rating: number; comment: string | null; created_at: string; username: string }[];
      // Cursor: startingAfter — əvvəlki səhifənin son rəyinin id-si
      const start = q.startingAfter === undefined ? 0 : all.findIndex((r) => r.id === q.startingAfter) + 1;
      if (q.startingAfter !== undefined && start === 0) throw invalid('INVALID_CURSOR', `startingAfter=${q.startingAfter} bu siyahıda yoxdur`, 'startingAfter');
      const page = all.slice(start, start + q.limit);
      const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((r) => [String(r), all.filter((x) => x.rating === r).length]));
      res.json({
        ...list(
          `/api/v2/books/${bookId}/reviews`,
          page.map((r) => ({ id: r.id, object: 'book_review' as const, rating: r.rating, comment: r.comment, author: { username: r.username }, createdAt: r.created_at })),
          start + q.limit < all.length,
        ),
        summary: {
          count: all.length,
          averageRating: all.length ? round(all.reduce((n, r) => n + r.rating, 0) / all.length, 1) : null,
          distribution,
        },
      });
    },
  };
}

// Qonaqlama tarixləri: checkIn bu gün və ya sonra, checkOut > checkIn, ən çox 30 gecə
function checkStay(checkIn: string, checkOut: string, todayDate: string): number {
  if (checkIn < todayDate) throw invalid('INVALID_DATES', 'checkIn keçmişdə ola bilməz', 'checkIn');
  const nights = daysBetween(checkIn, checkOut);
  if (nights < 1) throw invalid('INVALID_DATES', 'checkOut checkIn-dən sonra olmalıdır', 'checkOut');
  if (nights > MAX_NIGHTS) throw invalid('INVALID_DATES', `Ən çox ${MAX_NIGHTS} gecə bron etmək olar`, 'checkOut');
  return nights;
}
