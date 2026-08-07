<script setup lang="ts">
import { faBuilding, faExternalLinkAlt, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BFormGroup, BFormInput, BFormTextarea } from "bootstrap-vue";
import { computed, ref } from "vue";

import type { components } from "@/api/schema";
import { useUid } from "@/composables/utils/uid";
import { ORCID_FORMAT, orcidUrl, validateOrcid } from "@/utils/orcid";

import ProfileLinksEditor from "./ProfileLinksEditor.vue";
import GButton from "@/components/BaseComponents/GButton.vue";
import UserAvatar from "@/components/Common/UserAvatar.vue";

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

const nameId = useUid("profile-name-");
const bioId = useUid("profile-bio-");
const affiliationId = useUid("profile-affiliation-");
const interestsId = useUid("profile-interests-");
const orcidId = useUid("profile-orcid-");

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
</script>

<template>
    <div class="profile-identity d-flex flex-column">
        <div class="profile-identity-avatar align-self-center">
            <UserAvatar :email-hash="props.profile.email_hash" :alt="props.profile.username" :size="180" />
        </div>

        <div v-if="props.editable" class="profile-identity-avatar-hint text-center">
            <span v-localize>Your picture comes from</span>
            <a href="https://gravatar.com" rel="noopener noreferrer" target="_blank">
                Gravatar
                <FontAwesomeIcon class="profile-identity-external" :icon="faExternalLinkAlt" size="xs" />
            </a>
        </div>

        <!-- Edit mode is a plain form: every field is an input from the start,
             the way GitHub's profile sidebar behaves. -->
        <template v-if="props.editable">
            <BFormGroup label="Name" :label-for="nameId" class="mt-2 mb-2">
                <BFormInput
                    :id="nameId"
                    :placeholder="props.profile.username"
                    size="sm"
                    :value="props.profile.display_name ?? ''"
                    @update="onDisplayNameInput" />
            </BFormGroup>

            <div class="profile-identity-handle">{{ props.profile.username }}</div>

            <slot name="actions" />

            <div class="profile-identity-about-header d-flex align-items-center justify-content-between mt-2">
                <span v-localize class="profile-identity-about-title font-weight-bold text-uppercase">About</span>

                <GButton
                    class="profile-identity-eye"
                    color="grey"
                    size="medium"
                    icon-only
                    transparent
                    :title="aboutToggleLabel"
                    :aria-label="aboutToggleLabel"
                    @click="emit('toggle-about', !aboutVisible)">
                    <FontAwesomeIcon :icon="aboutVisible ? faEye : faEyeSlash" fixed-width />
                </GButton>
            </div>

            <div v-if="!aboutVisible" v-localize class="profile-identity-hidden-note font-italic">
                Hidden — only you can see this section.
            </div>

            <div
                class="profile-identity-about d-flex flex-column"
                :class="{ 'profile-identity-about-dimmed': !aboutVisible }">
                <BFormGroup label="Bio" :label-for="bioId" class="mb-2">
                    <BFormTextarea
                        :id="bioId"
                        no-resize
                        placeholder="A short line shown under your name"
                        rows="3"
                        size="sm"
                        :value="props.profile.description ?? ''"
                        @update="onDescriptionInput" />
                </BFormGroup>

                <BFormGroup label="Affiliation" :label-for="affiliationId" class="mb-2">
                    <BFormInput
                        :id="affiliationId"
                        size="sm"
                        :value="props.profile.affiliation ?? ''"
                        @update="onAffiliationInput" />
                </BFormGroup>

                <BFormGroup label="Research interests" :label-for="interestsId" class="mb-2">
                    <BFormTextarea
                        :id="interestsId"
                        no-resize
                        rows="3"
                        size="sm"
                        :value="props.profile.research_interests ?? ''"
                        @update="onInterestsInput" />
                </BFormGroup>

                <BFormGroup label="ORCID iD" :label-for="orcidId" class="mb-2">
                    <BFormInput
                        :id="orcidId"
                        :placeholder="ORCID_FORMAT"
                        size="sm"
                        :state="orcidError ? false : null"
                        :value="props.profile.orcid ?? ''"
                        @update="onOrcidInput" />

                    <div v-if="orcidError" class="profile-identity-error">{{ orcidError }}</div>

                    <a
                        v-else-if="orcidLink"
                        class="profile-identity-orcid-preview"
                        :href="orcidLink"
                        rel="noopener noreferrer"
                        target="_blank">
                        View ORCID record
                        <FontAwesomeIcon class="profile-identity-external" :icon="faExternalLinkAlt" size="xs" />
                    </a>
                </BFormGroup>

                <BFormGroup label="Links" class="mb-0">
                    <ProfileLinksEditor
                        editable
                        :links="links"
                        :max-links="props.maxLinks"
                        @update:links="onLinksUpdate" />
                </BFormGroup>
            </div>
        </template>

        <template v-else>
            <h1 class="profile-identity-name font-weight-bold border-bottom-0 mt-2 mb-0 pb-0">{{ displayName }}</h1>

            <div v-if="showHandle" class="profile-identity-handle">{{ props.profile.username }}</div>

            <p v-if="showAbout && props.profile.description" class="profile-identity-description mt-1 mb-0">
                {{ props.profile.description }}
            </p>

            <slot name="actions" />

            <template v-if="showAbout">
                <hr
                    v-if="props.profile.affiliation || orcidLink || links.length > 0"
                    class="profile-identity-rule w-100 my-2" />

                <div class="profile-identity-meta d-flex flex-column">
                    <div v-if="props.profile.affiliation" class="profile-identity-row d-flex align-items-center">
                        <FontAwesomeIcon :icon="faBuilding" fixed-width />

                        <span>{{ props.profile.affiliation }}</span>
                    </div>

                    <div v-if="orcidLink" class="profile-identity-row d-flex align-items-center">
                        <span
                            class="profile-identity-orcid-badge d-inline-flex align-items-center justify-content-center rounded-circle font-weight-bold"
                            aria-hidden="true"
                            >iD</span
                        >

                        <a class="profile-identity-orcid" :href="orcidLink" rel="noopener noreferrer" target="_blank">
                            {{ props.profile.orcid }}
                            <FontAwesomeIcon class="profile-identity-external" :icon="faExternalLinkAlt" size="xs" />
                        </a>
                    </div>

                    <ProfileLinksEditor :links="links" :max-links="props.maxLinks" />
                </div>

                <p v-if="props.profile.research_interests" class="profile-identity-interests mt-2 mb-0">
                    {{ props.profile.research_interests }}
                </p>
            </template>
        </template>
    </div>
</template>

<style scoped lang="scss">
.profile-identity {
    gap: 0.5rem;

    .profile-identity-avatar-hint {
        font-size: 0.8rem;
        opacity: 0.75;
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
        opacity: 0.6;

        &:hover,
        &:focus-visible {
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
