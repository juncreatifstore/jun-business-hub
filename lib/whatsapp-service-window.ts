export const WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

const WINDOW_OPENING_MESSAGE_TYPES = new Set([
  "audio",
  "button",
  "contacts",
  "document",
  "image",
  "interactive",
  "location",
  "sticker",
  "text",
  "video",
]);

/**
 * Only customer messages delivered with usable content open Meta's 24-hour
 * customer-service window. Unsupported/system events must not enable free text.
 */
export function opensWhatsAppCustomerServiceWindow(type: string | null | undefined) {
  return WINDOW_OPENING_MESSAGE_TYPES.has(
    String(type || "")
      .trim()
      .toLowerCase(),
  );
}
