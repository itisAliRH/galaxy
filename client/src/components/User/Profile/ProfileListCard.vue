<script setup lang="ts">
import { faGripLines, faThumbtack } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { computed, onMounted, ref } from "vue";
import draggable from "vuedraggable";

import type { components } from "@/api/schema";

import { DEFAULT_SECTION_ITEMS, type ProfileListItem, type ProfileSectionDefinition } from "./sections";

import ProfileSection from "./ProfileSection.vue";
import UtcDate from "@/components/UtcDate.vue";

type SectionLayout = components["schemas"]["UserProfileSectionLayout"];

interface Props {
    /**
     * Definition of the section to render
     */
    definition: ProfileSectionDefinition;
    /**
     * Username whose published items are listed
     */
    username: string;
    /**
     * Whether the owner is viewing: enables pin, reorder, limit, and eye controls
     * @default false
     */
    editable?: boolean;
    /**
     * The owner's layout settings for this section (limit, pins, manual order)
     * @default undefined
     */
    layout?: SectionLayout;
    /**
     * Whether the section is visible to visitors
     * @default true
     */
    visible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    editable: false,
    layout: undefined,
    visible: true,
});

const emit = defineEmits<{
    (e: "loaded", hasContent: boolean): void;
    (e: "toggle-visible", value: boolean): void;
    (e: "update:layout", value: SectionLayout): void;
}>();

const loading = ref(true);
const items = ref<ProfileListItem[]>([]);
const total = ref(0);

const limit = computed(() => props.layout?.limit ?? DEFAULT_SECTION_ITEMS);
const pinned = computed(() => props.layout?.pinned ?? []);
const pinnedSet = computed(() => new Set(pinned.value));

/** All fetched items: pinned first (in pin order), then manual order, then newest first. */
const orderedItems = computed(() => {
    const byId = new Map(items.value.map((item) => [item.id, item]));
    const pinnedItems = pinned.value
        .map((id) => byId.get(id))
        .filter((item): item is ProfileListItem => item !== undefined);
    const orderIndex = new Map((props.layout?.item_order ?? []).map((id, index) => [id, index]));
    const rest = items.value
        .filter((item) => !pinnedSet.value.has(item.id))
        .sort((a, b) => {
            const aIndex = orderIndex.get(a.id) ?? Infinity;
            const bIndex = orderIndex.get(b.id) ?? Infinity;
            if (aIndex !== bIndex) {
                return aIndex - bIndex;
            }
            // items.value arrives newest first; keep that order for untouched items
            return items.value.indexOf(a) - items.value.indexOf(b);
        });
    return [...pinnedItems, ...rest];
});

/**
 * The rows on screen — a writable computed so vuedraggable can commit a drop.
 * Displayed rows are always a prefix of orderedItems, so a reorder within
 * them merges back by simple concatenation with the off-screen tail.
 */
const displayedItems = computed({
    get: () => orderedItems.value.slice(0, limit.value),
    set: (reordered: ProfileListItem[]) => {
        const offScreen = orderedItems.value.slice(limit.value);
        const fullOrder = [...reordered, ...offScreen];
        const newPinned = [
            ...reordered.filter((item) => pinnedSet.value.has(item.id)).map((item) => item.id),
            ...pinned.value.filter((id) => !reordered.some((item) => item.id === id)),
        ];
        emitLayout({ pinned: newPinned, item_order: fullOrder.map((item) => item.id) });
    },
});

const showCard = computed(() => {
    if (props.editable) {
        return true;
    }
    return props.visible && !loading.value && items.value.length > 0;
});

function emitLayout(changes: SectionLayout) {
    emit("update:layout", {
        limit: props.layout?.limit,
        pinned: pinned.value,
        item_order: props.layout?.item_order,
        ...changes,
    });
}

function isPinned(item: ProfileListItem) {
    return pinnedSet.value.has(item.id);
}

function togglePin(item: ProfileListItem) {
    const newPinned = isPinned(item) ? pinned.value.filter((id) => id !== item.id) : [...pinned.value, item.id];
    emitLayout({ pinned: newPinned });
}

