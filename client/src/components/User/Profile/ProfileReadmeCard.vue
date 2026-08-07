<script setup lang="ts">
import {
    faBookOpen,
    faExchangeAlt,
    faExternalLinkAlt,
    faPencilAlt,
    faPlus,
    faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { computed, ref } from "vue";

import type { components } from "@/api/schema";
import type { SelectionItem } from "@/components/SelectionDialog/selectionTypes";
import { getPages } from "@/components/SelectionField/services";
import { withPrefix } from "@/utils/redirect";

import GButton from "@/components/BaseComponents/GButton.vue";
import PageView from "@/components/Page/PageView.vue";
import BasicSelectionDialog from "@/components/SelectionDialog/BasicSelectionDialog.vue";

type ProfileReadmePage = components["schemas"]["ProfileReadmePage"];
type ProfileReadmePageDetail = components["schemas"]["ProfileReadmePageDetail"];

interface Props {
    /**
     * The readme page reference from the profile payload. Visitors only ever
     * receive it when it is publicly displayable; the owner also gets blocked
     * states (unpublished, deleted) to render a warning.
     * @default null
     */
    readme?: ProfileReadmePage | ProfileReadmePageDetail | null;
    /**
     * Whether the owner is viewing: shows the picker and remove controls
     * @default false
     */
    editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    readme: null,
    editable: false,
});

const emit = defineEmits<{
    (e: "update:readme", pageId: string | null): void;
}>();

const showPicker = ref(false);

/** Page editor for the selected readme; opened in a new tab so the profile stays put. */
const editPageUrl = computed(() => (props.readme ? withPrefix(`/pages/editor?id=${props.readme.id}`) : null));

function readmeBlocked(readme: ProfileReadmePage | ProfileReadmePageDetail): string | null {
    if (!("published" in readme)) {
        return null;
    }
    if (readme.deleted) {
        return "The selected page was deleted — visitors do not see this section.";
    }
    if (!readme.published) {
        return "The selected page is not published — visitors do not see this section.";
    }
    return null;
}

function onPicked(selection: SelectionItem) {
    showPicker.value = false;
    emit("update:readme", selection.id);
}
</script>

<template>
    <div v-if="props.readme || props.editable" class="profile-readme">
        <div v-if="props.readme" class="gx-card profile-readme-card">
            <div class="profile-readme-header d-flex align-items-center">
                <FontAwesomeIcon class="profile-readme-icon" :icon="faBookOpen" fixed-width />

                <span class="profile-readme-title">
                    README
                    <span class="profile-readme-page-title">· {{ props.readme.title }}</span>
                </span>

                <span class="flex-fill" />

                <template v-if="props.editable">
                    <GButton
                        v-if="editPageUrl"
                        color="grey"
                        size="small"
                        transparent
                        title="Edit this page in a new tab"
                        data-description="edit readme page"
                        :href="editPageUrl"
                        rel="noopener"
                        target="_blank">
                        <FontAwesomeIcon :icon="faPencilAlt" fixed-width />
                        <span v-localize>Edit</span>
                        <FontAwesomeIcon class="profile-readme-external" :icon="faExternalLinkAlt" size="xs" />
                    </GButton>

                    <GButton
                        color="grey"
                        size="small"
                        transparent
                        title="Choose a different page"
                        data-description="change readme"
                        @click="showPicker = true">
                        <FontAwesomeIcon :icon="faExchangeAlt" fixed-width />
                        <span v-localize>Change</span>
                    </GButton>

                    <GButton
                        color="grey"
                        size="small"
                        transparent
                        title="Remove the readme section"
                        data-description="remove readme"
                        @click="emit('update:readme', null)">
                        <FontAwesomeIcon :icon="faTimes" fixed-width />
                        <span v-localize>Remove</span>
                    </GButton>
                </template>
            </div>

            <div v-if="props.editable && readmeBlocked(props.readme)" v-localize class="profile-readme-blocked">
                {{ readmeBlocked(props.readme) }}
            </div>

            <!-- content only: the card header already names the page -->
            <PageView
                :key="props.readme.id"
                class="profile-readme-body"
                embed
                :page-id="props.readme.id"
                :show-footer="false"
                :show-heading="false" />
        </div>

        <!-- owner without a readme: an invitation, GitHub-style -->
        <div v-else class="profile-readme-placeholder d-flex flex-column align-items-start">
            <span v-localize class="font-italic">
                Introduce yourself: pick one of your pages to show as a README at the top of your profile.
            </span>

            <GButton color="grey" size="small" outline data-description="add readme" @click="showPicker = true">
                <FontAwesomeIcon :icon="faPlus" />
                <span v-localize>Add README</span>
            </GButton>
        </div>

        <BasicSelectionDialog
            v-if="showPicker"
            :get-data="getPages"
            label-key="title"
            title="Select one of your pages"
            @onOk="onPicked"
            @onCancel="showPicker = false" />
    </div>
</template>

<style scoped lang="scss">
.profile-readme {
    .profile-readme-header {
        gap: 0.5rem;

        .profile-readme-icon {
            opacity: 0.5;
        }

        .profile-readme-title {
            font-size: 0.8rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            opacity: 0.7;

            .profile-readme-page-title {
                text-transform: none;
                letter-spacing: normal;
                font-weight: 400;
            }
        }
    }

    .profile-readme-external {
        opacity: 0.6;
    }

    .profile-readme-blocked {
        font-size: 0.85rem;
        font-style: italic;
        color: var(--color-galaxy-error, #a94442);
        margin-top: 0.25rem;
    }

    .profile-readme-body {
        margin-top: 0.5rem;
    }

    .profile-readme-placeholder {
        gap: 0.5rem;
        padding: 1rem;
        border: 1px dashed rgba(37, 83, 123, 0.3);
        border-radius: 0.375rem;
        font-size: 0.9rem;
        opacity: 0.85;
    }
}
</style>
