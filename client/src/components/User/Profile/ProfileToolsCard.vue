<script setup lang="ts">
import { faGripLines, faWrench } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { computed, onMounted, ref, watch } from "vue";
import draggable from "vuedraggable";

import type { components } from "@/api/schema";
import { Toast } from "@/composables/toast";
import { favoriteEntryKey, mergeFavoriteOrder, sameFavoriteOrder } from "@/stores/users/favoritesOrder";
import type { FavoriteOrderEntry } from "@/stores/users/queries";
import { useUserStore } from "@/stores/userStore";
import ariaAlert from "@/utils/ariaAlert";
import localize from "@/utils/localization";

import { DEFAULT_SECTION_ITEMS, TOOLS_SECTION_ICON } from "./sections";

import ProfileSection from "./ProfileSection.vue";
import ToolFavoriteButton from "@/components/Tool/Buttons/ToolFavoriteButton.vue";

type ProfileStarredTool = components["schemas"]["ProfileStarredTool"];
type SectionLayout = components["schemas"]["UserProfileSectionLayout"];

interface Props {
    /**
     * Whether the owner is viewing: enables the eye control, the item-limit
     * slider, and drag-reordering
     * @default false
     */
    editable?: boolean;
    /**
     * Starred tools from the profile payload
     * @default () => []
     */
    tools?: ProfileStarredTool[];
    /**
     * Whether the section is visible to visitors
     * @default true
     */
    visible?: boolean;
    /**
     * Stored layout for the tools section. Only `limit` is meaningful here:
     * the tools ORDER lives in the user's favorites (the tool panel reads the
     * same order), so `pinned`/`item_order` must never be written for tools.
     * @default undefined
     */
    layout?: SectionLayout;
    /**
     * Maximum value for the item-limit slider (from instance configuration)
     * @default 20
     */
    maxItems?: number;
}

const props = withDefaults(defineProps<Props>(), {
    editable: false,
    tools: () => [],
    visible: true,
    layout: undefined,
    maxItems: 20,
});

const emit = defineEmits<{
    (e: "loaded", hasContent: boolean): void;
    (e: "toggle-visible", value: boolean): void;
    (e: "update:layout", value: SectionLayout): void;
}>();

const userStore = useUserStore();

const search = ref("");
const searching = computed(() => search.value.trim().length > 0);

const limit = computed(() => props.layout?.limit ?? DEFAULT_SECTION_ITEMS);

/**
 * Local copy of the starred tools so a drag can settle before the round-trip
 * through the favorites API and the profile payload catches up. The syncing
 * flag keeps a mid-drag prop refresh from yanking rows (the reorder round-trips
 * through the user store and server, unlike the layout-backed list cards).
 */
const localTools = ref<ProfileStarredTool[]>([...props.tools]);
const syncingOrder = ref(false);

watch(
    () => props.tools,
    (tools) => {
        if (!syncingOrder.value) {
            localTools.value = [...tools];
        }
        emit("loaded", tools.length > 0);
    },
);

/**
 * The rows on screen — a writable computed so vuedraggable can commit a drop.
 * The visible rows are a prefix of localTools; a reorder merges back by
 * concatenation with the off-screen tail and persists into the user's full
 * favorites order. While a search is active the list is a filtered view and
 * dragging is off.
 */
const displayedTools = computed({
    get: () => {
        if (searching.value) {
            const query = search.value.trim().toLowerCase();
            return localTools.value.filter((tool) => tool.name.toLowerCase().includes(query));
        }
        return props.editable ? localTools.value.slice(0, limit.value) : localTools.value;
    },
    set: (reordered: ProfileStarredTool[]) => {
        if (searching.value) {
            return;
        }
        const merged = [...reordered, ...localTools.value.slice(limit.value)];
        localTools.value = merged;
        persistOrder(merged);
    },
});

const hiddenCount = computed(() =>
    props.editable && !searching.value ? Math.max(localTools.value.length - limit.value, 0) : 0,
);

const showCard = computed(() => props.editable || (props.visible && props.tools.length > 0));

const dragDisabled = computed(() => !props.editable || !props.visible || searching.value);

function toolEntry(tool: ProfileStarredTool): FavoriteOrderEntry {
    return { object_type: "tools", object_id: tool.id };
}

/**
 * Persist the new order through the favorites API — the single source of
 * truth for tool order (the tool panel reads it too). The payload must be a
 * complete permutation, so the reordered tools merge into the full favorites
 * order, leaving tags and EDAM entries in place.
 */
