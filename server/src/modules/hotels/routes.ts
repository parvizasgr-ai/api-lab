// Otel endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { HotelsService } from './service.js';
import { TOPICS } from '../../infra/index.js';
import { hotelReviewsHandlers } from './reviews.js';

type Booking = Awaited<ReturnType<HotelsService['book']>>;
const summary = (b: Booking) => `${b.hotelName}, ${b.checkIn} → ${b.checkOut} (${b.nights} gecə)`;

export function hotelsHandlers(ctx: AppContext): Handlers {
  const hotels = new HotelsService(ctx);
  return {
    searchHotels: async (req, res) => res.json(await hotels.search(req.valid.query as any)),
    getHotel: async (req, res) => res.json(await hotels.getHotel(req.valid.params.hotelId)),
    listHotelRooms: async (req, res) => res.json(await hotels.rooms(req.valid.params.hotelId, req.valid.query.checkIn, req.valid.query.checkOut)),
    listHotelBookings: async (req, res) => res.json(await hotels.listBookings(req.auth!)),
    createHotelBooking: async (req, res) => {
      const booking = await hotels.book(req, req.valid.body);
      ctx.infra.publish(TOPICS.bookings, 'booking.created', req.auth!.userId, { kind: 'HOTEL', bookingId: booking.id, hotelId: booking.hotelId, summary: summary(booking), total: booking.total, currency: booking.currency });
      res.status(201).location(`/api/v1/hotels/bookings/${booking.id}`).json(booking);
    },
    getHotelBooking: async (req, res) => res.json(await hotels.getBooking(req.auth!, req.valid.params.bookingId)),
    updateHotelBooking: async (req, res) => {
      const booking = await hotels.update(req, req.valid.params.bookingId, req.valid.body);
      ctx.infra.publish(TOPICS.bookings, 'booking.updated', req.auth!.userId, { kind: 'HOTEL', bookingId: booking.id, hotelId: booking.hotelId, summary: summary(booking) });
      res.json(booking);
    },
    cancelHotelBooking: async (req, res) => {
      const booking = await hotels.cancel(req, req.valid.params.bookingId);
      ctx.infra.publish(TOPICS.bookings, 'booking.cancelled', req.auth!.userId, { kind: 'HOTEL', bookingId: booking.id, hotelId: booking.hotelId, summary: summary(booking) });
      res.json(booking);
    },
    ...hotelReviewsHandlers(ctx),
  };
}
