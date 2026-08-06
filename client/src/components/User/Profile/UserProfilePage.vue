<script setup lang="ts">
import { faArrowLeft, faCog, faEye, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, set, watch } from "vue";
import draggable from "vuedraggable";

import { GalaxyApi } from "@/api";
import type { components } from "@/api/schema";
import { useConfig } from "@/composables/config";
import { Toast } from "@/composables/toast";
import { useUserStore } from "@/stores/userStore";
import { validationErrorMessage } from "@/utils/validation-errors";

import {
    DEFAULT_SECTION_ORDER,
    PROFILE_SECTIONS,
    type ProfileColumn,
    type ProfileSectionDefinition,
    TOOLS_SECTION_KEY,
} from "./sections";

import ProfileIdentity from "./ProfileIdentity.vue";
import ProfileListCard from "./ProfileListCard.vue";
import ProfileToolsCard from "./ProfileToolsCard.vue";
import GAlert from "@/components/BaseComponents/GAlert.vue";
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
const { config, isConfigLoaded } = useConfig(true);

const loading = ref(true);
const notFound = ref(false);
const profile = ref<(PublicUserProfile & Partial<UserProfileDetail>) | null>(null);
/** The owner previewing their page exactly as a visitor sees it. */
const publicPreview = ref(false);
/** Which sections reported whether they have published items, keyed by section key. */
const sectionHasContent = ref<Record<string, boolean>>({});
/** Monotonic guard so a stale response never overwrites a newer load. */
let loadSeq = 0;
/** Serializes saves so read-modify-write fields cannot clobber each other. */
let pendingSave: Promise<unknown> = Promise.resolve();

const userId = computed(() =>
    currentUser.value && "id" in currentUser.value ? (currentUser.value.id as string) : undefined,
);
const isOwner = computed(
    () =>
        currentUser.value !== null && "username" in currentUser.value && currentUser.value.username === props.username,
);
/** Owner mode needs the id for the self-scoped API, not just a username match. */
const ownerMode = computed(() => isOwner.value && userId.value !== undefined && profile.value !== null);
/** Editing affordances are hidden while the owner previews the public view. */
const editing = computed(() => ownerMode.value && !publicPreview.value);
/** Visitor rules apply to real visitors and to the owner's public preview. */
const asVisitor = computed(() => !ownerMode.value || publicPreview.value);

const isUnpublished = computed(() => ownerMode.value && profile.value?.published === false);

const maxSectionItems = computed(() =>
    isConfigLoaded.value ? (config.value.user_profile_max_section_items ?? 20) : 20,
);
const maxLinks = computed(() => (isConfigLoaded.value ? (config.value.user_profile_max_links ?? 10) : 10));

const layout = computed<UserProfileLayout>(() => profile.value?.layout ?? {});

const sectionOrder = computed(() => {
    const stored = (layout.value.section_order ?? []).filter((key) => DEFAULT_SECTION_ORDER.includes(key));
    const missing = DEFAULT_SECTION_ORDER.filter((key) => !stored.includes(key));
    return [...stored, ...missing];
});

function orderedKeysForColumn(column: ProfileColumn) {
    const columnKeys = new Set(
        PROFILE_SECTIONS.filter((section) => section.column === column).map((section) => section.key),
    );
    if (column === "side") {
        columnKeys.add(TOOLS_SECTION_KEY);
    }
    return sectionOrder.value.filter((key) => columnKeys.has(key) && (!asVisitor.value || sectionVisible(key)));
}

function sectionsModelForColumn(column: ProfileColumn) {
    return computed({
        get: () => orderedKeysForColumn(column),
        set: (reordered: string[]) => {
            const main = column === "main" ? reordered : orderedKeysForColumn("main");
            const side = column === "side" ? reordered : orderedKeysForColumn("side");
            saveLayout({ section_order: [...main, ...side] });
        },
    });
}

const mainSections = sectionsModelForColumn("main");
const sideSections = sectionsModelForColumn("side");

/** Visitors get the identity centered once every section reported empty. */
const soloIdentity = computed(() => {
    if (!asVisitor.value) {
        return false;
    }
    const keys = [...mainSections.value, ...sideSections.value];
    return keys.every((key) => sectionHasContent.value[key] === false);
});

