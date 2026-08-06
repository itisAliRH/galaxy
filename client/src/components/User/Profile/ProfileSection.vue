<script setup lang="ts">
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faEye, faEyeSlash, faGripVertical, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BFormInput } from "bootstrap-vue";
import { computed, ref, watch } from "vue";

import { useUid } from "@/composables/utils/uid";

import { MIN_SECTION_ITEMS } from "./sections";

import GButton from "@/components/BaseComponents/GButton.vue";
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
     * Icon shown to the left of the heading
     * @default undefined
     */
    icon?: IconDefinition;
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
    icon: undefined,
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
        <div class="profile-section-header d-flex align-items-center flex-wrap mb-2">
            <span
                v-if="props.editable"
                class="profile-section-drag-handle"
                :class="{ 'profile-section-control-disabled': !props.visible }"
                title="Drag to reorder sections">
                <FontAwesomeIcon :icon="faGripVertical" />
            </span>

            <!-- the icon lives inside the <h2> so the brand rule and its
                 padding run under the icon as well as the title -->
            <Heading h2 size="md" class="profile-section-heading mb-0">
                <FontAwesomeIcon v-if="props.icon" class="profile-section-icon mr-1" :icon="props.icon" fixed-width />
                {{ props.title }}
                <span v-if="props.count !== undefined" class="profile-section-count font-weight-normal ml-1">{{
                    props.count
                }}</span>
            </Heading>

            <div class="profile-section-controls d-flex align-items-center flex-wrap justify-content-end ml-auto">
                <label
                    v-if="props.searchable"
                    :for="searchId"
                    class="profile-section-search d-flex align-items-center mb-0">
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
                    class="profile-section-limit d-flex align-items-center mb-0">
                    <span class="profile-section-limit-value text-nowrap">show {{ liveLimit }}</span>
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

                <GButton
                    v-if="props.editable"
                    class="profile-section-eye"
                    color="grey"
                    size="medium"
                    icon-only
                    transparent
                    :title="visibilityLabel"
                    :aria-label="visibilityLabel"
                    @click="emit('toggle-visible', !props.visible)">
                    <FontAwesomeIcon :icon="visibilityIcon" fixed-width />
                </GButton>
            </div>
        </div>

        <div v-if="props.editable && !props.visible" v-localize class="profile-section-hidden-note font-italic mt-1">
            Hidden — only you can see this section.
        </div>

        <slot />
    </section>
</template>

<style scoped lang="scss">
.profile-section {
    .profile-section-header {
        gap: 0.5rem;

        .profile-section-heading {
            // never squeeze the title into a vertical letter stack: the
            // controls wrap to their own line first
            flex: 1 1 12rem;
            min-width: 0;
        }

        .profile-section-count {
            font-size: 0.9rem;
            opacity: 0.7;
        }
    }

    .profile-section-icon {
        color: var(--color-galaxy-primary);
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
        gap: 0.75rem;

        // Both controls are labels that hand focus to their input on click, so
        // the label chrome reads as clickable while the input keeps its own
        // cursor: a caret for the search box, a pointer for the range thumb.
        .profile-section-search {
            gap: 0.35rem;
            opacity: 0.85;
            cursor: pointer;

            input {
                width: 8rem;
                max-width: 100%;
                cursor: auto;
            }
        }

        .profile-section-limit {
            gap: 0.5rem;
            cursor: pointer;

            .profile-section-limit-value {
                font-size: 0.8rem;
                opacity: 0.7;
            }

            input {
                width: 90px;
                cursor: pointer;

                &:disabled {
                    cursor: default;
                }
            }
        }

        .profile-section-eye {
            opacity: 0.6;

            &:hover,
            &:focus-visible {
                opacity: 1;
            }
        }
    }

    .profile-section-hidden-note {
        font-size: 0.85rem;
        opacity: 0.7;
    }

    &.profile-section-hidden {
        opacity: 0.55;
    }
}
</style>
