<script setup lang="ts">
import { faArrowLeft, faCheck, faCog, faEye, faPencilAlt, faSpinner, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, set, watch } from "vue";
import { useRouter } from "vue-router/composables";
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
    type ProfileListItem,
    type ProfileSectionDefinition,
    TOOLS_SECTION_KEY,
} from "./sections";

import ProfileIdentity from "./ProfileIdentity.vue";
import ProfileItemPreviewModal from "./ProfileItemPreviewModal.vue";
import ProfileListCard from "./ProfileListCard.vue";
import ProfileReadmeCard from "./ProfileReadmeCard.vue";
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
     * Username or encoded user id from the /profile/:identifier route.
     * Id URLs survive username changes; they canonicalize to the username.
     */
    identifier: string;
}

const props = defineProps<Props>();

const userStore = useUserStore();
const { currentUser } = storeToRefs(userStore);
const { config, isConfigLoaded } = useConfig(true);
const router = useRouter();

const loading = ref(true);
const notFound = ref(false);
const profile = ref<(PublicUserProfile & Partial<UserProfileDetail>) | null>(null);
/** The owner previewing their page exactly as a visitor sees it. */
const publicPreview = ref(false);
/**
 * The owner opted into editing their identity card. Section controls stay
 * available throughout; only the profile column is gated, the way GitHub
 * gates its profile sidebar behind "Edit profile".
 */
const identityEditRequested = ref(false);
/**
 * Identity edits are buffered while the card is open and committed as one
 * request on Save, so Cancel can discard them. Section controls outside the
 * card still persist immediately.
 */
const identityDraft = ref<Partial<UserProfileUpdatePayload>>({});
/** Which sections reported whether they have published items, keyed by section key. */
const sectionHasContent = ref<Record<string, boolean>>({});
/**
 * The item being previewed, page-level: one modal for the whole page — a
 * per-card modal would be unmounted mid-preview when a section drag
 * re-renders the card subtrees.
 */
const previewTarget = ref<{ definition: ProfileSectionDefinition; item: ProfileListItem } | null>(null);
const previewShown = ref(false);
/** Monotonic guard so a stale response never overwrites a newer load. */
let loadSeq = 0;
/** Serializes saves so read-modify-write fields cannot clobber each other. */
let pendingSave: Promise<unknown> = Promise.resolve();

const userId = computed(() =>
    currentUser.value && "id" in currentUser.value ? (currentUser.value.id as string) : undefined,
);
/** The identifier may be the owner's username or their encoded user id. */
const isOwner = computed(
    () =>
        currentUser.value !== null &&
        "username" in currentUser.value &&
        (currentUser.value.username === props.identifier || userId.value === props.identifier),
);
/**
 * Username for section fetchers (they build `user:'<name>'` filters, which an
 * encoded id would silently turn into zero matches); the loaded profile is
 * authoritative, the route param only stands in before the first load.
 */
const resolvedUsername = computed(() => profile.value?.username ?? props.identifier);
/** Owner mode needs the id for the self-scoped API, not just a username match. */
const ownerMode = computed(() => isOwner.value && userId.value !== undefined && profile.value !== null);
/** Editing affordances are hidden while the owner previews the public view. */
const editing = computed(() => ownerMode.value && !publicPreview.value);
/** The identity card additionally waits for the owner to click "Edit profile". */
const editingIdentity = computed(() => editing.value && identityEditRequested.value);
/** The identity card renders the buffered edits while they are unsaved. */
const identityProfile = computed(() => (profile.value ? { ...profile.value, ...identityDraft.value } : null));
/** Visitor rules apply to real visitors and to the owner's public preview. */
const asVisitor = computed(() => !ownerMode.value || publicPreview.value);

const isUnpublished = computed(() => ownerMode.value && profile.value?.published === false);

const maxSectionItems = computed(() =>
    isConfigLoaded.value ? (config.value.user_profile_max_section_items ?? 20) : 20,
);
const maxLinks = computed(() => (isConfigLoaded.value ? (config.value.user_profile_max_links ?? 10) : 10));
/** The tools slider is additionally capped by the public starred-tools limit. */
const maxStarredTools = computed(() =>
    Math.min(maxSectionItems.value, isConfigLoaded.value ? (config.value.user_profile_max_starred_tools ?? 50) : 50),
);

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