/** Collapse the side column for visitors once every side section reported empty, freeing the space. */
const sideEmpty = computed(
    () => asVisitor.value && sideSections.value.every((key) => sectionHasContent.value[key] === false),
);

function definitionFor(key: string): ProfileSectionDefinition {
    // every key rendered by the columns comes from PROFILE_SECTIONS
    return PROFILE_SECTIONS.find((section) => section.key === key) as ProfileSectionDefinition;
}

function sectionVisible(key: string) {
    return profile.value?.visible_sections?.[key] ?? true;
}

function sectionLayout(key: string): UserProfileSectionLayout | undefined {
    return layout.value.sections?.[key];
}

/** Username the owner view was already attempted for; stops retry loops when it errors. */
let triedOwnFor: string | null = null;

/** Only the owner detail view carries `published`. */
function hasOwnerView() {
    const current = profile.value;
    return current !== null && current.published !== undefined;
}

async function load() {
    const seq = ++loadSeq;
    loading.value = true;
    notFound.value = false;
    profile.value = null;
    sectionHasContent.value = {};
    const useOwnView = isOwner.value && !!userId.value;
    if (useOwnView) {
        triedOwnFor = props.username;
    }
    try {
        if (useOwnView) {
            await loadOwn(seq);
        } else {
            await loadPublic(seq);
        }
    } finally {
        if (seq === loadSeq) {
            loading.value = false;
            // The user store may have hydrated while the public load was in
            // flight (including a 404 for the owner's unpublished page);
            // switch to the owner view once — never loop when it errors too.
            if (isOwner.value && userId.value && !hasOwnerView() && triedOwnFor !== props.username) {
                load();
            }
        }
    }
}

/** The owner sees their page even before it is published. */
async function loadOwn(seq: number) {
    const { data, error } = await GalaxyApi().GET("/api/users/{user_id}/profile", {
        params: { path: { user_id: userId.value as string } },
    });

    // Ignore responses that arrive after a newer load started.
    if (seq !== loadSeq) {
        return;
    }

    if (error) {
        notFound.value = true;
        return;
    }

    profile.value = { ...data, username: data.username ?? props.username };
}

async function loadPublic(seq: number) {
    const { data, error } = await GalaxyApi().GET("/api/profiles/{username}", {
        params: { path: { username: props.username } },
    });

    if (seq !== loadSeq) {
        return;
    }

    if (error) {
        notFound.value = true;
        return;
    }

    profile.value = data;
}

/**
 * Persist changed fields; resolves to a display-ready error message or null.
 * Fields apply to the local state immediately and saves are queued, so rapid
 * successive edits cannot clobber each other or snap back while in flight.
 */
