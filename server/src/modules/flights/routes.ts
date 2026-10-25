// Aviabilet endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { FlightsService } from './service.js';
import { TOPICS } from '../../infra/index.js';

type Booking = Awaited<ReturnType<FlightsService['book']>>;
const summary = (b: Booking) => `${b.flightNo} ${b.route}, ${b.passengers.length} sərnişin, ${b.total.toFixed(2)} ${b.currency}`;

export function flightsHandlers(ctx: AppContext): Handlers {
  const flights = new FlightsService(ctx);
  return {
    listAirports: async (req, res) => res.json(await flights.airports(req.valid.query.q)),
    // Keş (cache-aside): eyni axtarış 30 san ərzində Redis-dən gəlir. Açar — normallaşdırılmış query (parametr sırası fərq etmir).
    searchFlights: async (req, res) => {
      const query = req.valid.query as Record<string, unknown>;
      const normalized = Object.keys(query).sort().filter((k) => query[k] !== undefined).map((k) => `${k}=${String(query[k])}`).join('&');
      const key = `cache:flights:search:${normalized}`;
      const { value, hit } = await ctx.infra.redis.cached(key, ctx.config.infra.cacheTtlSec.flights, () => flights.search(query as any));
      res.set({ 'X-Cache': hit ? 'HIT' : 'MISS', 'X-Cache-Key': key }).json(value);
    },
    getFlight: async (req, res) => res.json(await flights.getFlight(req.valid.params.flightId)),
    listFlightBookings: async (req, res) => res.json(await flights.listBookings(req.auth!, req.valid.query.status)),
    createFlightBooking: async (req, res) => {
      const booking = await flights.book(req, req.valid.body);
      ctx.infra.redis.delPattern('cache:flights:*'); // seatsLeft dəyişdi → köhnə axtarış nəticələri etibarsızdır (cache invalidation)
      ctx.infra.publish(TOPICS.bookings, 'booking.created', req.auth!.userId, { kind: 'FLIGHT', bookingId: booking.id, summary: summary(booking), total: booking.total, currency: booking.currency });
      res.status(201).location(`/api/v1/flights/bookings/${booking.id}`).json(booking);
    },
    getFlightBooking: async (req, res) => res.json(await flights.getBooking(req.auth!, req.valid.params.bookingId)),
    cancelFlightBooking: async (req, res) => {
      const booking = await flights.cancel(req, req.valid.params.bookingId);
      ctx.infra.redis.delPattern('cache:flights:*');
      ctx.infra.publish(TOPICS.bookings, 'booking.cancelled', req.auth!.userId, { kind: 'FLIGHT', bookingId: booking.id, summary: summary(booking) });
      res.json(booking);
    },
  };
}
