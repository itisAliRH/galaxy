<script setup lang="ts">
import { faBuilding, faDice, faExternalLinkAlt, faEye, faEyeSlash, faUndo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { computed, ref } from "vue";

import type { components } from "@/api/schema";
import { orcidUrl, validateOrcid } from "@/utils/orcid";

import ProfileAvatar from "./ProfileAvatar.vue";
import ProfileLinksEditor from "./ProfileLinksEditor.vue";
import ClickToEdit from "@/components/Collections/common/ClickToEdit.vue";

type PublicUserProfile = components["schemas"]["PublicUserProfile"];
type UserProfileLink = components["schemas"]["UserProfileLink"];
type UserProfileUpdatePayload = components["schemas"]["UserProfileUpdatePayload"];

interface Props {
    /**
     * The profile to render (the owner's detail view or the public view)
     */
    profile: PublicUserProfile;
    /**
     * Whether the owner is viewing: turns every element into an inline editor
     * @default false
     */
    editable?: boolean;
    /**
     * Maximum number of external links (from instance configuration)
     * @default 10
     */
    maxLinks?: number;
    /**
     * Persists changed fields; resolves to an error message or null.
     * Required when editable.
     * @default undefined
     */
    save?: (fields: Partial<UserProfileUpdatePayload>) => Promise<string | null>;
}

const props = withDefaults(defineProps<Props>(), {
    editable: false,
    maxLinks: 10,
    save: undefined,
});

const emit = defineEmits<{
    (e: "toggle-about", value: boolean): void;
}>();

const orcidError = ref<string | null>(null);

const displayName = computed(() => props.profile.display_name || props.profile.username);
const showHandle = computed(() => displayName.value !== props.profile.username);
const orcidLink = computed(() => (props.profile.orcid ? orcidUrl(props.profile.orcid) : null));
const links = computed(() => props.profile.links ?? []);
const aboutVisible = computed(() => props.profile.visible_sections?.about ?? true);
const showAbout = computed(() => aboutVisible.value || props.editable);
const aboutToggleLabel = computed(() =>
    aboutVisible.value ? "Visible to everyone — click to hide" : "Hidden from your page — click to show",
);

async function saveField(fields: Partial<UserProfileUpdatePayload>) {
    if (props.save) {
        await props.save(fields);
    }
}

function onDisplayNameInput(value: string) {
    saveField({ display_name: value.trim() || null });
}

function onDescriptionInput(value: string) {
    saveField({ description: value.trim() || null });
}

function onAffiliationInput(value: string) {
    saveField({ affiliation: value.trim() || null });
}

function onInterestsInput(value: string) {
    saveField({ research_interests: value.trim() || null });
}

async function onOrcidInput(value: string) {
    const trimmed = value.trim();
    orcidError.value = validateOrcid(trimmed);
    if (orcidError.value || !props.save) {
        return;
    }
    orcidError.value = await props.save({ orcid: trimmed || null });
}

function onLinksUpdate(value: UserProfileLink[]) {
    saveField({ links: value });
}

/** Shuffle the generated avatar; the seed persists so every visitor sees the same one. */
function randomizeAvatar() {
    saveField({ avatar_seed: crypto.randomUUID() });
}

function resetAvatar() {
    saveField({ avatar_seed: null });
}
</script>

<template>
    <div class="profile-identity d-flex flex-column">
        <div class="profile-identity-avatar position-relative align-self-center">
            <ProfileAvatar
                :username="props.profile.username"
                :seed="props.profile.avatar_seed ?? undefined"
                :size="180" />

            <div v-if="props.editable" class="profile-identity-avatar-actions position-absolute d-flex flex-gapx-1">
                <button
                    class="border-0 rounded-circle"
                    type="button"
                    title="Shuffle avatar"
                    aria-label="Shuffle avatar"
                    @click="randomizeAvatar">
                    <FontAwesomeIcon :icon="faDice" fixed-width />
                </button>

                <button
                    v-if="props.profile.avatar_seed"
                    class="border-0 rounded-circle"
                    type="button"
                    title="Reset avatar to default"
                    aria-label="Reset avatar to default"
                    @click="resetAvatar">
                    <FontAwesomeIcon :icon="faUndo" fixed-width />
                </button>
            </div>
        </div>

        <ClickToEdit
            v-if="props.editable"
            class="profile-identity-name font-weight-bold border-bottom-0 mt-2 mb-0 pb-0"
            component="h1"
            title="Add a display name"
            :value="props.profile.display_name || ''"
            @input="onDisplayNameInput" />
        <h1 v-else class="profile-identity-name font-weight-bold border-bottom-0 mt-2 mb-0 pb-0">{{ displayName }}</h1>

        <div v-if="showHandle || props.editable" class="profile-identity-handle">{{ props.profile.username }}</div>

        <div
            v-if="props.editable"
            class="profile-identity-about-header d-flex align-items-center justify-content-between mt-2">
            <span v-localize class="profile-identity-about-title font-weight-bold text-uppercase">About</span>

            <button
                class="profile-identity-eye border-0 p-1"
                type="button"
                :title="aboutToggleLabel"
                :aria-label="aboutToggleLabel"
                @click="emit('toggle-about', !aboutVisible)">
                <FontAwesomeIcon :icon="aboutVisible ? faEye : faEyeSlash" fixed-width />
            </button>
        </div>

        <div v-if="props.editable && !aboutVisible" v-localize class="profile-identity-hidden-note font-italic">
            Hidden — only you can see this section.
        </div>

        <template v-if="showAbout">
            <div
                class="profile-identity-about d-flex flex-column"
                :class="{ 'profile-identity-about-dimmed': !aboutVisible }">
                <ClickToEdit
                    v-if="props.editable"
                    class="profile-identity-description mt-1 mb-0"
                    component="p"
                    multiline
                    title="Add a short description"
                    :value="props.profile.description || ''"
                    @input="onDescriptionInput" />
                <p v-else-if="props.profile.description" class="profile-identity-description mt-1 mb-0">
                    {{ props.profile.description }}
                </p>

                <hr
                    v-if="props.editable || props.profile.affiliation || orcidLink || links.length > 0"
                    class="profile-identity-rule w-100 my-2" />

                <div class="profile-identity-meta d-flex flex-column">
                    <div
                        v-if="props.editable || props.profile.affiliation"
                        class="profile-identity-row d-flex align-items-center">
                        <FontAwesomeIcon :icon="faBuilding" fixed-width />

                        <ClickToEdit
                            v-if="props.editable"
                            title="Add your affiliation"
                            :value="props.profile.affiliation || ''"
                            @input="onAffiliationInput" />
                        <span v-else>{{ props.profile.affiliation }}</span>
                    </div>

                    <div v-if="props.editable || orcidLink" class="profile-identity-row d-flex align-items-center">
                        <span
                            class="profile-identity-orcid-badge d-inline-flex align-items-center justify-content-center rounded-circle font-weight-bold"
                            aria-hidden="true"
                            >iD</span
                        >

                        <ClickToEdit
                            v-if="props.editable"
                            class="profile-identity-orcid"
                            title="Add your ORCID iD"
                            :value="props.profile.orcid || ''"
                            @input="onOrcidInput" />
                        <a
                            v-else-if="orcidLink"
                            class="profile-identity-orcid"
                            :href="orcidLink"
                            rel="noopener noreferrer"
                            target="_blank">
                            {{ props.profile.orcid }}
                            <FontAwesomeIcon class="profile-identity-external" :icon="faExternalLinkAlt" size="xs" />
                        </a>
                    </div>

                    <div v-if="orcidError" class="profile-identity-error">{{ orcidError }}</div>

                    <a
                        v-if="props.editable && orcidLink && !orcidError"
                        class="profile-identity-orcid-preview"
                        :href="orcidLink"
                        rel="noopener noreferrer"
                        target="_blank">
                        View ORCID record
                        <FontAwesomeIcon class="profile-identity-external" :icon="faExternalLinkAlt" size="xs" />
                    </a>

                    <ProfileLinksEditor
                        :editable="props.editable"
                        :links="links"
                        :max-links="props.maxLinks"
                        @update:links="onLinksUpdate" />
                </div>

                <ClickToEdit
                    v-if="props.editable"
                    class="profile-identity-interests mt-2 mb-0"
                    component="p"
                    multiline
                    title="Add your research interests"
                    :value="props.profile.research_interests || ''"
                    @input="onInterestsInput" />
                <p v-else-if="props.profile.research_interests" class="profile-identity-interests mt-2 mb-0">
                    {{ props.profile.research_interests }}
                </p>
            </div>
        </template>
    </div>
</template>

<style scoped lang="scss">
.profile-identity {
    gap: 0.5rem;

    .profile-identity-avatar {
        .profile-identity-avatar-actions {
            // Pins the overlay to the avatar's lower-right corner.
            right: 0.5rem;
            bottom: 0.5rem;

            button {
                background: rgba(255, 255, 255, 0.9);
                box-shadow: 0 1px 3px rgba(44, 49, 67, 0.3);
                padding: 0.4rem;
                color: var(--color-galaxy-dark);
            }
        }
    }

    .profile-identity-name {
        font-size: 1.5rem;
        color: var(--color-galaxy-dark);
    }

    .profile-identity-handle {
        // GitHub-style: the handle sits tight under the display name, closing
        // most of the column's 0.5rem gap. No Bootstrap negative-margin
        // utility exists in 4.6, so this stays custom.
        margin-top: -0.35rem;
        font-size: 1.1rem;
        opacity: 0.75;
    }

    .profile-identity-about-header {
        .profile-identity-about-title {
            font-size: 0.8rem;
            letter-spacing: 0.05em;
            opacity: 0.6;
        }
    }

    .profile-identity-eye {
        background: none;
        color: inherit;
        opacity: 0.6;

        &:hover {
            opacity: 1;
        }
    }

    .profile-identity-hidden-note {
        font-size: 0.85rem;
        opacity: 0.7;
    }

    .profile-identity-about {
        gap: 0.5rem;

        &.profile-identity-about-dimmed {
            opacity: 0.55;
        }
    }

    .profile-identity-rule {
        // `border-0` is `!important` and would wipe out the rule line below.
        border: 0;
        border-top: 1px solid rgba(37, 83, 123, 0.15);
    }

    .profile-identity-meta {
        gap: 0.4rem;
        font-size: 0.9rem;

        .profile-identity-row {
            gap: 0.5rem;
        }

        .profile-identity-orcid-badge {
            width: 1.25rem;
            height: 1.25rem;
            border: 1px solid rgba(37, 83, 123, 0.3);
            font-size: 0.6rem;
            flex: none;
        }

        // Atkinson Hyperlegible's slashed zeros read as a strike-through next
        // to the hyphens; spacing the glyphs apart breaks the illusion.
        .profile-identity-orcid {
            font-variant-numeric: lining-nums tabular-nums;
            letter-spacing: 0.08em;
        }

        .profile-identity-orcid-preview {
            font-size: 0.8rem;
            margin-left: 1.75rem;
        }

        .profile-identity-error {
            font-size: 0.8rem;
            color: var(--color-galaxy-error, #a94442);
            margin-left: 1.75rem;
        }
    }

    .profile-identity-external {
        opacity: 0.6;
    }

    .profile-identity-interests {
        font-size: 0.9rem;
    }
}
</style>
