<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";

import { GalaxyApi } from "@/api";
import { Toast } from "@/composables/toast";
import { useUserStore } from "@/stores/userStore";
import { errorMessageAsString } from "@/utils/simple-error";

import GAlert from "@/components/BaseComponents/GAlert.vue";
import GCheckbox from "@/components/BaseComponents/GCheckbox.vue";
import BreadcrumbHeading from "@/components/Common/BreadcrumbHeading.vue";
import LoadingSpan from "@/components/LoadingSpan.vue";

const breadcrumbItems = [{ title: "User Preferences", to: "/user" }, { title: "Public Profile" }];

const userStore = useUserStore();
const { currentUser } = storeToRefs(userStore);

const userId = computed(() => (currentUser.value && "id" in currentUser.value ? currentUser.value.id : undefined));
const username = computed(() =>
    currentUser.value && "username" in currentUser.value ? currentUser.value.username : "",
);

// starts true so the body never renders with a username-less URL before the
// user store hydrates
const loading = ref(true);
const errorMessage = ref<string | null>(null);

const published = ref(false);

const profilePath = computed(() => `/profile/${username.value}`);
const profileUrl = computed(() => `${window.location.origin}${profilePath.value}`);

async function loadProfile() {
    if (!userId.value) {
        return;
    }
    try {
        const { data, error } = await GalaxyApi().GET("/api/users/{user_id}/profile", {
            params: { path: { user_id: userId.value } },
        });

        if (error) {
            errorMessage.value = errorMessageAsString(error);
            return;
        }

        published.value = data.published;
    } finally {
        loading.value = false;
    }
}

/** Toggling publishes immediately; only `published` is sent so no other profile field is modified. */
async function onTogglePublished(value: boolean) {
    if (!userId.value) {
        return;
    }
    published.value = value;

    const { error } = await GalaxyApi().PUT("/api/users/{user_id}/profile", {
        params: { path: { user_id: userId.value } },
        body: { published: value },
    });

    if (error) {
        published.value = !value;
        Toast.error(errorMessageAsString(error));
        return;
    }

    Toast.success(value ? "Public profile enabled" : "Public profile disabled");
}

// The user store loads asynchronously on a direct page load; fetch the
// profile as soon as the current user id is available.
watch(userId, loadProfile, { immediate: true });
</script>

<template>
    <section class="profile-settings">
        <BreadcrumbHeading :items="breadcrumbItems" />

        <div v-localize class="profile-settings-description mb-3">
            Control whether you have a public profile page. Your page only ever lists content you have already
            published.
        </div>

        <GAlert v-if="errorMessage" dismissible fade variant="warning" @dismissed="errorMessage = null">
            {{ errorMessage }}
        </GAlert>

        <GAlert v-if="loading" class="m-2" variant="info">
            <LoadingSpan message="Loading profile settings" />
        </GAlert>

        <div v-else class="profile-settings-body">
            <div class="card-container my-2 p-3">
                <GCheckbox id="profile-published" toggle :value="published" @input="onTogglePublished">
                    <span v-localize>Enable my public page</span>
                </GCheckbox>

                <div class="profile-url-hint mt-2">
                    <span v-if="published" v-localize>Anyone with the link can see it, signed in or not:</span>
                    <span v-else v-localize>Only you can see it until you enable your page:</span>
                    <router-link class="profile-url ml-1" :to="profilePath">{{ profileUrl }}</router-link>
                </div>

                <div class="profile-username-hint">
                    <span v-localize>
                        Your page address comes from your public name (username). To change it, edit the Public name
                        field in
                    </span>
                    <router-link to="/user/information">Manage Information</router-link>.
                </div>
            </div>

            <div class="profile-edit-hint mt-2">
                <span v-localize>
                    To change what your page shows — avatar, description, links, and sections — open your page and edit
                    it directly.
                </span>
                <router-link :to="profilePath">Open my page</router-link>
            </div>
        </div>
    </section>
</template>

<style scoped lang="scss">
.profile-settings {
    .profile-url-hint {
        .profile-url {
            font-family: monospace;
        }
    }

    .profile-username-hint,
    .profile-edit-hint {
        font-size: 0.85rem;
        opacity: 0.7;
    }

    .profile-username-hint {
        margin-top: 0.75rem;
    }
}

.card-container {
    border: 1px solid #dee2e6;
    border-radius: 0.5rem;
}
</style>
