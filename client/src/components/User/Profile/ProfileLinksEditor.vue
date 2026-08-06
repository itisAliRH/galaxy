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
import { faExternalLinkAlt, faGlobe, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BFormInput } from "bootstrap-vue";
import { computed, ref, watch } from "vue";

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
     * Whether the owner is viewing: renders every link as an editable row
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

/**
 * Editable rows, including the half-typed ones. Only rows with a usable URL
 * are emitted, so a row being typed into never truncates the saved list.
 */
const rows = ref<UserProfileLink[]>(props.links.map((link) => ({ ...link })));

watch(
    () => props.links,
    (links) => {
        // ignore the echo of our own emit; adopt anything else (load, cancel)
        if (JSON.stringify(links) !== JSON.stringify(validRows())) {
            rows.value = links.map((link) => ({ ...link }));
        }
    },
);

const canAdd = computed(() => rows.value.length < props.maxLinks);

function hostname(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

function isUsable(link: UserProfileLink) {
    return /^https?:\/\/.+/.test(link.url.trim());
}

function validRows(): UserProfileLink[] {
    return rows.value
        .filter(isUsable)
        .map((link) => ({ url: link.url.trim(), label: link.label.trim() || hostname(link.url.trim()) }));
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

function commit() {
    emit("update:links", validRows());
}

function onUrlInput(index: number, value: string) {
    const row = rows.value[index];
    if (row) {
        row.url = value;
        commit();
    }
}

function onLabelInput(index: number, value: string) {
    const row = rows.value[index];
    if (row) {
        row.label = value;
        commit();
    }
}

function addRow() {
    rows.value.push({ label: "", url: "" });
}

function removeRow(index: number) {
    rows.value.splice(index, 1);
    commit();
}
</script>

<template>
    <div v-if="props.editable" class="profile-links d-flex flex-column">
        <!-- every link is a live input pair; the label is optional and falls
             back to the URL's hostname -->
        <div v-for="(row, index) in rows" :key="index" class="profile-links-editor d-flex flex-column">
            <div class="profile-links-editor-url d-flex align-items-center">
                <FontAwesomeIcon :icon="linkIcon(row)" fixed-width />

                <BFormInput
                    class="flex-fill"
                    placeholder="https://…"
                    size="sm"
                    type="url"
                    :value="row.url"
                    @update="onUrlInput(index, $event)" />

                <GButton
                    color="grey"
                    size="small"
                    icon-only
                    transparent
                    title="Remove link"
                    aria-label="Remove link"
                    @click="removeRow(index)">
                    <FontAwesomeIcon :icon="faTrash" fixed-width />
                </GButton>
            </div>

            <BFormInput
                class="profile-links-editor-label"
                placeholder="Label (optional)"
                size="sm"
                :value="row.label"
                @update="onLabelInput(index, $event)" />
        </div>

        <GButton v-if="canAdd" id="profile-links-add" color="grey" size="small" transparent @click="addRow">
            <FontAwesomeIcon :icon="faPlus" />
            <span v-localize>Add link</span>
        </GButton>
    </div>

    <div v-else-if="props.links.length > 0" class="profile-links d-flex flex-column">
        <div v-for="(link, index) in props.links" :key="index" class="profile-links-row d-flex align-items-center">
            <FontAwesomeIcon :icon="linkIcon(link)" fixed-width />

            <a class="profile-links-anchor" :href="link.url" rel="noopener noreferrer" target="_blank">
                {{ linkLabel(link) }}
                <FontAwesomeIcon class="profile-links-external" :icon="faExternalLinkAlt" size="xs" />
            </a>
        </div>
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

    .profile-links-editor {
        gap: 0.25rem;

        .profile-links-editor-url {
            gap: 0.35rem;
        }

        // aligns the label input under the URL input, past the brand icon
        .profile-links-editor-label {
            margin-left: 1.6rem;
            width: auto;
        }
    }
}
</style>
