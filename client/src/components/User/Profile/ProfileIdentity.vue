<script setup lang="ts">
import { faBuilding, faLink } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { computed } from "vue";

import type { components } from "@/api/schema";

import ProfileAvatar from "./ProfileAvatar.vue";

type PublicUserProfile = components["schemas"]["PublicUserProfile"];

interface Props {
    /**
     * The public profile to render
     */
    profile: PublicUserProfile;
}

const props = defineProps<Props>();

const displayName = computed(() => props.profile.display_name || props.profile.username);
const showHandle = computed(() => displayName.value !== props.profile.username);
const orcidUrl = computed(() => (props.profile.orcid ? `https://orcid.org/${props.profile.orcid}` : null));
const links = computed(() => props.profile.links ?? []);
const showAbout = computed(() => props.profile.visible_sections?.about ?? true);
</script>

<template>
    <div class="profile-identity">
        <ProfileAvatar :username="props.profile.username" :seed="props.profile.avatar_seed ?? undefined" :size="180" />

        <h1 class="profile-identity-name">{{ displayName }}</h1>

        <div v-if="showHandle" class="profile-identity-handle">{{ props.profile.username }}</div>

        <p v-if="showAbout && props.profile.description" class="profile-identity-description">
            {{ props.profile.description }}
        </p>

        <hr class="profile-identity-rule" />

        <div v-if="showAbout" class="profile-identity-meta">
            <div v-if="props.profile.affiliation" class="profile-identity-row">
                <FontAwesomeIcon :icon="faBuilding" fixed-width />
                <span>{{ props.profile.affiliation }}</span>
            </div>

            <div v-if="orcidUrl" class="profile-identity-row">
                <span class="profile-identity-orcid-badge" aria-hidden="true">iD</span>
                <a :href="orcidUrl" rel="noopener noreferrer" target="_blank">{{ props.profile.orcid }}</a>
            </div>

            <div v-for="link in links" :key="link.url" class="profile-identity-row">
                <FontAwesomeIcon :icon="faLink" fixed-width />
                <a :href="link.url" rel="noopener noreferrer" target="_blank">{{ link.label }}</a>
            </div>
        </div>

        <p v-if="showAbout && props.profile.research_interests" class="profile-identity-interests">
            {{ props.profile.research_interests }}
        </p>
    </div>
</template>

<style scoped lang="scss">
.profile-identity {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    .profile-identity-name {
        font-size: 1.5rem;
        margin: 0.5rem 0 0;
        border-bottom: none;
        padding-bottom: 0;
    }

    .profile-identity-handle {
        font-size: 1.1rem;
        opacity: 0.75;
    }

    .profile-identity-description {
        margin: 0.25rem 0 0;
    }

    .profile-identity-rule {
        width: 100%;
        margin: 0.5rem 0;
        border: 0;
        border-top: 1px solid rgba(37, 83, 123, 0.15);
    }

    .profile-identity-meta {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        font-size: 0.9rem;

        .profile-identity-row {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .profile-identity-orcid-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 1.25rem;
            height: 1.25rem;
            border-radius: 50%;
            border: 1px solid rgba(37, 83, 123, 0.3);
            font-size: 0.6rem;
            font-weight: 700;
            flex: none;
        }
    }

    .profile-identity-interests {
        font-size: 0.9rem;
        margin: 0.5rem 0 0;
    }
}
</style>