async function saveFields(fields: Partial<UserProfileUpdatePayload>): Promise<string | null> {
    if (!userId.value || !profile.value) {
        return null;
    }
    profile.value = { ...profile.value, ...(fields as Partial<PublicUserProfile>) };
    const request = pendingSave.then(async () => {
        const { error } = await GalaxyApi().PUT("/api/users/{user_id}/profile", {
            params: { path: { user_id: userId.value as string } },
            // the endpoint only modifies the fields present in the body, so a
            // partial payload is valid even though `published` is typed required
            body: fields as UserProfileUpdatePayload,
        });
        return error;
    });
    pendingSave = request.catch(() => undefined);
    const error = await request;

    if (error) {
        const message = validationErrorMessage(error);
        Toast.error(message);
        // Resync: the optimistic state no longer matches the server.
        load();
        return message;
    }
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

// The user store hydrates asynchronously; when the owner is recognized after
// the initial public load already settled, switch to the owner view.
watch([isOwner, userId], ([owner, id]) => {
    if (owner && id && !loading.value && !hasOwnerView() && triedOwnFor !== props.username) {
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

            <GAlert variant="info">
                There is no public profile page for this username. The user may not have enabled their page, or the page
                may not exist.
            </GAlert>
        </div>

        <div v-else class="user-profile-layout" :class="{ 'user-profile-layout-solo': soloIdentity }">
            <aside class="user-profile-rail">
                <GAlert v-if="publicPreview" variant="info" class="user-profile-preview-note">
                    <span v-localize>This is how visitors see your page.</span>
                </GAlert>

                <ProfileIdentity
                    :editable="editing"
                    :max-links="maxLinks"
                    :profile="profile"
                    :save="editing ? saveFields : undefined"
                    @toggle-about="onToggleSection('about', $event)" />

                <div v-if="ownerMode" class="user-profile-owner-actions">
                    <GButton
                        id="profile-public-view"
                        color="grey"
                        size="small"
                        outline
                        @click="publicPreview = !publicPreview">
                        <FontAwesomeIcon :icon="publicPreview ? faArrowLeft : faEye" />
                        <span v-localize>{{ publicPreview ? "Back to editing" : "Public view" }}</span>
                    </GButton>

                    <router-link v-if="editing" class="user-profile-settings-link" to="/user/profile-settings">
                        <FontAwesomeIcon :icon="faCog" />
                        Page settings
                    </router-link>
                </div>
            </aside>

            <!-- v-show, not v-if: the cards must mount to fetch and report content,
                 even while the empty-page solo state hides the columns -->
            <main v-show="!soloIdentity" class="user-profile-content">
                <GAlert v-if="isUnpublished && !publicPreview" variant="warning">
                    <div class="user-profile-unpublished">
                        <span v-localize>Your page is not published — only you can see it.</span>

                        <GButton id="profile-publish-now" color="blue" size="small" @click="publishPage">
                            <span v-localize>Publish my page</span>
                        </GButton>
                    </div>
                </GAlert>

                <div v-if="editing" v-localize class="gx-callout">
                    This is your page as visitors see it. Click any text to edit it, use the eye to hide a section, and
                    drag the handles to reorder sections and items.
                </div>

                <draggable
                    v-model="mainSections"
                    class="user-profile-sections"
                    :disabled="!editing"
                    :force-fallback="true"
                    ghost-class="user-profile-section-ghost"
                    handle=".profile-section-drag-handle">
                    <ProfileListCard
                        v-for="key in mainSections"
                        :key="key"
                        :definition="definitionFor(key)"
                        :editable="editing"
                        :layout="sectionLayout(key)"
                        :max-items="maxSectionItems"
                        :username="props.username"
                        :visible="sectionVisible(key)"
                        @loaded="onSectionLoaded(key, $event)"
                        @toggle-visible="onToggleSection(key, $event)"
                        @update:layout="onSectionLayoutUpdate(key, $event)" />
                </draggable>
            </main>

            <aside v-if="!sideEmpty" v-show="!soloIdentity" class="user-profile-side">
                <draggable
                    v-model="sideSections"
                    class="user-profile-sections"
                    :disabled="!editing"
                    :force-fallback="true"
                    ghost-class="user-profile-section-ghost"
                    handle=".profile-section-drag-handle">
                    <template v-for="key in sideSections">
                        <ProfileToolsCard
                            v-if="key === TOOLS_SECTION_KEY"
                            :key="key"
                            :editable="editing"
                            :tools="profile.starred_tools ?? []"
                            :visible="sectionVisible(key)"
                            @loaded="onSectionLoaded(key, $event)"
                            @toggle-visible="onToggleSection(key, $event)" />

                        <ProfileListCard
                            v-else
                            :key="key"
                            :definition="definitionFor(key)"
                            :editable="editing"
                            :layout="sectionLayout(key)"
                            :max-items="maxSectionItems"
                            :username="props.username"
                            :visible="sectionVisible(key)"
                            @loaded="onSectionLoaded(key, $event)"
                            @toggle-visible="onToggleSection(key, $event)"
                            @update:layout="onSectionLayoutUpdate(key, $event)" />
                    </template>
                </draggable>
            </aside>
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

    &.user-profile-layout-solo {
        justify-content: center;

        .user-profile-rail {
            flex: 0 1 420px;
        }
    }

    .user-profile-rail {
        flex: 0 0 280px;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .user-profile-content {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .user-profile-side {
        flex: 0 0 320px;
        min-width: 0;
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

    .user-profile-owner-actions {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
    }

    .user-profile-settings-link {
        font-size: 0.9rem;
    }

    @media (max-width: $breakpoint-lg) {
        flex-wrap: wrap;

        .user-profile-side {
            flex: 1 1 100%;
        }
    }

    @media (max-width: $breakpoint-md) {
        flex-direction: column;

        .user-profile-rail,
        .user-profile-side {
            flex: none;
        }
    }
}
</style>
