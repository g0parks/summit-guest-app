# Guest email copy deck — the pre-arrival cadence

The editable copy for the three cadence emails + the RESUME nudge
(`src/lib/guestEmail.ts` welcome template + `src/lib/touchpoints.ts`
`touchEmailContent`), plus the consent microcopy (`src/lib/consentCopy.ts`).

**How to use it:** rewrite any line (the text after the label), or a whole
email from scratch. Hand it back and say "apply the copy doc" and I'll map it
onto the code. Labels and structure are orientation only.

**Voice rules:** no em-dashes customer-facing. Calm, presupposing register
("Should we…", never "Would you like…"). Essentials with taste, not a
concierge-genie. Every email is sent by a human tap from ops, in the PM's
co-brand, from `GUEST_EMAIL_FROM`.

---

## 1 · Welcome — at booking (touchpoint #1, the introduction)
- **Subject:** Your stay at {Property Name}
- **Headline:** {First name}, your trip is set.
- **Body line 1:** {Property Name} · {dates}
- **Body line 2:** Your itinerary and everything arranged for your stay are in one place, ready when you are.
- **Button:** Open your trip
- **Under the button:** Tap through and tell us what should be waiting. A little now makes for an easy arrival. Prefer text updates? Tell us your number inside.
- **Concierge line (when configured):** Your concierge is a text away at {phone}.

## 2 · Plan-ahead — ~2 weeks after booking (the /plan invitation)
*Suppressed automatically when the guest already planned or has services in motion.*
- **Subject:** Shall we get your stay arranged?
- **Headline:** {First name}, let's get ahead of it.
- **Paragraph 1:** Your stay at {Property Name} is on our books, and the best trips are arranged before the bags are packed.
- **Paragraph 2:** A few quick questions about the car, the kitchen, the gear, and your concierge takes it from there.
- **Button:** Plan your stay *(lands on /plan)*
- **Closing:** A couple of minutes now, and arrival looks after itself.

## 3 · Pre-arrival — ~2 weeks out (signal-aware; the pieces assemble per guest)
- **Subject:** {Property Name} is nearly ready for you
- **Headline:** {First name}, it's nearly time.
- **Opening, when things are booked:** {Property Name}, {dates}. {Airport Transfer and Grocery Stocking} are set.
- **Opening, when nothing's booked yet:** {Property Name}, {dates}. Your trip page has the latest.
- **If a quote awaits their yes:** One thing waits on your yes: a priced request is ready to approve.
- **If something's half-finished:** Still open: {Ski Rental}. A tap or two finishes it.
- **If nothing's started at all:** If something should be waiting when you arrive, it's one tap away.
- **Button:** Open your trip
- **Closing, everything handled:** You're all set. We'll have it all waiting.
- **Closing, otherwise:** We'll have it all waiting.

## 4 · Resume — opened the link, went quiet 4+ days, nothing planned
- **Subject:** Shall we pick up where you left off?
- **Headline:** {First name}, we kept your place.
- **Paragraph 1:** You had a look at your {Property Name} trip page. Nothing's arranged yet, and that's easy to fix.
- **Paragraph 2:** A few one-tap questions and your concierge handles the rest. The car, the kitchen, the gear.
- **Button:** Pick it back up *(lands on /plan)*
- **Closing:** Whenever you're ready. No rush.

## Compliance footer (every email, small + quiet)
- **Line:** Unsubscribe · Summit Luxury Logistics LLC · 7533 S Center View Ct, Ste N · West Jordan, UT 84084

## Wizard contact screen (the engagement gate — completing an order asks for a textable number)
- **Eyebrow:** Staying in touch
- **Question:** Where should updates go?
- **Detail:** Your concierge coordinates by text. The driver on the way, the delivery at the door, a question about timing.
- **Field label:** Mobile number
- **Disclosure under the field:** {reassurance line} By continuing, you agree we may text this number about your stay.
- **Inline error (no number):** Add a mobile number so your concierge can reach you.

## Consent microcopy (in-app: home card, perk claim, /plan contact)
- **Checkbox label:** Text me updates about my stay
- **Reassurance line (the versioned disclosure):** Only about your stay. Your driver, your delivery, a question from your concierge. Never spam, and you can stop any time.
- **Home card eyebrow:** Texts, if you like
- **Home card question:** Want updates by text?
- **Home card after opt-in:** Noted. We'll only text when it matters.

## Unsubscribe page
- **Ask:** Unsubscribe? / We'll stop emailing {email}. Your trip link keeps working either way.
- **Done:** Done. / {email} is unsubscribed. We won't email you.
