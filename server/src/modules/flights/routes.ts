// Aviabilet endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { FlightsService } from './service.js';

export function flightsHandlers(ctx: AppContext): Handlers {
  const flights = new FlightsService(ctx);
  return {
    listAirports: (req, res) => res.json(flights.airports(req.valid.query.q)),
    searchFlights: (req, res) => res.json(flights.search(req.valid.query as any)),
    getFlight: (req, res) => res.json(flights.getFlight(req.valid.params.flightId)),
    listFlightBookings: (req, res) => res.json(flights.listBookings(req.auth!, req.valid.query.status)),
    createFlightBooking: (req, res) => {
      const booking = flights.book(req, req.valid.body);
      res.status(201).location(`/api/v1/flights/bookings/${booking.id}`).json(booking);
    },
    getFlightBooking: (req, res) => res.json(flights.getBooking(req.auth!, req.valid.params.bookingId)),
    cancelFlightBooking: (req, res) => res.json(flights.cancel(req, req.valid.params.bookingId)),
  };
}