/**
 * Whether the readme renders for the current viewer. The server already gates
 * the public payload; the owner's payload additionally carries blocked states
 * (unpublished, deleted), which the owner's public preview must hide to stay
 * faithful to what visitors see.
 */
const readmeVisible = computed(() => {
    const readme = profile.value?.readme_page;
    if (!readme) {
        return false;
    }
    if (asVisitor.value && "published" in readme) {
        return readme.published === true && readme.deleted !== true;
    }
    return true;
});

/** Visitors get the identity centered once every section reported empty. */
const soloIdentity = computed(() => {
    if (!asVisitor.value || readmeVisible.value) {
        return false;
    }
    const keys = [...mainSections.value, ...sideSections.value];
    return keys.every((key) => sectionHasContent.value[key] === false);
});

/** Collapse the side column for visitors once every side section reported empty, freeing the space. */
const sideEmpty = computed(
    () => asVisitor.value && sideSections.value.every((key) => sectionHasContent.value[key] === false),
);

/**
 * The main column renders nothing — every section there is hidden or empty —
 * while the side column still has content, so it needs a placeholder rather
 * than a blank half page. A visible readme is main-column content.
 */
const mainEmpty = computed(
    () =>
        asVisitor.value &&
        !readmeVisible.value &&
        mainSections.value.every((key) => sectionHasContent.value[key] === false),
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

/** Identifier the owner view was already attempted for; stops retry loops when it errors. */
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
        triedOwnFor = props.identifier;
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
            canonicalizeUrl();
            // The user store may have hydrated while the public load was in
            // flight (including a 404 for the owner's unpublished page);
            // switch to the owner view once — never loop when it errors too.
            if (isOwner.value && userId.value && !hasOwnerView() && triedOwnFor !== props.identifier) {
                load();
            }
        }
    }
}

