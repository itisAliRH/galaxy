import { describe, expect, it } from "vitest";

import { favoriteEntryKey, mergeFavoriteOrder, sameFavoriteOrder } from "./favoritesOrder";
import type { FavoriteOrderEntry } from "./queries";

function tool(id: string): FavoriteOrderEntry {
    return { object_type: "tools", object_id: id };
}

function tag(id: string): FavoriteOrderEntry {
    return { object_type: "tags", object_id: id };
}

describe("favoritesOrder", () => {
    it("keys entries by type and encoded id", () => {
        expect(favoriteEntryKey(tool("Get Data"))).toBe("tools:Get%20Data");
        expect(favoriteEntryKey(tag("a:b"))).toBe("tags:a%3Ab");
    });

    it("merges a reordered subset while preserving interleaved entries", () => {
        const fullOrder = [tool("a"), tag("t1"), tool("b"), tool("c"), tag("t2")];
        const visible = [tool("a"), tool("b"), tool("c")];
        const reordered = [tool("c"), tool("a"), tool("b")];
        expect(mergeFavoriteOrder(fullOrder, visible, reordered)).toEqual([
            tool("c"),
            tag("t1"),
            tool("a"),
            tool("b"),
            tag("t2"),
        ]);
    });

    it("appends reordered entries that have no slot in the full order", () => {
        const fullOrder = [tag("t1")];
        const visible = [tool("new")];
        expect(mergeFavoriteOrder(fullOrder, visible, [tool("new")])).toEqual([tag("t1"), tool("new")]);
    });

    it("leaves unrelated entries alone when the subset is empty", () => {
        const fullOrder = [tag("t1"), tool("a")];
        expect(mergeFavoriteOrder(fullOrder, [], [])).toEqual(fullOrder);
    });

    it("compares orders element-wise", () => {
        expect(sameFavoriteOrder([tool("a"), tag("t")], [tool("a"), tag("t")])).toBe(true);
        expect(sameFavoriteOrder([tool("a")], [tool("b")])).toBe(false);
        expect(sameFavoriteOrder([tool("a")], [tool("a"), tag("t")])).toBe(false);
    });
});
