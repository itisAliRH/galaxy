<script setup lang="ts">
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
    faGithub,
    faGitlab,
    faLinkedin,
    faMastodon,
    faOrcid,
    faTwitter,
    faYoutube,
} from "@fortawesome/free-brands-svg-icons";
import {
    faCheck,
    faExternalLinkAlt,
    faGlobe,
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

/** Known services get their brand icon; everything else falls back to a globe. */
const BRAND_ICONS: [RegExp, IconDefinition][] = [
    [/(^|\.)github\.com$/, faGithub],
    [/(^|\.)gitlab\.com$/, faGitlab],
    [/(^|\.)linkedin\.com$/, faLinkedin],
    [/(^|\.)orcid\.org$/, faOrcid],
    [/(^|\.)(twitter|x)\.com$/, faTwitter],
    [/(^|\.)(youtube\.com|youtu\.be)$/, faYoutube],
    [/(^|\.)mastodon\./, faMastodon],
];

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
    /**
     * Maximum number of links a profile can hold (from instance configuration)
     * @default 10
     */
    maxLinks?: number;
}

const props = withDefaults(defineProps<Props>(), {
    editable: false,
    links: () => [],
    maxLinks: 10,
});

const emit = defineEmits<{
    (e: "update:links", value: UserProfileLink[]): void;
}>();

/** Index of the row being edited, links.length for a new row, null when idle. */
const editingIndex = ref<number | null>(null);
const draftLabel = ref("");
const draftUrl = ref("");
const draftError = ref<string | null>(null);

const canAdd = computed(() => props.links.length < props.maxLinks);

function hostname(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

function linkIcon(link: UserProfileLink): IconDefinition {
    const host = hostname(link.url);
    for (const [pattern, icon] of BRAND_ICONS) {
        if (pattern.test(host)) {
            return icon;
        }
    }
    return faGlobe;
}

/** The label is optional; the link's hostname stands in when it is empty. */
function linkLabel(link: UserProfileLink) {
    return link.label || hostname(link.url);
}

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
    if (!/^https?:\/\/.+/.test(url)) {
        draftError.value = "The URL must start with http:// or https://.";
        return;
    }
    const updated = [...props.links];
    updated.splice(editingIndex.value ?? updated.length, 1, { label: label || hostname(url), url });
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
    <div v-if="props.links.length > 0 || props.editable" class="profile-links d-flex flex-column">
        <template v-for="(link, index) in props.links">
            <div
                v-if="editingIndex !== index"
                :key="`link-${index}`"
                class="profile-links-row d-flex align-items-center">
                <FontAwesomeIcon :icon="linkIcon(link)" fixed-width />

                <a class="profile-links-anchor" :href="link.url" rel="noopener noreferrer" target="_blank">
                    {{ linkLabel(link) }}
                    <FontAwesomeIcon class="profile-links-external" :icon="faExternalLinkAlt" size="xs" />
                </a>

                <span v-if="props.editable" class="profile-links-actions d-inline-flex flex-gapx-1">
                    <GButton
                        color="grey"
                        size="small"
                        icon-only
                        transparent
                        title="Edit link"
                        aria-label="Edit link"
                        @click="startEdit(index)">
                        <FontAwesomeIcon :icon="faPencilAlt" fixed-width />
                    </GButton>

                    <GButton
                        color="grey"
                        size="small"
                        icon-only
                        transparent
                        title="Remove link"
                        aria-label="Remove link"
                        @click="removeLink(index)">
                        <FontAwesomeIcon :icon="faTrash" fixed-width />
                    </GButton>
                </span>
            </div>

            <div v-else :key="`link-edit-${index}`" class="profile-links-editor d-flex flex-column align-items-stretch">
                <BFormInput v-model="draftUrl" placeholder="https://…" size="sm" type="url" @keyup.enter="commitEdit" />

                <BFormInput v-model="draftLabel" placeholder="Label (optional)" size="sm" @keyup.enter="commitEdit" />

                <span class="profile-links-editor-actions d-inline-flex justify-content-end flex-gapx-1">
                    <GButton
                        color="grey"
                        size="small"
                        icon-only
                        transparent
                        title="Save link"
                        aria-label="Save link"
                        @click="commitEdit">
                        <FontAwesomeIcon :icon="faCheck" fixed-width />
                    </GButton>

                    <GButton
                        color="grey"
                        size="small"
                        icon-only
                        transparent
                        title="Cancel"
                        aria-label="Cancel"
                        @click="cancelEdit">
                        <FontAwesomeIcon :icon="faTimes" fixed-width />
                    </GButton>
                </span>
            </div>
        </template>

        <div
            v-if="editingIndex === props.links.length"
            class="profile-links-editor d-flex flex-column align-items-stretch">
            <BFormInput v-model="draftUrl" placeholder="https://…" size="sm" type="url" @keyup.enter="commitEdit" />

            <BFormInput v-model="draftLabel" placeholder="Label (optional)" size="sm" @keyup.enter="commitEdit" />

            <span class="profile-links-editor-actions d-inline-flex justify-content-end flex-gapx-1">
                <GButton
                    color="grey"
                    size="small"
                    icon-only
                    transparent
                    title="Save link"
                    aria-label="Save link"
                    @click="commitEdit">
                    <FontAwesomeIcon :icon="faCheck" fixed-width />
                </GButton>

                <GButton
                    color="grey"
                    size="small"
                    icon-only
                    transparent
                    title="Cancel"
                    aria-label="Cancel"
                    @click="cancelEdit">
                    <FontAwesomeIcon :icon="faTimes" fixed-width />
                </GButton>
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
    gap: 0.4rem;

    .profile-links-row {
        gap: 0.5rem;

        .profile-links-anchor {
            min-width: 0;
            overflow-wrap: anywhere;
        }

        .profile-links-external {
            opacity: 0.6;
        }
    }

    // The URL and label inputs stack so each gets a readable width.
    .profile-links-editor {
        gap: 0.35rem;
    }

    // GButton supplies the transparent background, padding, colour, and focus
    // ring; only the resting dimming of these secondary actions is local.
    .profile-links-actions,
    .profile-links-editor-actions {
        .g-button {
            opacity: 0.55;

            &:hover,
            &:focus-visible {
                opacity: 1;
            }
        }
    }

    .profile-links-row .profile-links-actions {
        opacity: 0;
    }

    .profile-links-row:hover .profile-links-actions,
    .profile-links-row:focus-within .profile-links-actions {
        opacity: 1;
    }

    .profile-links-error {
        font-size: 0.8rem;
        color: var(--color-galaxy-error, #a94442);
    }
}
</style>
