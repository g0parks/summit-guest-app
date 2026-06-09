import "server-only";

/**
 * Operator notification seam. Fulfillment is manual: when a guest acts, the
 * operator needs to know. For the MVP this logs a structured line server-side;
 * the function is the drop-in point for email / SMS / Slack later.
 */

export type OperatorEvent =
  | {
      type: "service_requested";
      stayId: string;
      guestName: string;
      property: string;
      serviceName: string;
      requestId: string;
      requestedFor?: string | null;
      notes?: string | null;
    }
  | {
      type: "card_added";
      stayId: string;
      guestName: string;
      brand: string;
      last4: string;
    };

export async function notifyOperator(event: OperatorEvent): Promise<void> {
  // TODO: swap for email/SMS/Slack. Keep the call sites unchanged.
  console.info(`[operator] ${event.type}`, JSON.stringify(event));
}
