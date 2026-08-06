<script setup lang="ts">
import { faCog, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BAlert } from "bootstrap-vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, set, watch } from "vue";
import draggable from "vuedraggable";

import { GalaxyApi } from "@/api";
import type { components } from "@/api/schema";
import { Toast } from "@/composables/toast";
import { useUserStore } from "@/stores/userStore";
import { validationErrorMessage } from "@/utils/validation-errors";

import { DEFAULT_SECTION_ORDER, PROFILE_SECTIONS, type ProfileSectionDefinition } from "./sections";

import ProfileIdentity from "./ProfileIdentity.vue";
import ProfileListCard from "./ProfileListCard.vue";
import GButton from "@/components/BaseComponents/GButton.vue";
import Heading from "@/components/Common/Heading.vue";

type PublicUserProfile = components["schemas"]["PublicUserProfile"];
type UserProfileDetail = components["schemas"]["UserProfileDetail"];
type UserProfileLayout = components["schemas"]["UserProfileLayout"];
type UserProfileSectionLayout = components["schemas"]["UserProfileSectionLayout"];
type UserProfileUpdatePayload = components["schemas"]["UserProfileUpdatePayload"];

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
const profile = ref<(PublicUserProfile & Partial<UserProfileDetail>) | null>(null);
/** Which sections reported having published items, keyed by section key. */
const sectionHasContent = ref<Record<string, boolean>>({});

const userId = computed(() =>
    currentUser.value && "id" in currentUser.value ? (currentUser.value.id as string) : undefined,
);
const isOwner = computed(
    () =>
        currentUser.value !== null && "username" in currentUser.value && currentUser.value.username === props.username,
);
/** Owner mode needs the id for the self-scoped API, not just a username match. */
const ownerMode = computed(() => isOwner.value && userId.value !== undefined && profile.value !== null);

const isUnpublished = computed(() => ownerMode.value && profile.value?.published === false);

const layout = computed<UserProfileLayout>(() => profile.value?.layout ?? {});

const sectionOrder = computed(() => {
    const stored = (layout.value.section_order ?? []).filter((key) => DEFAULT_SECTION_ORDER.includes(key));
    const missing = DEFAULT_SECTION_ORDER.filter((key) => !stored.includes(key));
    return [...stored, ...missing];
});

/** Sections in display order; visitors only get the visible ones. */
const displaySections = computed({
    get: () => {
        const ordered = sectionOrder.value
            .map((key) => PROFILE_SECTIONS.find((section) => section.key === key))
            .filter((section): section is ProfileSectionDefinition => section !== undefined);
        return ordered.filter((section) => isOwner.value || sectionVisible(section.key));
    },
    set: (reordered: ProfileSectionDefinition[]) => {
        saveLayout({ section_order: reordered.map((section) => section.key) });
    },
});

/** Visitors get the identity centered when nothing else renders. */
const soloIdentity = computed(
    () => !isOwner.value && !displaySections.value.some((section) => sectionHasContent.value[section.key]),
);

function sectionVisible(key: string) {
    return profile.value?.visible_sections?.[key] ?? true;
}

function sectionLayout(key: string): UserProfileSectionLayout | undefined {
    return layout.value.sections?.[key];
}

async function load() {
    const requested = props.username;
    loading.value = true;
    notFound.value = false;
    profile.value = null;
    sectionHasContent.value = {};
    try {
        if (isOwner.value && userId.value) {
            await loadOwn(requested);
        } else {
            await loadPublic(requested);
        }
    } finally {
        if (requested === props.username) {
            loading.value = false;
        }
    }
}

/** The owner sees their page even before it is published. */
async function loadOwn(requested: string) {
    const { data, error } = await GalaxyApi().GET("/api/users/{user_id}/profile", {
        params: { path: { user_id: userId.value as string } },
    });

    // Ignore responses that arrive after navigating to another profile.
    if (requested !== props.username) {
        return;
    }

    if (error) {
        notFound.value = true;
        return;
    }

    profile.value = { ...data, username: data.username ?? requested };
}

async function loadPublic(requested: string) {
    const { data, error } = await GalaxyApi().GET("/api/profiles/{username}", {
        params: { path: { username: requested } },
    });

    if (requested !== props.username) {
        return;
    }

    if (error) {
        notFound.value = true;
        return;
    }

    profile.value = data;
}

/** Persist changed fields; resolves to a display-ready error message or null. */
async function saveFields(fields: Partial<UserProfileUpdatePayload>): Promise<string | null> {
    if (!userId.value) {
        return null;
    }
    const { data, error } = await GalaxyApi().PUT("/api/users/{user_id}/profile", {
        params: { path: { user_id: userId.value } },
        // the endpoint only modifies the fields present in the body, so a
        // partial payload is valid even though `published` is typed required
        body: fields as UserProfileUpdatePayload,
    });

    if (error) {
        const message = validationErrorMessage(error);
        Toast.error(message);
        return message;
    }

    profile.value = { ...data, username: data.username ?? props.username };
    return null;
}