function onLimitChange(value: number) {
    emitLayout({ limit: value });
}

async function load() {
    loading.value = true;
    try {
        const result = await props.definition.fetch(props.username);
        items.value = result.items;
        total.value = result.total;
    } catch {
        // The card is optional page content — render nothing on failure.
        items.value = [];
        total.value = 0;
    } finally {
        loading.value = false;
        emit("loaded", items.value.length > 0);
    }
}

onMounted(load);
</script>

<template>
    <ProfileSection
        v-if="showCard"
        :count="total"
        :editable="props.editable"
        :limit="limit"
        show-limit
        :title="props.definition.label"
        :visible="props.visible"
        @toggle-visible="emit('toggle-visible', $event)"
        @update:limit="onLimitChange">
        <div v-if="!loading && items.length > 0" class="gx-card profile-list">
            <draggable
                v-model="displayedItems"
                :disabled="!props.editable"
                :force-fallback="true"
                ghost-class="profile-list-ghost"
                handle=".profile-list-grip">
                <div
                    v-for="item in displayedItems"
                    :key="item.id"
                    class="gx-row-accent profile-list-item"
                    :class="{ 'profile-list-item-pinned': isPinned(item) }">
                    <span v-if="props.editable" class="profile-list-grip" title="Drag to reorder">
                        <FontAwesomeIcon :icon="faGripLines" fixed-width />
                    </span>

                    <router-link class="profile-list-link" :to="props.definition.itemUrl(item)">
                        <span class="profile-list-name">{{ item.name }}</span>

                        <span v-if="item.updateTime" class="profile-list-meta">
                            updated <UtcDate :date="item.updateTime" mode="elapsed" />
                        </span>
                    </router-link>

                    <FontAwesomeIcon
                        v-if="!props.editable && isPinned(item)"
                        class="profile-list-pin-marker"
                        :icon="faThumbtack"
                        title="Pinned" />

                    <button
                        v-if="props.editable"
                        class="profile-list-pin"
                        :class="{ 'profile-list-pin-active': isPinned(item) }"
                        type="button"
                        :title="isPinned(item) ? 'Unpin from the top' : 'Pin to the top'"
                        :aria-label="isPinned(item) ? 'Unpin from the top' : 'Pin to the top'"
                        @click="togglePin(item)">
                        <FontAwesomeIcon :icon="faThumbtack" fixed-width />
                    </button>
                </div>
            </draggable>

            <router-link v-if="total > limit" class="profile-list-more" :to="props.definition.listUrl(props.username)">
                View all {{ total }} →
            </router-link>
        </div>

        <div v-else-if="!loading && props.editable" v-localize class="profile-list-empty">
            {{ props.definition.emptyHint }}
        </div>
    </ProfileSection>
</template>

<style scoped lang="scss">
.profile-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    .profile-list-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem 0.5rem 0.9rem;
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

    .profile-list-ghost {
        opacity: 0.4;
    }

    .profile-list-grip {
        cursor: grab;
        opacity: 0.35;

        &:hover {
            opacity: 0.9;
        }
    }

    .profile-list-link {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        text-decoration: none;

        &:hover {
            text-decoration: none;
        }

        .profile-list-name {
            font-weight: 700;
            color: var(--color-galaxy-dark);
        }

        .profile-list-meta {
            font-size: 0.8rem;
            color: var(--color-galaxy-grey);
            opacity: 0.8;
        }
    }

    .profile-list-pin-marker {
        opacity: 0.5;
    }

    .profile-list-pin {
        border: none;
        background: none;
        padding: 0.25rem;
        color: inherit;
        opacity: 0;

        &.profile-list-pin-active {
            opacity: 0.9;
        }
    }

    .profile-list-item:hover .profile-list-pin {
        opacity: 0.5;

        &:hover,
        &.profile-list-pin-active {
            opacity: 1;
        }
    }

    .profile-list-more {
        font-size: 0.85rem;
        font-weight: 600;
        align-self: flex-start;
    }
}

.profile-list-empty {
    font-size: 0.9rem;
    font-style: italic;
    opacity: 0.7;
}
</style>
