import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { razorpayWebhook } from "./razorpayWebhook";
import { shiprocketWebhook } from "./courier/shiprocketWebhook";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/razorpay/webhook",
  method: "POST",
  handler: razorpayWebhook,
});

http.route({
  path: "/shiprocket/webhook",
  method: "POST",
  handler: shiprocketWebhook,
});

export default http;
