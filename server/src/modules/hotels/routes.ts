// Otel endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { HotelsService } from './service.js';

export function hotelsHandlers(ctx: AppContext): Handlers {
  const hotels = new HotelsService(ctx);
  return {
    searchHotels: (req, res) => res.json(hotels.search(req.valid.query as any)),
    getHotel: (req, res) => res.json(hotels.getHotel(req.valid.params.hotelId)),
    listHotelRooms: (req, res) => res.json(hotels.rooms(req.valid.params.hotelId, req.valid.query.checkIn, req.valid.query.checkOut)),
    listHotelBookings: (req, res) => res.json(hotels.listBookings(req.auth!)),
    createHotelBooking: (req, res) => {
      const booking = hotels.book(req, req.valid.body);
      res.status(201).location(`/api/v1/hotels/bookings/${booking.id}`).json(booking);
    },
    getHotelBooking: (req, res) => res.json(hotels.getBooking(req.auth!, req.valid.params.bookingId)),
    updateHotelBooking: (req, res) => res.json(hotels.update(req, req.valid.params.bookingId, req.valid.body)),
    cancelHotelBooking: (req, res) => res.json(hotels.cancel(req, req.valid.params.bookingId)),
  };
}
