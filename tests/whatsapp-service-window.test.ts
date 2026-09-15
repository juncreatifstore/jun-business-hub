import { describe, expect, it } from "vitest";
import { opensWhatsAppCustomerServiceWindow } from "../lib/whatsapp-service-window";

describe("WhatsApp customer-service window", () => {
  it.each([
    "text",
    "button",
    "interactive",
    "document",
    "image",
    "video",
    "audio",
    "sticker",
    "location",
    "contacts",
  ])("opens for a usable inbound %s message", (type) => {
    expect(opensWhatsAppCustomerServiceWindow(type)).toBe(true);
  });

  it.each(["unsupported", "system", "reaction", "unknown", ""])("stays closed for a %s event", (type) => {
    expect(opensWhatsAppCustomerServiceWindow(type)).toBe(false);
  });
});