/** An id URL is only ever transient: replace it with the username URL. */
function canonicalizeUrl() {
    const username = profile.value?.username;
    if (username && username !== props.identifier) {
        router.replace(`/profile/${username}`);
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

    profile.value = { ...data, username: data.username ?? props.identifier };
}

async function loadPublic(seq: number) {
    const { data, error } = await GalaxyApi().GET("/api/profiles/{user_identifier}", {
        params: { path: { user_identifier: props.identifier } },
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
    const visible_sections = { ...identityProfile.value?.visible_sections, [key]: value };
    // the About eye lives inside the identity card, so it follows Save/Cancel
    if (editingIdentity.value && key === "about") {
        stageIdentityFields({ visible_sections });
        return;
    }
    saveFields({ visible_sections });
}

/** Buffer an identity edit; the card renders it immediately, the server sees it on Save. */
function stageIdentityFields(fields: Partial<UserProfileUpdatePayload>): Promise<string | null> {
    identityDraft.value = { ...identityDraft.value, ...fields };
    return Promise.resolve(null);
}

async function saveIdentity() {
    const fields = identityDraft.value;
    identityEditRequested.value = false;
    identityDraft.value = {};
    if (Object.keys(fields).length > 0) {
        await saveFields(fields);
    }
}

function cancelIdentity() {
    identityDraft.value = {};
    identityEditRequested.value = false;
}

function onSectionLoaded(key: string, hasContent: boolean) {
    set(sectionHasContent.value, key, hasContent);
}

function onPreview(key: string, item: ProfileListItem) {
    previewTarget.value = { definition: definitionFor(key), item };
    previewShown.value = true;
}

function publishPage() {
    saveFields({ published: true });
}

/** Persist the picked readme page; reload so the payload's readme_page ref (title, flags) is fresh. */
async function onReadmeUpdate(pageId: string | null) {
    const error = await saveFields({ readme_page_id: pageId });
    if (!error) {
        load();
    }
}

onMounted(load);

watch(
    () => props.identifier,
    (identifier) => {
        // canonicalizing an id URL to the loaded profile's username fires this
        // watch too — the data is already correct, don't refetch and flash
        if (profile.value?.username === identifier) {
            return;
        }
        load();
    },
);

// The user store hydrates asynchronously; when the owner is recognized after
// the initial public load already settled, switch to the owner view.
watch([isOwner, userId], ([owner, id]) => {
    if (owner && id && !loading.value && !hasOwnerView() && triedOwnFor !== props.identifier) {
        load();
    }
});
</script>

<template>
    <!-- bg-white: the reading surface — the page itself is the card -->
    <div class="gx-brand user-profile-page h-100 overflow-auto p-4 bg-white">
        <div v-if="loading" class="user-profile-state mx-auto">
            <Heading h1 size="lg"><FontAwesomeIcon :icon="faSpinner" spin /> Loading profile</Heading>
        </div>

        <div v-else-if="notFound || !profile" class="user-profile-state mx-auto">
            <Heading h1 size="lg">No public profile</Heading>

            <GAlert variant="info">
                There is no public profile page for this username. The user may not have enabled their page, or the page
                may not exist.
            </GAlert>
        </div>

        <div v-else class="user-profile-body d-flex flex-column">
            <!-- page-wide banners: they span every column so the page state is
                 unmissable and the columns keep their own rhythm -->
            <GAlert v-if="publicPreview" variant="info">
                <div class="user-profile-banner d-flex flex-wrap align-items-center justify-content-between">
                    <span v-localize>This is how visitors see your page.</span>

                    <GButton id="profile-public-view-exit" color="blue" size="small" @click="publicPreview = false">
                        <FontAwesomeIcon :icon="faArrowLeft" />
                        <span v-localize>Back to editing</span>
                    </GButton>
                </div>
            </GAlert>

            <GAlert v-if="isUnpublished && !publicPreview" variant="warning">
                <div class="user-profile-banner d-flex flex-wrap align-items-center justify-content-between">
                    <span v-localize>Your page is not published — only you can see it.</span>

                    <GButton id="profile-publish-now" color="blue" size="small" @click="publishPage">
                        <span v-localize>Publish my page</span>
                    </GButton>
                </div>
            </GAlert>

            <div v-if="editing" v-localize class="gx-callout">
                This is your page as visitors see it. Click any text to edit it, use the eye to hide a section, and drag
                the handles to reorder sections and items.
            </div>

            <div
                class="user-profile-layout d-flex flex-wrap align-items-start"
                :class="{ 'user-profile-layout-solo': soloIdentity }">
                <aside class="user-profile-rail d-flex flex-column">
                    <ProfileIdentity
                        v-if="identityProfile"
                        :editable="editingIdentity"
                        :max-links="maxLinks"
                        :profile="identityProfile"
                        :save="editingIdentity ? stageIdentityFields : undefined"
                        @toggle-about="onToggleSection('about', $event)">
                        <template v-slot:actions>
                            <div v-if="editing" class="user-profile-owner-actions d-flex flex-column align-items-start">
                                <GButton
                                    v-if="!identityEditRequested"
                                    id="profile-edit"
                                    class="w-100"
                                    color="grey"
                                    size="small"
                                    outline
                                    @click="identityEditRequested = true">
                                    <FontAwesomeIcon :icon="faPencilAlt" />
                                    <span v-localize>Edit profile</span>
                                </GButton>

                                <div v-else class="user-profile-edit-actions d-flex w-100">
                                    <GButton
                                        id="profile-edit-save"
                                        class="flex-fill"
                                        color="blue"
                                        size="small"
                                        @click="saveIdentity">
                                        <FontAwesomeIcon :icon="faCheck" />
                                        <span v-localize>Save</span>
                                    </GButton>

                                    <GButton
                                        id="profile-edit-cancel"
                                        class="flex-fill"
                                        color="grey"
                                        size="small"
                                        @click="cancelIdentity">
                                        <FontAwesomeIcon :icon="faTimes" />
                                        <span v-localize>Cancel</span>
                                    </GButton>
                                </div>

                                <GButton
                                    id="profile-public-view"
                                    class="w-100"
                                    color="grey"
                                    size="small"
                                    outline
                                    @click="publicPreview = true">
                                    <FontAwesomeIcon :icon="faEye" />
                                    <span v-localize>Public view</span>
                                </GButton>

                                <router-link class="user-profile-settings-link" to="/user/profile-settings">
                                    <FontAwesomeIcon :icon="faCog" />
                                    Page settings
                                </router-link>
                            </div>
                        </template>
                    </ProfileIdentity>
                </aside>

                <!-- v-show, not v-if: the cards must mount to fetch and report content,
                 even while the empty-page solo state hides the columns -->
                <main v-show="!soloIdentity" class="user-profile-content flex-column">
                    <!-- fixed slot above the draggable sections: the readme is
                         set/removed, not reordered or eye-toggled -->
                    <ProfileReadmeCard
                        v-if="readmeVisible || editing"
                        :editable="editing"
                        :readme="profile.readme_page"
                        @update:readme="onReadmeUpdate" />

                    <div
                        v-if="mainEmpty"
                        v-localize
                        class="user-profile-empty d-flex align-items-center justify-content-center text-center font-italic">
                        Nothing shared here yet.
                    </div>

                    <draggable
                        v-model="mainSections"
                        class="user-profile-sections d-flex flex-column"
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
                            :username="resolvedUsername"
                            :visible="sectionVisible(key)"
                            @loaded="onSectionLoaded(key, $event)"
                            @preview="onPreview(key, $event)"
                            @toggle-visible="onToggleSection(key, $event)"
                            @update:layout="onSectionLayoutUpdate(key, $event)" />
                    </draggable>
                </main>

                <aside v-if="!sideEmpty" v-show="!soloIdentity" class="user-profile-side">
                    <draggable
                        v-model="sideSections"
                        class="user-profile-sections d-flex flex-column"
                        :disabled="!editing"
                        :force-fallback="true"
                        ghost-class="user-profile-section-ghost"
                        handle=".profile-section-drag-handle">
                        <template v-for="key in sideSections">
                            <ProfileToolsCard
                                v-if="key === TOOLS_SECTION_KEY"
                                :key="key"
                                :editable="editing"
                                :layout="sectionLayout(key)"
                                :max-items="maxStarredTools"
                                :tools="profile.starred_tools ?? []"
                                :visible="sectionVisible(key)"
                                @loaded="onSectionLoaded(key, $event)"
                                @toggle-visible="onToggleSection(key, $event)"
                                @update:layout="onSectionLayoutUpdate(key, $event)" />

                            <ProfileListCard
                                v-else
                                :key="key"
                                :definition="definitionFor(key)"
                                :editable="editing"
                                :layout="sectionLayout(key)"
                                :max-items="maxSectionItems"
                                :username="resolvedUsername"
                                :visible="sectionVisible(key)"
                                @loaded="onSectionLoaded(key, $event)"
                                @preview="onPreview(key, $event)"
                                @toggle-visible="onToggleSection(key, $event)"
                                @update:layout="onSectionLayoutUpdate(key, $event)" />
                        </template>
                    </draggable>
                </aside>
            </div>

            <ProfileItemPreviewModal
                :definition="previewTarget?.definition"
                :item="previewTarget?.item"
                :show.sync="previewShown" />
        </div>
    </div>
</template>

<style scoped lang="scss">
.user-profile-state {
    max-width: 720px;
}

.user-profile-body {
    gap: 1rem;
}

.user-profile-banner {
    gap: 1rem;
}

.user-profile-layout {
    // Columns wrap instead of squeezing: the page renders inside the center
    // panel, whose width varies with the activity bar and history panel, so
    // flex-basis + wrap adapts without viewport-based guesses.
    gap: 2rem;

    &.user-profile-layout-solo {
        justify-content: center;

        .user-profile-rail {
            flex: 0 1 420px;
            max-width: 420px;
        }
    }

    // No max-widths: a column that wraps onto its own row fills that row
    // instead of leaving dead space beside it. The grow ratios keep the
    // proportions while all three share a row.
    .user-profile-rail {
        flex: 1 1 260px;
        min-width: 0;
        gap: 1rem;
    }

    .user-profile-content {
        // `display` stays custom: `d-flex` is `!important` and would beat the
        // inline `display: none` that `v-show` sets on this element.
        display: flex;
        flex: 4 1 380px;
        min-width: 0;
        gap: 1.5rem;
    }

    .user-profile-side {
        flex: 2 1 300px;
        min-width: 0;
    }

    .user-profile-sections {
        gap: 1.5rem;
    }

    .user-profile-empty {
        min-height: 12rem;
        opacity: 0.6;
    }

    .user-profile-section-ghost {
        opacity: 0.4;
    }

    .user-profile-owner-actions {
        gap: 0.5rem;
    }

    .user-profile-edit-actions {
        gap: 0.5rem;
    }

    .user-profile-settings-link {
        font-size: 0.9rem;
        cursor: pointer;
    }
}
</style>
