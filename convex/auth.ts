// Auth providers: Anonymous (guest) and phone OTP. Add new providers here only with a reviewed plan.

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { phoneOtp } from "./auth/phoneOtp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous, phoneOtp],
});
