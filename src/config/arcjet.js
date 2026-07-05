import arcjet, { shield, detectBot, tokenBucket } from "@arcjet/node";
import { config } from "./config.js";

let aj;

if (config.arcjet.key) {
  aj = arcjet({
    key: config.arcjet.key,
    rules: [
      shield({ mode: "DRY_RUN" }),
      detectBot({
        mode: "DRY_RUN",
        allow: [
          "CATEGORY:SEARCH_ENGINE",
        ],
      }),
      tokenBucket({
        mode: "DRY_RUN",
        refillRate: 5,
        interval: 10,
        capacity: 10,
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