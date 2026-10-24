// Otel endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { HotelsService } from './service.js';

export function hotelsHandlers(ctx: AppContext): Handlers {
  const hotels = new HotelsService(ctx);
  return {
    searchHotels: async (req, res) => res.json(await hotels.search(req.valid.query as any)),
    getHotel: async (req, res) => res.json(await hotels.getHotel(req.valid.params.hotelId)),
    listHotelRooms: async (req, res) => res.json(await hotels.rooms(req.valid.params.hotelId, req.valid.query.checkIn, req.valid.query.checkOut)),
    listHotelBookings: async (req, res) => res.json(await hotels.listBookings(req.auth!)),
    createHotelBooking: async (req, res) => {
      const booking = await hotels.book(req, req.valid.body);
      res.status(201).location(`/api/v1/hotels/bookings/${booking.id}`).json(booking);
    },
    getHotelBooking: async (req, res) => res.json(await hotels.getBooking(req.auth!, req.valid.params.bookingId)),
    updateHotelBooking: async (req, res) => res.json(await hotels.update(req, req.valid.params.bookingId, req.valid.body)),
    cancelHotelBooking: async (req, res) => res.json(await hotels.cancel(req, req.valid.params.bookingId)),
  };
}
