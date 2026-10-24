// Aviabilet endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { FlightsService } from './service.js';

export function flightsHandlers(ctx: AppContext): Handlers {
  const flights = new FlightsService(ctx);
  return {
    listAirports: async (req, res) => res.json(await flights.airports(req.valid.query.q)),
    searchFlights: async (req, res) => res.json(await flights.search(req.valid.query as any)),
    getFlight: async (req, res) => res.json(await flights.getFlight(req.valid.params.flightId)),
    listFlightBookings: async (req, res) => res.json(await flights.listBookings(req.auth!, req.valid.query.status)),
    createFlightBooking: async (req, res) => {
      const booking = await flights.book(req, req.valid.body);
      res.status(201).location(`/api/v1/flights/bookings/${booking.id}`).json(booking);
    },
    getFlightBooking: async (req, res) => res.json(await flights.getBooking(req.auth!, req.valid.params.bookingId)),
    cancelFlightBooking: async (req, res) => res.json(await flights.cancel(req, req.valid.params.bookingId)),
  };
}
