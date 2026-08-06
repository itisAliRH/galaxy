/**
 * Registry of the content sections a public profile page can show.
 *
 * Every section lists published items of one type for the profile owner.
 * Cards fetch up to FETCH_LIMIT newest items and apply the owner's layout
 * (pins, manual order, item limit) client side, so the page renders the
 * same for the owner and for anonymous visitors.
 */
import { GalaxyApi } from "@/api";
import { getPublishedHistories } from "@/api/histories";
import { loadWorkflows } from "@/api/workflows";
import { rethrowSimple } from "@/utils/simple-error";

/** How many items a section fetches; display is capped by the section's limit. */
export const FETCH_LIMIT = 50;

/** Bounds for the per-section item limit; mirror the backend schema constants. */
export const MIN_SECTION_ITEMS = 1;
export const MAX_SECTION_ITEMS = 20;
export const DEFAULT_SECTION_ITEMS = 5;

/** Key of the starred-tools section; its data comes from the profile payload, not a fetcher. */
export const TOOLS_SECTION_KEY = "tools";

export type ProfileColumn = "main" | "side";

export interface ProfileListItem {
    id: string;
    name: string;
    updateTime?: string;
}

export interface ProfileSectionDefinition {
    key: string;
    label: string;
    /** Which page column the section renders in. */
    column: ProfileColumn;
    /** Hint shown to the owner when the section has no published items yet. */
    emptyHint: string;
    /** Route to the published item. */
    itemUrl: (item: ProfileListItem) => string;
    /** Route listing all published items of this type by the user. */
    listUrl: (username: string) => string;
    /** Fetch the user's published items, newest first. */
    fetch: (username: string) => Promise<{ items: ProfileListItem[]; total: number }>;
}

async function fetchHistories(username: string) {
    const { data, total } = await getPublishedHistories({
        limit: FETCH_LIMIT,
        offset: 0,
        // Galaxy search syntax; the quoted value makes the username an exact match.
        search: `user:'${username}'`,
        sortBy: "update_time",
        sortDesc: true,
    });
    return {
        items: data.map((history) => ({ id: history.id, name: history.name, updateTime: history.update_time })),
        total,
    };
}

async function fetchWorkflows(username: string) {
    const { data, totalMatches } = await loadWorkflows({
        sortBy: "update_time",
        sortDesc: true,
        limit: FETCH_LIMIT,
        offset: 0,
        filterText: `user:'${username}'`,
        showPublished: true,
        skipStepCounts: true,
    });
    return {
        items: data.map((workflow) => ({ id: workflow.id, name: workflow.name, updateTime: workflow.update_time })),
        total: totalMatches,
    };
}

async function fetchPages(username: string) {
    const { response, data, error } = await GalaxyApi().GET("/api/pages", {
        params: {
            query: {
                limit: FETCH_LIMIT,
                offset: 0,
                search: `user:'${username}'`,
                sort_by: "update_time",
                sort_desc: true,
                show_own: false,
                show_published: true,
                show_shared: false,
            },
        },
    });
    if (error) {
        rethrowSimple(error);
    }
    return {
        items: data.map((page) => ({ id: page.id, name: page.title, updateTime: page.update_time })),
        total: parseInt(response.headers.get("total_matches") ?? "0"),
    };
}

async function fetchVisualizations(username: string) {
    const { response, data, error } = await GalaxyApi().GET("/api/visualizations", {
        params: {
            query: {
                limit: FETCH_LIMIT,
                offset: 0,
                search: `user:'${username}'`,
                sort_by: "update_time",
                sort_desc: true,
                show_own: false,
                show_published: true,
                show_shared: false,
            },
        },
    });
    if (error) {
        rethrowSimple(error);
    }
    return {
        items: data.map((visualization) => ({
            id: visualization.id,
            name: visualization.title,
            updateTime: visualization.update_time ?? undefined,
        })),
        total: parseInt(response.headers.get("total_matches") ?? "0"),
    };
}

export const PROFILE_SECTIONS: ProfileSectionDefinition[] = [
    {
        key: "histories",
        label: "Published histories",
        column: "main",
        emptyHint: "No published histories yet. Published histories show up here automatically.",
        itemUrl: (item) => `/published/history?id=${item.id}`,
        listUrl: (username) => `/histories/list_published?f-username=${username}`,
        fetch: fetchHistories,
    },
    {
        key: "workflows",
        label: "Published workflows",
        column: "main",
        emptyHint: "No published workflows yet. Published workflows show up here automatically.",
        itemUrl: (item) => `/published/workflow?id=${item.id}`,
        listUrl: (username) => `/workflows/list_published?owner=${username}`,
        fetch: fetchWorkflows,
    },
    {
        key: "pages",
        label: "Published pages",
        column: "main",
        emptyHint: "No published pages yet. Published pages show up here automatically.",
        itemUrl: (item) => `/published/page?id=${item.id}`,
        listUrl: (username) => `/pages/list_published?f-username=${username}`,
        fetch: fetchPages,
    },
    {
        key: "visualizations",
        label: "Published visualizations",
        column: "side",
        emptyHint: "No published visualizations yet. Published visualizations show up here automatically.",
        itemUrl: (item) => `/published/visualization?id=${item.id}`,
        listUrl: (username) => `/visualizations/list_published?f-username=${username}`,
        fetch: fetchVisualizations,
    },
];

/** Section keys in default display order; the tools section has no fetcher but participates in ordering and visibility. */
export const DEFAULT_SECTION_ORDER = [
    ...PROFILE_SECTIONS.filter((section) => section.column === "main").map((section) => section.key),
    TOOLS_SECTION_KEY,
    ...PROFILE_SECTIONS.filter((section) => section.column === "side").map((section) => section.key),
];
