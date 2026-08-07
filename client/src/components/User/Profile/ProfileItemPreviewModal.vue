<script setup lang="ts">
import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { computed, defineAsyncComponent } from "vue";

import type { ProfileListItem, ProfileSectionDefinition } from "./sections";

import GModal from "@/components/BaseComponents/GModal.vue";

interface Props {
    /** Section the previewed item belongs to; provides the preview component. */
    definition?: ProfileSectionDefinition | null;
    /** The item to preview. */
    item?: ProfileListItem | null;
    /** Controls if the modal is showing. Syncable. */
    show?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    definition: null,
    item: null,
    show: false,
});

const emit = defineEmits<{
    (e: "update:show", value: boolean): void;
}>();

/** One async wrapper per section, cached so reopening does not reload the chunk. */
const componentCache = new Map<string, ReturnType<typeof defineAsyncComponent>>();

const previewComponent = computed(() => {
    const definition = props.definition;
    if (!definition?.preview) {
        return null;
    }
    if (!componentCache.has(definition.key)) {
        componentCache.set(definition.key, defineAsyncComponent(definition.preview.component as never));
    }
    return componentCache.get(definition.key);
});

const previewProps = computed(() =>
    props.definition?.preview && props.item ? props.definition.preview.props(props.item) : {},
);
</script>

<template>
    <GModal
        centered
        class="profile-item-preview-modal"
        fixed-height
        footer
        :show="props.show"
        size="large"
        :title="props.item?.name"
        @update:show="emit('update:show', $event)">
        <!-- v-if on show: heavy viewers mount on first open and state resets between items -->
        <component
            :is="previewComponent"
            v-if="props.show && previewComponent && props.item"
            v-bind="previewProps"
            class="profile-item-preview-body" />

        <template v-slot:footer>
            <router-link
                v-if="props.definition && props.item"
                class="profile-item-preview-open"
                :to="props.definition.itemUrl(props.item)">
                Open full page
                <FontAwesomeIcon :icon="faExternalLinkAlt" size="xs" />
            </router-link>
        </template>
    </GModal>
</template>

<style lang="scss">
// sizing mirrors the workflow preview modal (WorkflowCardList.vue)
.profile-item-preview-modal {
    max-width: min(1400px, calc(100% - 200px));

    .modal-content {
        height: min(800px, calc(100vh - 80px));
    }

    .profile-item-preview-body {
        height: 100%;
        overflow: auto;
    }
}
</style>
