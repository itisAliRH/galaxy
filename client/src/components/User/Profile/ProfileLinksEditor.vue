<script setup lang="ts">
import {
    faCheck,
    faExternalLinkAlt,
    faLink,
    faPencilAlt,
    faPlus,
    faTimes,
    faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BFormInput } from "bootstrap-vue";
import { computed, ref } from "vue";

import type { components } from "@/api/schema";

import GButton from "@/components/BaseComponents/GButton.vue";

type UserProfileLink = components["schemas"]["UserProfileLink"];

/** Mirror of the backend limit on profile links. */
const MAX_LINKS = 10;

interface Props {
    /**
     * Whether the owner is viewing: enables add, edit, and remove controls
     * @default false
     */
    editable?: boolean;
    /**
     * External links to render
     * @default () => []
     */
    links?: UserProfileLink[];
}

const props = withDefaults(defineProps<Props>(), {
    editable: false,
    links: () => [],
});

const emit = defineEmits<{
    (e: "update:links", value: UserProfileLink[]): void;
}>();

/** Index of the row being edited, links.length for a new row, null when idle. */
const editingIndex = ref<number | null>(null);
const draftLabel = ref("");
const draftUrl = ref("");
const draftError = ref<string | null>(null);

const canAdd = computed(() => props.links.length < MAX_LINKS);

function startEdit(index: number) {
    editingIndex.value = index;
    draftLabel.value = props.links[index]?.label ?? "";
    draftUrl.value = props.links[index]?.url ?? "";
    draftError.value = null;
}

function startAdd() {
    editingIndex.value = props.links.length;
    draftLabel.value = "";
    draftUrl.value = "https://";
    draftError.value = null;
}

function cancelEdit() {
    editingIndex.value = null;
    draftError.value = null;
}

function commitEdit() {
    const label = draftLabel.value.trim();
    const url = draftUrl.value.trim();
    if (!label) {
        draftError.value = "The link needs a label.";
        return;
    }
    if (!/^https?:\/\/.+/.test(url)) {
        draftError.value = "The URL must start with http:// or https://.";
        return;
    }
    const updated = [...props.links];
    updated.splice(editingIndex.value ?? updated.length, 1, { label, url });
    emit("update:links", updated);
    cancelEdit();
}

function removeLink(index: number) {
    const updated = props.links.filter((_, i) => i !== index);
    emit("update:links", updated);
    cancelEdit();
}
</script>

<template>
    <div v-if="props.links.length > 0 || props.editable" class="profile-links">
        <template v-for="(link, index) in props.links">
            <div v-if="editingIndex !== index" :key="`link-${index}`" class="profile-links-row">
                <FontAwesomeIcon :icon="faLink" fixed-width />

                <a class="profile-links-anchor" :href="link.url" rel="noopener noreferrer" target="_blank">
                    {{ link.label }}
                    <FontAwesomeIcon class="profile-links-external" :icon="faExternalLinkAlt" size="xs" />
                </a>

                <span v-if="props.editable" class="profile-links-actions">
                    <button type="button" title="Edit link" aria-label="Edit link" @click="startEdit(index)">
                        <FontAwesomeIcon :icon="faPencilAlt" fixed-width />
                    </button>

                    <button type="button" title="Remove link" aria-label="Remove link" @click="removeLink(index)">
                        <FontAwesomeIcon :icon="faTrash" fixed-width />
                    </button>
                </span>
            </div>

            <div v-else :key="`link-edit-${index}`" class="profile-links-editor">
                <BFormInput v-model="draftLabel" placeholder="Label, e.g. GitHub" size="sm" />

                <BFormInput v-model="draftUrl" placeholder="https://…" size="sm" type="url" @keyup.enter="commitEdit" />

                <span class="profile-links-actions">
                    <button type="button" title="Save link" aria-label="Save link" @click="commitEdit">
                        <FontAwesomeIcon :icon="faCheck" fixed-width />
                    </button>

                    <button type="button" title="Cancel" aria-label="Cancel" @click="cancelEdit">
                        <FontAwesomeIcon :icon="faTimes" fixed-width />
                    </button>
                </span>
            </div>
        </template>

        <div v-if="editingIndex === props.links.length" class="profile-links-editor">
            <BFormInput v-model="draftLabel" placeholder="Label, e.g. GitHub" size="sm" />

            <BFormInput v-model="draftUrl" placeholder="https://…" size="sm" type="url" @keyup.enter="commitEdit" />

            <span class="profile-links-actions">
                <button type="button" title="Save link" aria-label="Save link" @click="commitEdit">
                    <FontAwesomeIcon :icon="faCheck" fixed-width />
                </button>

                <button type="button" title="Cancel" aria-label="Cancel" @click="cancelEdit">
                    <FontAwesomeIcon :icon="faTimes" fixed-width />
                </button>
            </span>
        </div>

        <div v-if="draftError" class="profile-links-error">{{ draftError }}</div>

        <GButton
            v-if="props.editable && canAdd && editingIndex === null"
            id="profile-links-add"
            color="grey"
            size="small"
            transparent
            @click="startAdd">
            <FontAwesomeIcon :icon="faPlus" />
            <span v-localize>Add link</span>
        </GButton>
    </div>
</template>

<style scoped lang="scss">
.profile-links {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;

    .profile-links-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        .profile-links-anchor {
            min-width: 0;
            overflow-wrap: anywhere;
        }

        .profile-links-external {
            opacity: 0.6;
        }
    }

    .profile-links-editor {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .profile-links-actions {
        display: inline-flex;
        gap: 0.25rem;

        button {
            border: none;
            background: none;
            padding: 0.15rem 0.25rem;
            color: inherit;
            opacity: 0.55;

            &:hover {
                opacity: 1;
            }
        }
    }

    .profile-links-row .profile-links-actions {
        opacity: 0;
    }

    .profile-links-row:hover .profile-links-actions {
        opacity: 1;
    }

    .profile-links-error {
        font-size: 0.8rem;
        color: var(--color-galaxy-error, #a94442);
    }
}
</style>
