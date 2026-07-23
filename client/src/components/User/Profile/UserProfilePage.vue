<script setup lang="ts">
import { faPencilAlt, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BAlert } from "bootstrap-vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";

import { GalaxyApi } from "@/api";
import type { components } from "@/api/schema";
import { useUserStore } from "@/stores/userStore";

import ProfileHistoriesCard from "./ProfileHistoriesCard.vue";
import ProfileIdentity from "./ProfileIdentity.vue";
import Heading from "@/components/Common/Heading.vue";

type PublicUserProfile = components["schemas"]["PublicUserProfile"];

interface Props {
    /**
     * Username from the /profile/:username route
     */
    username: string;
}

const props = defineProps<Props>();

const userStore = useUserStore();
const { currentUser } = storeToRefs(userStore);

const loading = ref(true);
const notFound = ref(false);
const profile = ref<PublicUserProfile | null>(null);

const isOwner = computed(
    () =>
        currentUser.value !== null && "username" in currentUser.value && currentUser.value.username === props.username,
);

function sectionVisible(key: string) {
    return profile.value?.visible_sections?.[key] ?? true;
}

async function load() {
    const requested = props.username;
    loading.value = true;
    notFound.value = false;
    profile.value = null;
    try {
        const { data, error } = await GalaxyApi().GET("/api/profiles/{username}", {
            params: { path: { username: requested } },
        });

        // Ignore responses that arrive after navigating to another profile.
        if (requested !== props.username) {
            return;
        }

        if (error) {
            notFound.value = true;
            return;
        }

        profile.value = data;
    } finally {
        if (requested === props.username) {
            loading.value = false;
        }
    }
}

onMounted(load);

watch(() => props.username, load);
</script>

<template>
    <div class="gx-brand user-profile-page">
        <div class="user-profile-layout">
            <div v-if="loading" class="user-profile-state">
                <Heading h1 size="lg"><FontAwesomeIcon :icon="faSpinner" spin /> Loading profile</Heading>
            </div>

            <div v-else-if="notFound || !profile" class="user-profile-state">
                <Heading h1 size="lg">No public profile</Heading>

                <BAlert show variant="info">
                    There is no public profile page for this username. The user may not have enabled their page, or the
                    page may not exist.
                </BAlert>
            </div>

            <template v-else>
                <aside class="user-profile-rail">
                    <ProfileIdentity :profile="profile" />

                    <router-link v-if="isOwner" class="gx-cta user-profile-edit" to="/user/profile-settings">
                        <FontAwesomeIcon :icon="faPencilAlt" />
                        Edit profile
                    </router-link>
                </aside>

                <main class="user-profile-content">
                    <ProfileHistoriesCard v-if="sectionVisible('histories')" :username="props.username" />

                    <div class="gx-callout">
                        Published workflows, pages, and visualizations will appear here as those sections land.
                    </div>
                </main>
            </template>
        </div>
    </div>
</template>

<style scoped lang="scss">
@import "@/style/scss/_breakpoints.scss";

.user-profile-page {
    height: 100%;
    overflow: auto;
    padding: 1.5rem;
}

.user-profile-layout {
    display: flex;
    gap: 2rem;
    max-width: 1180px;
    margin: 0 auto;

    .user-profile-state {
        flex: 1;
    }

    .user-profile-rail {
        flex: 0 0 260px;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .user-profile-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .user-profile-edit {
        text-align: center;
    }

    @media (max-width: $breakpoint-md) {
        flex-direction: column;

        .user-profile-rail {
            flex: none;
        }
    }
}
</style>
