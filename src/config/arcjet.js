import arcjet, { shield, detectBot, tokenBucket } from "@arcjet/node";
import { config } from "./config.js";

let aj;

if (config.arcjet.key) {
  aj = arcjet({
    key: config.arcjet.key,
    rules: [
      shield({ mode: "LIVE" }),
      detectBot({
        mode: "LIVE",
        allow: [
          "CATEGORY:SEARCH_ENGINE",
        ],
      }),
      tokenBucket({
        mode: "LIVE",
        refillRate: 60,
        interval: 60,
        capacity: 120,
      }),
    ],
  });
} else {
  console.warn("Arcjet key is missing. Arcjet security rules will be bypassed.");
  aj = {
    protect: async () => ({
      isDenied: () => false,
      reason: {
        isRateLimit: () => false,
        isBot: () => false,
      },
      ip: {
        isHosting: () => false,
      },
      results: [],
    }),
  };
}

export default aj;