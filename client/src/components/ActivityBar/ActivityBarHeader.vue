<script setup lang="ts">
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { faChevronLeft, faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";

import ActivityBarSeparator from "./ActivityBarSeparator.vue";

interface Props {
    /** Whether an activity's side panel is currently open. */
    isSideBarOpen: boolean;
    /** The icon to display in the header. */
    icon?: IconDefinition;
    /** The title to display in the header. */
    title?: string;
}
const props = withDefaults(defineProps<Props>(), {
    icon: () => faHome,
    title: "Activities",
});

const emit = defineEmits<{
    (e: "close-sidebar"): void;
}>();

function closeSidebar(event: KeyboardEvent | MouseEvent) {
    if (props.isSideBarOpen && (event instanceof MouseEvent || event.key === "Enter" || event.key === " ")) {
        emit("close-sidebar");
    }
}
</script>

<template>
    <div>
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <div
            class="rounded flex items-center justify-center gap-x-1 m-1 py-1 px-0 text-blue-600"
            :class="{ 'bg-grey-200 hover:text-blue-700': props.isSideBarOpen }"
            :role="props.isSideBarOpen ? 'button' : undefined"
            :tabindex="props.isSideBarOpen ? 0 : undefined"
            :title="props.isSideBarOpen ? 'Close panel' : 'Activity Bar'"
            @click="closeSidebar"
            @keydown="closeSidebar">
            <FontAwesomeIcon :icon="props.isSideBarOpen ? faChevronLeft : props.icon" size="sm" fixed-width />
            <span class="text-small">{{ props.title }}</span>
        </div>
        <ActivityBarSeparator />
    </div>
</template>
