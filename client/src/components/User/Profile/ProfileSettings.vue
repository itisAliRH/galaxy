<script setup lang="ts">
import { faDice, faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BAlert, BFormGroup, BFormInput, BFormTextarea } from "bootstrap-vue";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";

import { GalaxyApi } from "@/api";
import { Toast } from "@/composables/toast";
import { useUserStore } from "@/stores/userStore";
import { errorMessageAsString } from "@/utils/simple-error";

import ProfileAvatar from "./ProfileAvatar.vue";
import GButton from "@/components/BaseComponents/GButton.vue";
import GCheckbox from "@/components/BaseComponents/GCheckbox.vue";
import AsyncButton from "@/components/Common/AsyncButton.vue";
import BreadcrumbHeading from "@/components/Common/BreadcrumbHeading.vue";
import LoadingSpan from "@/components/LoadingSpan.vue";

const breadcrumbItems = [{ title: "User Preferences", to: "/user" }, { title: "Public Profile" }];

/** Sections a user can show on their public page. Extend as cards land. */
const SECTIONS = [
    { key: "about", label: "About me", hint: "Description, affiliation, research interests, and links." },
    { key: "histories", label: "Published histories", hint: "Histories you have already published." },
    { key: "workflows", label: "Published workflows", hint: "Workflows you have already published." },
    { key: "pages", label: "Published pages", hint: "Galaxy pages you have already published." },
    { key: "visualizations", label: "Published visualizations", hint: "Visualizations you have already published." },
] as const;

const userStore = useUserStore();
const { currentUser } = storeToRefs(userStore);

const userId = computed(() => (currentUser.value && "id" in currentUser.value ? currentUser.value.id : undefined));
const username = computed(() =>
    currentUser.value && "username" in currentUser.value ? currentUser.value.username : "",
);

const loading = ref(false);
const errorMessage = ref<string | null>(null);

const published = ref(false);
const displayName = ref("");
const description = ref("");
const affiliation = ref("");
const researchInterests = ref("");
const orcid = ref("");
const avatarSeed = ref("");
const visibleSections = ref<Record<string, boolean>>({});

const profileUrl = computed(() => `/profile/${username.value}`);

function isSectionVisible(key: string) {
    return visibleSections.value[key] ?? true;
}

function toggleSection(key: string, value: boolean) {
    visibleSections.value = { ...visibleSections.value, [key]: value };
}

/** Shuffle the generated avatar; save persists the seed. */
function randomizeAvatar() {
    avatarSeed.value = crypto.randomUUID();
}

function resetAvatar() {
    avatarSeed.value = "";
}

async function loadProfile() {
    if (!userId.value) {
        return;
    }
    loading.value = true;
    try {
        const { data, error } = await GalaxyApi().GET("/api/users/{user_id}/profile", {
            params: { path: { user_id: userId.value } },
        });

        if (error) {
            errorMessage.value = errorMessageAsString(error);
            return;
        }

        published.value = data.published;
        displayName.value = data.display_name ?? "";
        description.value = data.description ?? "";
        affiliation.value = data.affiliation ?? "";
        researchInterests.value = data.research_interests ?? "";
        orcid.value = data.orcid ?? "";
        avatarSeed.value = data.avatar_seed ?? "";
        visibleSections.value = { ...(data.visible_sections ?? {}) };
    } finally {
        loading.value = false;
    }
}

async function saveProfile() {
    if (!userId.value) {
        return;
    }
    const { error } = await GalaxyApi().PUT("/api/users/{user_id}/profile", {
        params: { path: { user_id: userId.value } },
        body: {
            published: published.value,
            display_name: displayName.value || null,
            description: description.value || null,
            affiliation: affiliation.value || null,
            research_interests: researchInterests.value || null,
            orcid: orcid.value || null,
            avatar_seed: avatarSeed.value || null,
            visible_sections: visibleSections.value,
        },
    });

    if (error) {
        errorMessage.value = errorMessageAsString(error);
        return;
    }

    errorMessage.value = null;
    Toast.success("Public profile updated");
}

// The user store loads asynchronously on a direct page load; fetch the
// profile as soon as the current user id is available.
watch(userId, loadProfile, { immediate: true });
</script>

