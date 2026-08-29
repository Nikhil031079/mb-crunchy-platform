import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { razorpayWebhook } from "./razorpayWebhook";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/razorpay/webhook",
  method: "POST",
  handler: razorpayWebhook,
});

export default http;
