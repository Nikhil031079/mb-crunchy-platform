// ============================================================================
// MB CRUNCHY - Scheduled Jobs
// Registered crons run in the Convex backend on a fixed schedule. All crons
// delegate to internal mutations so the request path never depends on them.
// ============================================================================

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Releases stock reserved by orders abandoned at the payment step before the
// reservation timeout elapses. Runs every 15 minutes; the timeout itself is
// configured via the RESERVATION_TIMEOUT_MINUTES environment variable.
crons.interval(
  "cleanup-expired-reservations",
  { minutes: 15 },
  internal.maintenance.cleanupExpiredReservations,
);

export default crons;