<template>
    <section class="profile-settings">
        <BreadcrumbHeading :items="breadcrumbItems" />

        <div v-localize class="profile-settings-description">
            Control whether you have a public profile page and what it shows. Your page only ever lists content you have
            already published.
        </div>

        <BAlert v-if="errorMessage" show dismissible fade variant="warning" @dismissed="errorMessage = null">
            {{ errorMessage }}
        </BAlert>

        <BAlert v-if="loading" class="m-2" show variant="info">
            <LoadingSpan message="Loading profile settings" />
        </BAlert>

        <div v-else class="profile-settings-body">
            <div class="card-container">
                <GCheckbox id="profile-published" v-model="published" toggle>
                    <span v-localize>Enable my public page</span>
                </GCheckbox>

                <div class="profile-url-hint">
                    <span v-if="published" v-localize>Anyone with the link can see it, signed in or not:</span>
                    <span v-else v-localize>When enabled, your page will be available at:</span>
                    <router-link v-if="published" :to="profileUrl" class="profile-url">{{ profileUrl }}</router-link>
                    <span v-else class="profile-url">{{ profileUrl }}</span>
                </div>
            </div>

            <div class="card-container">
                <h2 v-localize class="profile-settings-heading">About me</h2>

                <div class="profile-avatar-editor">
                    <ProfileAvatar :username="username || ''" :seed="avatarSeed || undefined" :size="96" />

                    <div class="profile-avatar-actions">
                        <div v-localize class="profile-avatar-hint">
                            Your avatar is generated — no upload needed. Shuffle until you like one.
                        </div>

                        <div>
                            <GButton id="profile-avatar-randomize" color="blue" size="small" @click="randomizeAvatar">
                                <FontAwesomeIcon :icon="faDice" />
                                <span v-localize>Randomize avatar</span>
                            </GButton>

                            <GButton
                                v-if="avatarSeed"
                                id="profile-avatar-reset"
                                color="grey"
                                size="small"
                                @click="resetAvatar">
                                <span v-localize>Reset to default</span>
                            </GButton>
                        </div>
                    </div>
                </div>

                <BFormGroup label="Display name" label-for="profile-display-name">
                    <BFormInput id="profile-display-name" v-model="displayName" :placeholder="username" />
                </BFormGroup>

                <BFormGroup
                    label="Description"
                    label-for="profile-description"
                    description="A short line shown under your name.">
                    <BFormTextarea id="profile-description" v-model="description" rows="2" no-resize />
                </BFormGroup>

                <BFormGroup label="Affiliation" label-for="profile-affiliation">
                    <BFormInput id="profile-affiliation" v-model="affiliation" />
                </BFormGroup>

                <BFormGroup label="Research interests" label-for="profile-research-interests">
                    <BFormTextarea id="profile-research-interests" v-model="researchInterests" rows="3" no-resize />
                </BFormGroup>

                <BFormGroup label="ORCID iD" label-for="profile-orcid" description="Format: 0000-0000-0000-0000.">
                    <BFormInput id="profile-orcid" v-model="orcid" placeholder="0000-0000-0000-0000" />
                </BFormGroup>
            </div>

            <div class="card-container">
                <h2 v-localize class="profile-settings-heading">Show on my page</h2>

                <div v-localize class="profile-sections-hint">
                    Hiding a section only removes it from your profile page. Published items stay published and remain
                    reachable at their own links.
                </div>

                <div v-for="section in SECTIONS" :key="section.key" class="profile-section-toggle">
                    <GCheckbox
                        :id="`profile-section-${section.key}`"
                        :value="isSectionVisible(section.key)"
                        toggle
                        @input="(value) => toggleSection(section.key, value)">
                        <span v-localize>{{ section.label }}</span>
                    </GCheckbox>

                    <div v-localize class="profile-section-hint">{{ section.hint }}</div>
                </div>
            </div>

            <div class="d-flex justify-content-center">
                <AsyncButton id="profile-settings-save" :action="saveProfile" :icon="faSave" color="blue" size="medium">
                    <span v-localize>Save</span>
                </AsyncButton>
            </div>
        </div>
    </section>
</template>

<style scoped lang="scss">
.profile-settings {
    .profile-settings-description {
        margin-bottom: 1rem;
    }

    .profile-settings-heading {
        font-size: 1.1rem;
        font-weight: 700;
        margin-bottom: 0.75rem;
    }

    .profile-url-hint {
        margin-top: 0.5rem;

        .profile-url {
            font-family: monospace;
            margin-left: 0.25rem;
        }
    }

    .profile-avatar-editor {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;

        .profile-avatar-actions {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .profile-avatar-hint {
            font-size: 0.85rem;
            opacity: 0.7;
        }
    }

    .profile-sections-hint {
        margin-bottom: 0.75rem;
    }

    .profile-section-toggle {
        margin-bottom: 0.75rem;

        .profile-section-hint {
            font-size: 0.85rem;
            opacity: 0.7;
            margin-left: 2.5rem;
        }
    }
}

.card-container {
    margin: 0.5rem 0;
    padding: 1rem;
    border: 1px solid #dee2e6;
    border-radius: 0.5rem;
}
</style>