function saveLayout(changes: Partial<UserProfileLayout>) {
    saveFields({ layout: { ...layout.value, ...changes } });
}

function onSectionLayoutUpdate(key: string, value: UserProfileSectionLayout) {
    saveLayout({ sections: { ...layout.value.sections, [key]: value } });
}

function onToggleSection(key: string, value: boolean) {
    saveFields({ visible_sections: { ...profile.value?.visible_sections, [key]: value } });
}

function onSectionLoaded(key: string, hasContent: boolean) {
    set(sectionHasContent.value, key, hasContent);
}

function publishPage() {
    saveFields({ published: true });
}

onMounted(load);

watch(() => props.username, load);

// The user store hydrates asynchronously on a direct page load; once the
// owner is recognized, switch from the public view to the editable one.
// The owner detail view is the only response carrying `published`.
watch([isOwner, userId], ([owner, id]) => {
    if (owner && id && profile.value?.published === undefined && !loading.value) {
        load();
    }
});
</script>

<template>
    <div class="gx-brand user-profile-page">
        <div v-if="loading" class="user-profile-state">
            <Heading h1 size="lg"><FontAwesomeIcon :icon="faSpinner" spin /> Loading profile</Heading>
        </div>

        <div v-else-if="notFound || !profile" class="user-profile-state">
            <Heading h1 size="lg">No public profile</Heading>

            <BAlert show variant="info">
                There is no public profile page for this username. The user may not have enabled their page, or the page
                may not exist.
            </BAlert>
        </div>

        <div v-else class="user-profile-layout" :class="{ 'user-profile-layout-solo': soloIdentity }">
            <aside class="user-profile-rail">
                <ProfileIdentity
                    :editable="ownerMode"
                    :profile="profile"
                    :save="ownerMode ? saveFields : undefined"
                    @toggle-about="onToggleSection('about', $event)" />

                <router-link v-if="ownerMode" class="user-profile-settings-link" to="/user/profile-settings">
                    <FontAwesomeIcon :icon="faCog" />
                    Page settings
                </router-link>
            </aside>

            <!-- v-show, not v-if: the cards must mount to fetch and report content,
                 even while the empty-page solo state hides the column -->
            <main v-show="!soloIdentity" class="user-profile-content">
                <BAlert v-if="isUnpublished" show variant="warning" class="user-profile-unpublished">
                    <span v-localize>Your page is not published — only you can see it.</span>

                    <GButton id="profile-publish-now" color="blue" size="small" @click="publishPage">
                        <span v-localize>Publish my page</span>
                    </GButton>
                </BAlert>

                <div v-if="ownerMode" v-localize class="gx-callout">
                    This is your page as visitors see it. Click any text to edit it, use the eye to hide a section, and
                    drag the handles to reorder sections and items.
                </div>

                <draggable
                    v-model="displaySections"
                    class="user-profile-sections"
                    :disabled="!ownerMode"
                    :force-fallback="true"
                    ghost-class="user-profile-section-ghost"
                    handle=".profile-section-drag-handle">
                    <ProfileListCard
                        v-for="section in displaySections"
                        :key="section.key"
                        :definition="section"
                        :editable="ownerMode"
                        :layout="sectionLayout(section.key)"
                        :username="props.username"
                        :visible="sectionVisible(section.key)"
                        @loaded="onSectionLoaded(section.key, $event)"
                        @toggle-visible="onToggleSection(section.key, $event)"
                        @update:layout="onSectionLayoutUpdate(section.key, $event)" />
                </draggable>
            </main>
        </div>
    </div>
</template>

<style scoped lang="scss">
@import "@/style/scss/_breakpoints.scss";

.user-profile-page {
    height: 100%;
    overflow: auto;
    padding: 1.5rem;
    // Reading surface: the page itself is the card.
    background: #ffffff;
}

.user-profile-state {
    max-width: 720px;
    margin: 0 auto;
}

.user-profile-layout {
    display: flex;
    gap: 2rem;
    max-width: 1180px;
    margin: 0 auto;

    &.user-profile-layout-solo {
        justify-content: center;

        .user-profile-rail {
            flex: 0 1 420px;
        }
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

    .user-profile-sections {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .user-profile-section-ghost {
        opacity: 0.4;
    }

    .user-profile-unpublished {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
    }

    .user-profile-settings-link {
        font-size: 0.9rem;
        align-self: flex-start;
    }

    @media (max-width: $breakpoint-md) {
        flex-direction: column;

        .user-profile-rail {
            flex: none;
        }
    }
}
</style>
