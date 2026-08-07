/**
 * Registry of the content sections a public profile page can show.
 *
 * Every section lists published items of one type for the profile owner.
 * Cards fetch up to FETCH_LIMIT newest items and apply the owner's layout
 * (pins, manual order, item limit) client side, so the page renders the
 * same for the owner and for anonymous visitors.
 */
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faChartBar, faFile, faHdd, faSitemap, faWrench } from "@fortawesome/free-solid-svg-icons";
import type { Component } from "vue";

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

/** Icon for the starred-tools section; the other sections carry their own. */
export const TOOLS_SECTION_ICON = faWrench;

export type ProfileColumn = "main" | "side";

export interface ProfileListItem {
    id: string;
    name: string;
    updateTime?: string;
    /**
     * Short description, when the item type carries one. Histories and
     * visualizations annotate per viewing user, so a visitor sees nothing
     * there for someone else's item; workflow annotations resolve for
     * everyone. The pages index returns no annotation at all.
     */
    description?: string;
    tags?: string[];
}

/** How many tags a row shows before the rest are dropped. */
export const MAX_VISIBLE_TAGS = 3;

export interface ProfileSectionPreview {
    /**
     * Lazily imported component rendered inside the preview modal, so
     * sections.ts never pulls the heavy viewer bundles eagerly.
     */
    component: () => Promise<Component | { default: Component }>;
    /** Props to bind onto the preview component for an item. */
    props: (item: ProfileListItem) => Record<string, unknown>;
}

export interface ProfileSectionDefinition {
    key: string;
    label: string;
    /** Icon shown next to the section heading. */
    icon: IconDefinition;
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
    /** In-place preview support; sections without it simply show no preview button. */
    preview?: ProfileSectionPreview;
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
        items: data.map((history) => ({
            id: history.id,
            name: history.name,
            updateTime: history.update_time,
            description: history.annotation ?? undefined,
            tags: history.tags,
        })),
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
        items: data.map((workflow) => ({
            id: workflow.id,
            name: workflow.name,
            updateTime: workflow.update_time,
            description: workflow.annotations?.[0] ?? undefined,
            tags: workflow.tags as string[] | undefined,
        })),
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
        items: data.map((page) => ({
            id: page.id,
            name: page.title,
            updateTime: page.update_time,
            tags: page.tags as string[] | undefined,
        })),
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
            description: (visualization.annotation as string | null | undefined) ?? undefined,
            tags: visualization.tags as string[] | undefined,
        })),
        total: parseInt(response.headers.get("total_matches") ?? "0"),
    };
}

export const PROFILE_SECTIONS: ProfileSectionDefinition[] = [
    {
        key: "histories",
        label: "Published histories",
        icon: faHdd,
        column: "main",
        emptyHint: "No published histories yet. Published histories show up here automatically.",
        itemUrl: (item) => `/published/history?id=${item.id}`,
        listUrl: (username) => `/histories/list_published?f-username=${username}`,
        fetch: fetchHistories,
        preview: {
            component: () => import("@/components/History/HistoryView.vue"),
            props: (item) => ({ id: item.id, showHeading: false }),
        },
    },
    {
        key: "workflows",
        label: "Published workflows",
        icon: faSitemap,
        column: "main",
        emptyHint: "No published workflows yet. Published workflows show up here automatically.",
        itemUrl: (item) => `/published/workflow?id=${item.id}`,
        listUrl: (username) => `/workflows/list_published?owner=${username}`,
        fetch: fetchWorkflows,
        preview: {
            component: () => import("@/components/Workflow/Published/WorkflowPublished.vue"),
            props: (item) => ({ id: item.id, quickView: true, showHeading: false, showButtons: false }),
        },
    },
    {
        key: "pages",
        label: "Published pages",
        icon: faFile,
        column: "main",
        emptyHint: "No published pages yet. Published pages show up here automatically.",
        itemUrl: (item) => `/published/page?id=${item.id}`,
        listUrl: (username) => `/pages/list_published?f-username=${username}`,
        fetch: fetchPages,
        preview: {
            component: () => import("@/components/Page/PageView.vue"),
            props: (item) => ({ pageId: item.id, embed: true, showHeading: false }),
        },
    },
    // visualizations deliberately have no preview: plugin iframes assume full
    // center-panel sizing and need their own sizing/security pass first
    {
        key: "visualizations",
        label: "Published visualizations",
        icon: faChartBar,
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
