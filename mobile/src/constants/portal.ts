/**
 * School Portal + Portal Services (spec §8).
 *
 * The portal is a PLAIN LINK only — no credential storage, no popup, no
 * pre-fill, ever. The WhatsApp number is stored once here and referenced
 * everywhere since it's expected to change.
 */

/** Verified live (HTTP 200) — the double-"t" is intentional upstream. */
export const PORTAL_URL = "https://portal.delsuces.online/Defaultt";

/** Stored once, referenced everywhere. */
export const WHATSAPP_NUMBER = "2347052501821";

export interface PortalServiceAction {
  id: string;
  label: string;
  /** Distinct pre-filled message per action stating exactly what the student needs. */
  message: string;
}

export const PORTAL_SERVICE_ACTIONS: PortalServiceAction[] = [
  {
    id: "course-registration",
    label: "Course Registration",
    message:
      "Hello, I'm a student and I need help with my Course Registration on the school portal. Please guide me.",
  },
  {
    id: "pay-school-fees",
    label: "Pay School Fees",
    message:
      "Hello, I'd like to pay my school fees. Please share the current process and any account details I need.",
  },
  {
    id: "results",
    label: "Results / Transcript",
    message:
      "Hello, I need information about accessing my results or transcript. Please help.",
  },
  {
    id: "other",
    label: "Something else",
    message:
      "Hello, I'm a student and I need help with a portal-related issue. Please assist.",
  },
];

/** wa.me link for an action. */
export function whatsappLinkFor(action: PortalServiceAction): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(action.message)}`;
}
