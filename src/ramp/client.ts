import { createRampClient, createZecSendStore } from "@0xramp/sdk";

import { RAMP_API_BASE_URL, RAMP_LOCALE, RAMP_PARTNER_ID } from "@/ramp/config";
import { journalStorage } from "@/ramp/storage";

export const sendStore = createZecSendStore(journalStorage);

export const ramp = createRampClient({
  environment: "staging",
  partnerId: RAMP_PARTNER_ID,
  apiBaseUrl: RAMP_API_BASE_URL,
  locale: RAMP_LOCALE,
  sendStore,
});
