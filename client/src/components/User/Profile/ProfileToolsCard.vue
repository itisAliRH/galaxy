<script setup lang="ts">
import { faWrench } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { computed, onMounted, ref, watch } from "vue";

import type { components } from "@/api/schema";

import ProfileSection from "./ProfileSection.vue";

type ProfileStarredTool = components["schemas"]["ProfileStarredTool"];

interface Props {
    /**
     * Whether the owner is viewing: enables the eye control and empty hint
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
}

const props = withDefaults(defineProps<Props>(), {
    editable: false,
    tools: () => [],
    visible: true,
});

const emit = defineEmits<{
    (e: "loaded", hasContent: boolean): void;
    (e: "toggle-visible", value: boolean): void;
}>();

const search = ref("");

const displayedTools = computed(() => {
    const query = search.value.trim().toLowerCase();
    if (!query) {
        return props.tools;
    }
    return props.tools.filter((tool) => tool.name.toLowerCase().includes(query));
});

const showCard = computed(() => props.editable || (props.visible && props.tools.length > 0));

function toolUrl(tool: ProfileStarredTool) {
    return `/?tool_id=${encodeURIComponent(tool.id)}&version=latest`;
}

// Tools arrive with the profile payload; report content synchronously so the
// page can settle its empty-state layout, and again when the payload changes.
onMounted(() => emit("loaded", props.tools.length > 0));

watch(
    () => props.tools,
    (tools) => emit("loaded", tools.length > 0),
);
</script>

<template>
    <ProfileSection
        v-if="showCard"
        :count="props.tools.length"
        :editable="props.editable"
        :search="search"
        :searchable="props.editable && props.tools.length > 0"
        title="Starred tools"
        :visible="props.visible"
        @toggle-visible="emit('toggle-visible', $event)"
        @update:search="search = $event">
        <div v-if="props.tools.length > 0" class="gx-card profile-tools">
            <router-link
                v-for="tool in displayedTools"
                :key="tool.id"
                class="gx-row-accent profile-tools-item"
                :to="toolUrl(tool)">
                <FontAwesomeIcon class="profile-tools-icon" :icon="faWrench" fixed-width />

                <span class="profile-tools-name">{{ tool.name }}</span>
            </router-link>

            <div v-if="displayedTools.length === 0" v-localize class="profile-tools-empty">
                No tools match the search.
            </div>
        </div>

        <div v-else-if="props.editable" v-localize class="profile-tools-empty">
            No starred tools yet. Tools you star in the tool panel show up here.
        </div>
    </ProfileSection>
</template>

<style scoped lang="scss">
.profile-tools {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    .profile-tools-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem 0.5rem 0.9rem;
        border: 1px solid rgba(37, 83, 123, 0.12);
        border-radius: 0.375rem;
        text-decoration: none;

        &:hover {
            text-decoration: none;
            box-shadow: 0 1px 4px rgba(44, 49, 67, 0.15);
        }

        .profile-tools-icon {
            opacity: 0.5;
        }

        .profile-tools-name {
            font-weight: 600;
            color: var(--color-galaxy-dark);
        }
    }
}

.profile-tools-empty {
    font-size: 0.9rem;
    font-style: italic;
    opacity: 0.7;
}
</style>
