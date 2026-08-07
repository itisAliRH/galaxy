import type { FavoriteOrderEntry } from "./queries";

// Convention: favorite ids are stored on the server in raw form (e.g. "Get Data"
// or an EDAM URI containing a colon). For client-side identity — Vue `:key`
// values, section ids, and Map lookups — we URI-encode the id so the type:id
// separator and any ":" inside the id don't collide.
export function favoriteEntryKey(orderEntry: FavoriteOrderEntry): string {
    return `${orderEntry.object_type}:${encodeURIComponent(orderEntry.object_id)}`;
}

/**
 * Merge a reordered subset of the user's favorites back into the full order.
 *
 * The favorites order endpoint requires a complete permutation (tools, tags,
 * and EDAM entries alike), while UIs usually let the user drag only a visible
 * subset. Entries belonging to the visible subset are replaced sequentially
 * with the reordered subset; everything else (other types, entries not shown)
 * keeps its position, and reordered entries with no original slot are
 * appended.
 */
export function mergeFavoriteOrder(
    fullOrder: FavoriteOrderEntry[],
    visibleEntries: FavoriteOrderEntry[],
    reorderedVisibleEntries: FavoriteOrderEntry[],
): FavoriteOrderEntry[] {
    const visibleKeys = new Set(visibleEntries.map(favoriteEntryKey));
    const reorderedQueue = [...reorderedVisibleEntries];
    const mergedOrder: FavoriteOrderEntry[] = [];

    for (const entry of fullOrder) {
        if (visibleKeys.has(favoriteEntryKey(entry))) {
            const reorderedEntry = reorderedQueue.shift();
            if (reorderedEntry) {
                mergedOrder.push(reorderedEntry);
            }
        } else {
            mergedOrder.push(entry);
        }
    }

    for (const remainingEntry of reorderedQueue) {
        mergedOrder.push(remainingEntry);
    }

    return mergedOrder;
}

export function sameFavoriteOrder(a: FavoriteOrderEntry[], b: FavoriteOrderEntry[]): boolean {
    return (
        a.length === b.length &&
        a.every(
            (entry, index) => entry.object_type === b[index]?.object_type && entry.object_id === b[index]?.object_id,
        )
    );
}
