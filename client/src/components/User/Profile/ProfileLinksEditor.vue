<script setup lang="ts">
import { faExternalLinkAlt, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BFormGroup, BFormInput } from "bootstrap-vue";
import { computed, ref, watch } from "vue";

import { useUid } from "@/composables/utils/uid";

import {
    isUsableLinkUrl,
    profileLinkIcon,
    profileLinkText,
    type UserProfileLink,
    WELL_KNOWN_LINKS,
    type WellKnownLinkType,
} from "./profileLinks";

import GButton from "@/components/BaseComponents/GButton.vue";

interface Props {
    /**
     * Whether the owner is viewing: renders the fixed slots and custom rows as inputs
     * @default false
     */
    editable?: boolean;
    /**
     * External links to render
     * @default () => []
     */
    links?: UserProfileLink[];
    /**
     * Maximum number of links a profile can hold (from instance configuration)
     * @default 10
     */
    maxLinks?: number;
}

const props = withDefaults(defineProps<Props>(), {
    editable: false,
    links: () => [],
    maxLinks: 10,
});

const emit = defineEmits<{
    (e: "update:links", value: UserProfileLink[]): void;
}>();

const slotUid = useUid("profile-link-slot-");

/** URL per fixed slot; empty string when the user has not provided one. */
const wellKnown = ref<Record<WellKnownLinkType, string>>({ gtn: "", hub: "", github: "" });

/** Custom rows, including half-typed ones; only usable URLs are emitted. */
const customRows = ref<{ url: string }[]>([]);

function adopt(links: UserProfileLink[]) {
    const slots: Record<WellKnownLinkType, string> = { gtn: "", hub: "", github: "" };
    const customs: { url: string }[] = [];
    for (const link of links) {
        if (link.type && link.type !== "custom") {
            slots[link.type] = link.url;
        } else {
            customs.push({ url: link.url });
        }
    }
    wellKnown.value = slots;
    customRows.value = customs;
}

adopt(props.links);

watch(
    () => props.links,
    (links) => {
        // ignore the echo of our own emit; adopt anything else (load, cancel)
        if (JSON.stringify(links) !== JSON.stringify(validLinks())) {
            adopt(links);
        }
    },
);

const totalLinks = computed(
    () => WELL_KNOWN_LINKS.filter((slot) => wellKnown.value[slot.type].trim()).length + customRows.value.length,
);
const canAdd = computed(() => totalLinks.value < props.maxLinks);

/** Canonical order: the fixed slots first (gtn, hub, github), customs after. */
function validLinks(): UserProfileLink[] {
    const links: UserProfileLink[] = [];
    for (const slot of WELL_KNOWN_LINKS) {
        const url = wellKnown.value[slot.type].trim();
        if (isUsableLinkUrl(url, slot.type)) {
            links.push({ type: slot.type, url });
        }
    }
    for (const row of customRows.value) {
        if (isUsableLinkUrl(row.url)) {
            links.push({ type: "custom", url: row.url.trim() });
        }
    }
    return links;
}

function commit() {
    emit("update:links", validLinks());
}

function onSlotInput(type: WellKnownLinkType, value: string) {
    wellKnown.value[type] = value;
    commit();
}

function onCustomInput(index: number, value: string) {
    const row = customRows.value[index];
    if (row) {
        row.url = value;
        commit();
    }
}

function addCustomRow() {
    customRows.value.push({ url: "" });
}

function removeCustomRow(index: number) {
    customRows.value.splice(index, 1);
    commit();
}
</script>

<template>
    <div v-if="props.editable" class="profile-links d-flex flex-column">
        <!-- the three fixed slots are always visible, GitHub-profile style -->
        <BFormGroup
            v-for="slot in WELL_KNOWN_LINKS"
            :key="slot.type"
            class="profile-links-slot mb-0"
            :label="slot.label"
            :label-for="`${slotUid}-${slot.type}`">
            <div class="profile-links-editor-url d-flex align-items-center">
                <FontAwesomeIcon :icon="profileLinkIcon({ type: slot.type, url: wellKnown[slot.type] })" fixed-width />

                <BFormInput
                    :id="`${slotUid}-${slot.type}`"
                    class="flex-fill"
                    :data-description="`profile link ${slot.type}`"
                    :placeholder="slot.placeholder"
                    size="sm"
                    type="url"
                    :value="wellKnown[slot.type]"
                    @update="onSlotInput(slot.type, $event)" />
            </div>
        </BFormGroup>

        <BFormGroup class="profile-links-customs mb-0" label="Other links">
            <div class="d-flex flex-column profile-links-customs-body">
                <div
                    v-for="(row, index) in customRows"
                    :key="index"
                    class="profile-links-editor-url d-flex align-items-center">
                    <FontAwesomeIcon :icon="profileLinkIcon({ type: 'custom', url: row.url })" fixed-width />

                    <BFormInput
                        class="flex-fill"
                        data-description="profile link custom"
                        placeholder="https://…"
                        size="sm"
                        type="url"
                        :value="row.url"
                        @update="onCustomInput(index, $event)" />

                    <GButton
                        color="grey"
                        size="small"
                        icon-only
                        transparent
                        title="Remove link"
                        aria-label="Remove link"
                        @click="removeCustomRow(index)">
                        <FontAwesomeIcon :icon="faTrash" fixed-width />
                    </GButton>
                </div>

                <GButton
                    v-if="canAdd"
                    id="profile-links-add"
                    class="align-self-start"
                    color="grey"
                    size="small"
                    transparent
                    @click="addCustomRow">
                    <FontAwesomeIcon :icon="faPlus" />
                    <span v-localize>Add link</span>
                </GButton>
            </div>
        </BFormGroup>
    </div>

    <div v-else-if="props.links.length > 0" class="profile-links d-flex flex-column">
        <div v-for="(link, index) in props.links" :key="index" class="profile-links-row d-flex align-items-center">
            <FontAwesomeIcon :icon="profileLinkIcon(link)" fixed-width />

            <a class="profile-links-anchor" :href="link.url" rel="noopener noreferrer" target="_blank">
                {{ profileLinkText(link) }}
                <FontAwesomeIcon class="profile-links-external" :icon="faExternalLinkAlt" size="xs" />
            </a>
        </div>
    </div>
</template>

<style scoped lang="scss">
.profile-links {
    gap: 0.4rem;

    .profile-links-row {
        gap: 0.5rem;

        .profile-links-anchor {
            min-width: 0;
            overflow-wrap: anywhere;
        }

        .profile-links-external {
            opacity: 0.6;
        }
    }

    .profile-links-slot,
    .profile-links-customs {
        ::v-deep legend,
        ::v-deep label {
            font-size: 0.8rem;
            padding-bottom: 0.1rem;
        }
    }

    .profile-links-customs-body {
        gap: 0.4rem;
    }

    .profile-links-editor-url {
        gap: 0.35rem;
    }
}
</style>
