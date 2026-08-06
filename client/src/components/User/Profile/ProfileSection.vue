<script setup lang="ts">
import { faEye, faEyeSlash, faGripVertical, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BFormInput } from "bootstrap-vue";
import { computed, ref, watch } from "vue";

import { useUid } from "@/composables/utils/uid";

import { MIN_SECTION_ITEMS } from "./sections";

import Heading from "@/components/Common/Heading.vue";

interface Props {
    /**
     * Section heading
     */
    title: string;
    /**
     * Total number of items in the section, shown next to the heading
     * @default undefined
     */
    count?: number;
    /**
     * Whether the owner is viewing: shows the eye, limit, and drag controls
     * @default false
     */
    editable?: boolean;
    /**
     * Current item limit shown in the range control
     * @default undefined
     */
    limit?: number;
    /**
     * Upper bound of the item-limit range control
     * @default 20
     */
    maxItems?: number;
    /**
     * Current search query; the search box renders when this is bound
     * @default undefined
     */
    search?: string;
    /**
     * Whether to render the search box
     * @default false
     */
    searchable?: boolean;
    /**
     * Whether to render the item-limit range control
     * @default false
     */
    showLimit?: boolean;
    /**
     * Whether the section is visible to visitors; hides content and disables
     * every control except the eye when false
     * @default true
     */
    visible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    count: undefined,
    editable: false,
    limit: undefined,
    maxItems: 20,
    search: undefined,
    searchable: false,
    showLimit: false,
    visible: true,
});

const emit = defineEmits<{
    (e: "toggle-visible", value: boolean): void;
    (e: "update:limit", value: number): void;
    (e: "update:search", value: string): void;
}>();

const limitId = useUid("profile-section-limit-");
const searchId = useUid("profile-section-search-");

/** Mirrors the thumb during a drag so the label tracks it live; persisted on release. */
const liveLimit = ref(props.limit);

watch(
    () => props.limit,
    (value) => {
        liveLimit.value = value;
    },
);

const visibilityIcon = computed(() => (props.visible ? faEye : faEyeSlash));
const visibilityLabel = computed(() =>
    props.visible ? "Visible to everyone — click to hide" : "Hidden from your page — click to show",
);

function onLimitInput(value: string) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) {
        liveLimit.value = parsed;
    }
}

function onLimitChange(value: string) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) {
        emit("update:limit", parsed);
    }
}
</script>

<template>
    <section class="profile-section" :class="{ 'profile-section-hidden': !props.visible }">
        <div class="profile-section-header">
            <span
                v-if="props.editable"
                class="profile-section-drag-handle"
                :class="{ 'profile-section-control-disabled': !props.visible }"
                title="Drag to reorder sections">
                <FontAwesomeIcon :icon="faGripVertical" />
            </span>

            <Heading h2 size="md" class="profile-section-heading">
                {{ props.title }}
                <span v-if="props.count !== undefined" class="profile-section-count">{{ props.count }}</span>
            </Heading>

            <div class="profile-section-controls">
                <label v-if="props.searchable" :for="searchId" class="profile-section-search">
                    <FontAwesomeIcon :icon="faSearch" />
                    <BFormInput
                        :id="searchId"
                        :disabled="!props.visible"
                        placeholder="search"
                        size="sm"
                        type="search"
                        :value="props.search ?? ''"
                        @input="emit('update:search', $event)" />
                </label>

                <label
                    v-if="props.editable && props.showLimit && props.limit !== undefined"
                    :for="limitId"
                    class="profile-section-limit">
                    <span class="profile-section-limit-value">show {{ liveLimit }}</span>
                    <BFormInput
                        :id="limitId"
                        :disabled="!props.visible"
                        :max="props.maxItems"
                        :min="MIN_SECTION_ITEMS"
                        step="1"
                        type="range"
                        :value="props.limit"
                        title="How many items this section shows"
                        @change="onLimitChange"
                        @input="onLimitInput" />
                </label>

                <button
                    v-if="props.editable"
                    class="profile-section-eye"
                    type="button"
                    :title="visibilityLabel"
                    :aria-label="visibilityLabel"
                    @click="emit('toggle-visible', !props.visible)">
                    <FontAwesomeIcon :icon="visibilityIcon" fixed-width />
                </button>
            </div>
        </div>

        <div v-if="props.editable && !props.visible" v-localize class="profile-section-hidden-note">
            Hidden — only you can see this section.
        </div>

        <slot />
    </section>
</template>

<style scoped lang="scss">
.profile-section {
    .profile-section-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        .profile-section-heading {
            flex: 1;
            min-width: 0;
            margin-bottom: 0;
        }

        .profile-section-count {
            font-weight: 400;
            font-size: 0.9rem;
            opacity: 0.7;
            margin-left: 0.25rem;
        }
    }

    .profile-section-drag-handle {
        cursor: grab;
        opacity: 0.4;

        &:hover {
            opacity: 0.9;
        }

        &.profile-section-control-disabled {
            pointer-events: none;
            opacity: 0.2;
        }
    }

    .profile-section-controls {
        display: flex;
        align-items: center;
        gap: 0.75rem;

        .profile-section-search {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            margin-bottom: 0;
            opacity: 0.85;

            input {
                width: 130px;
            }
        }

        .profile-section-limit {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0;

            .profile-section-limit-value {
                font-size: 0.8rem;
                white-space: nowrap;
                opacity: 0.7;
            }

            input {
                width: 90px;
            }
        }

        .profile-section-eye {
            border: none;
            background: none;
            padding: 0.25rem;
            color: inherit;
            opacity: 0.6;

            &:hover,
            &:focus-visible {
                opacity: 1;
            }
        }
    }

    .profile-section-hidden-note {
        font-size: 0.85rem;
        font-style: italic;
        opacity: 0.7;
        margin-top: 0.25rem;
    }

    &.profile-section-hidden {
        opacity: 0.55;
    }
}
</style>