async function persistOrder(merged: ProfileStarredTool[]) {
    const fullOrder = userStore.currentFavorites.order;
    const visibleEntries = localTools.value.map(toolEntry);
    const mergedOrder = mergeFavoriteOrder(fullOrder, visibleEntries, merged.map(toolEntry));
    if (sameFavoriteOrder(mergedOrder, fullOrder)) {
        return;
    }
    syncingOrder.value = true;
    try {
        await userStore.reorderFavorites(mergedOrder);
        ariaAlert(localize("starred tools reordered"));
    } catch {
        localTools.value = [...props.tools];
        Toast.error(localize("Failed to reorder starred tools."));
        ariaAlert(localize("failed to reorder starred tools"));
    } finally {
        syncingOrder.value = false;
    }
}

function onLimitChange(value: number) {
    // never echo pinned/item_order back for tools — order lives in favorites
    emit("update:layout", { limit: value });
}

function toolUrl(tool: ProfileStarredTool) {
    return `/?tool_id=${encodeURIComponent(tool.id)}&version=latest`;
}

// Tools arrive with the profile payload; report content synchronously so the
// page can settle its empty-state layout, and again when the payload changes.
onMounted(() => emit("loaded", props.tools.length > 0));
</script>

<template>
    <ProfileSection
        v-if="showCard"
        :count="props.tools.length"
        :editable="props.editable"
        :icon="TOOLS_SECTION_ICON"
        :limit="limit"
        :max-items="props.maxItems"
        :search="search"
        :searchable="props.editable && props.tools.length > 0"
        :show-limit="props.editable"
        title="Starred tools"
        :visible="props.visible"
        @toggle-visible="emit('toggle-visible', $event)"
        @update:limit="onLimitChange"
        @update:search="search = $event">
        <div v-if="props.tools.length > 0" class="gx-card profile-tools d-flex flex-column">
            <draggable
                v-model="displayedTools"
                :disabled="dragDisabled"
                :force-fallback="true"
                ghost-class="profile-tools-ghost"
                handle=".profile-tools-grip">
                <div
                    v-for="tool in displayedTools"
                    :key="favoriteEntryKey(toolEntry(tool))"
                    class="gx-row-accent profile-tools-item d-flex align-items-center">
                    <span
                        v-if="props.editable"
                        class="profile-tools-grip"
                        :class="{ 'profile-tools-grip-disabled': dragDisabled }"
                        title="Drag to reorder">
                        <FontAwesomeIcon :icon="faGripLines" fixed-width />
                    </span>

                    <router-link class="profile-tools-link d-flex align-items-center flex-fill" :to="toolUrl(tool)">
                        <FontAwesomeIcon class="profile-tools-icon" :icon="faWrench" fixed-width />

                        <span class="profile-tools-name">{{ tool.name }}</span>
                    </router-link>

                    <!-- visitors (and the owner's public preview) can star the
                         tool into their own favorites -->
                    <ToolFavoriteButton
                        v-if="!props.editable"
                        :id="tool.id"
                        class="profile-tools-favorite"
                        color="grey" />
                </div>
            </draggable>

            <div v-if="searching && displayedTools.length === 0" v-localize class="profile-tools-empty font-italic">
                No tools match the search.
            </div>

            <div v-if="hiddenCount > 0" class="profile-tools-more font-italic">
                and {{ hiddenCount }} more only you can see — raise the slider to show them
            </div>
        </div>

        <div v-else-if="props.editable" v-localize class="profile-tools-empty font-italic">
            No starred tools yet. Tools you star in the tool panel show up here.
        </div>
    </ProfileSection>
</template>

<style scoped lang="scss">
.profile-tools {
    gap: 0.5rem;

    .profile-tools-item {
        gap: 0.5rem;
        padding: 0.25rem 0.5rem 0.25rem 0.9rem;
        border: 1px solid rgba(37, 83, 123, 0.12);
        border-radius: 0.375rem;
        margin-bottom: 0.5rem;

        &:last-child {
            margin-bottom: 0;
        }

        &:hover {
            box-shadow: 0 1px 4px rgba(44, 49, 67, 0.15);
        }
    }

    .profile-tools-ghost {
        opacity: 0.4;
    }

    .profile-tools-grip {
        cursor: grab;
        opacity: 0.35;

        &:hover {
            opacity: 0.9;
        }

        &.profile-tools-grip-disabled {
            pointer-events: none;
            opacity: 0.15;
        }
    }

    .profile-tools-link {
        gap: 0.5rem;
        padding: 0.25rem 0;
        min-width: 0;
        text-decoration: none;

        &:hover {
            text-decoration: none;
        }

        .profile-tools-icon {
            opacity: 0.5;
        }

        .profile-tools-name {
            font-weight: 600;
            color: var(--color-galaxy-dark);
            min-width: 0;
            overflow-wrap: anywhere;
        }
    }

    .profile-tools-favorite {
        opacity: 0.6;

        &:hover,
        &:focus-visible {
            opacity: 1;
        }
    }

    .profile-tools-more {
        font-size: 0.8rem;
        opacity: 0.7;
    }
}

.profile-tools-empty {
    font-size: 0.9rem;
    opacity: 0.7;
}
</style>
