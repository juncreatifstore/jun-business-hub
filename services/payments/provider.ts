import "server-only";

/**
 * Payment provider abstraction. V1 ships with MANUAL as the ACTIVE mode:
 * payments are recorded by staff (Zelle, cash, bank transfer…) and go through
 * the human PAYMENT_APPROVE workflow — this is real and production-ready.
 *
 * STRIPE / PAYPAL / MERCADO_PAGO are declared behind the same interface so a
 * checkout integration can be added without touching feature code.
 * STATUS: MANUAL = WORKING · STRIPE/PAYPAL/MERCADO_PAGO = NOT IMPLEMENTED (interface ready).
 */
export type PaymentProviderName = "MANUAL" | "STRIPE" | "PAYPAL" | "MERCADO_PAGO";

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** Whether this provider can create hosted checkout sessions. */
  readonly supportsCheckout: boolean;
  /** Create a hosted checkout for online providers; MANUAL throws by design. */
  createCheckout(input: { amount: number; currency: string; reference: string; clientEmail?: string }): Promise<{ url: string }>;
}

class ManualProvider implements PaymentProvider {
  readonly name = "MANUAL" as const;
  readonly supportsCheckout = false;
  async createCheckout(): Promise<{ url: string }> {
    throw new Error("MANUAL provider has no checkout — record the payment in Finance → Payments");
  }
}

class NotConfiguredProvider implements PaymentProvider {
  readonly supportsCheckout = false;
  constructor(readonly name: PaymentProviderName, private envHint: string) {}
  async createCheckout(): Promise<{ url: string }> {
    throw new Error(`${this.name} is not implemented yet — READY interface, requires ${this.envHint}`);
  }
}

export function paymentProvider(): PaymentProvider {
  switch (process.env.PAYMENT_PROVIDER as PaymentProviderName | undefined) {
    case "STRIPE":
      return new NotConfiguredProvider("STRIPE", "STRIPE_SECRET_KEY + implementation");
    case "PAYPAL":
      return new NotConfiguredProvider("PAYPAL", "PAYPAL_CLIENT_ID/SECRET + implementation");
    case "MERCADO_PAGO":
      return new NotConfiguredProvider("MERCADO_PAGO", "MP_ACCESS_TOKEN + implementation");
    default:
      return new ManualProvider();
  }
}
