"use client";

import { deleteItineraryItem } from "@/app/actions/ops";
import styles from "@/app/ops/ops.module.css";

/**
 * Delete an itinerary item behind a JS confirm(). Deleting a request-linked
 * item is allowed — the warning spells out that the request itself survives.
 */
export default function DeleteItineraryItemButton({
  itemId,
  title,
  linked,
}: {
  itemId: string;
  title: string;
  linked: boolean;
}) {
  return (
    <form
      action={deleteItineraryItem}
      onSubmit={(e) => {
        const detail = linked
          ? "\n\nThis item is linked to a service request — the request itself is NOT touched."
          : "";
        if (!confirm(`Delete "${title}" from the itinerary?${detail}`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="itemId" value={itemId} />
      <button type="submit" className={styles.btnDanger}>
        Delete
      </button>
    </form>
  );
}
