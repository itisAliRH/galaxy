<script setup lang="ts">
import { faBars, faChevronDown, faChevronUp, faGlobe, faPen, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BButtonGroup } from "bootstrap-vue";
import { computed, ref } from "vue";

import type { CardConfig, RowData } from "./configs/types";

import GridDatasets from "./GridElements/GridDatasets.vue";
import StatelessTags from "@/components/TagsMultiselect/StatelessTags.vue";
import UtcDate from "@/components/UtcDate.vue";

interface ActionButton {
    icon: any;
    title: string;
    disabled: boolean;
    size: "sm" | "md" | "lg";
    variant: "outline-primary" | "primary";
    onClick?: (d: RowData) => void;
    to?: (d: RowData) => string;
    condition?: (d: RowData) => boolean;
}

interface Props {
    item: {
        id: string;
        name: string;
        tags: string[];
        update_time: string;
        create_time: string;
        published: boolean;
        owner: string;
        username: string;
    };
    cardConfig: CardConfig;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: "update-filter", key: string, value: any): void;
    (e: "refreshList", force: boolean, showNotification: boolean): void;
}>();

const showRename = ref(false);

const item = ref(props.item);
const owner = computed(() => props.item.username || props.item.username);

async function onTagsUpdate(tags: string[]) {
    item.value.tags = tags;
    await props.cardConfig.tagsHandler?.(tags, props.item.id);
    emit("refreshList", true, true);
}

function onTagClick(tag: string) {
    console.log("tag clicked", tag);
}

function onOwnerClicked() {
    console.log("Clicked On the owner badge!");
}

const selected = ref(new Set<any>());

function onSelect(item: any) {
    console.log(`${item.id} is selected`);
}

const expanded = ref(false);

function onExpandClick() {
    expanded.value = !expanded.value;
}
</script>

<template>
    <div :id="`grid-card-item-${props.item.id}`" class="grid-card-item">
        <div
            class="grid-card-container card-container"
            :class="{
                'grid-card-shared': props.item.published,
            }">
            <div class="d-flex">
                <div class="grid-card-control">
                    <FontAwesomeIcon
                        v-if="props.cardConfig.expandable && expanded"
                        :icon="faChevronUp"
                        class="cursor-pointer"
                        title="Show details"
                        fixed-width
                        size="md"
                        @click="onExpandClick" />
                    <FontAwesomeIcon
                        v-else-if="props.cardConfig.expandable"
                        :icon="faChevronDown"
                        class="cursor-pointer"
                        title="Hide details"
                        fixed-width
                        size="md"
                        @click="onExpandClick" />

                    <BFormCheckbox
                        :checked="selected.has(props.item)"
                        class="cursor-pointer align-self-end"
                        data-description="grid selected"
                        @change="onSelect(props.item)" />
                </div>

                <div class="grid-card-data">
                    <div class="grid-card-top">
                        <div class="grid-card-header">
                            <div class="grid-card-header-left">
                                <BButton
                                    v-if="props.item.published"
                                    v-b-tooltip.noninteractive.hover
                                    size="sm"
                                    class="grid-card-published-icon inline-icon-button"
                                    :title="`Published item. Click to filter published workflows`"
                                    @click="emit('update-filter', 'published', true)">
                                    <FontAwesomeIcon :icon="faGlobe" fixed-width />
                                </BButton>

                                <span class="mr-1">
                                    <small>
                                        edited
                                        <UtcDate :date="props.item.update_time" mode="elapsed" />
                                    </small>

                                    <small v-if="props.item.create_time">
                                        | created
                                        <UtcDate :date="props.item.create_time" mode="elapsed" />
                                    </small>
                                </span>

                                <BBadge
                                    v-if="owner"
                                    v-b-tooltip.noninteractive.hover
                                    class="outline-badge cursor-pointer mx-1"
                                    :title="`'${owner}' shared this item with you. Click to view all shared with you by '${owner}'`"
                                    @click="onOwnerClicked">
                                    <FontAwesomeIcon :icon="faUsers" size="sm" fixed-width />
                                    <span class="font-weight-bold"> {{ owner }} </span>
                                </BBadge>
                            </div>

                            <div class="grid-card-header-right">
                                <GridDatasets :history-id="props.item.id" />

                                <div v-if="props.cardConfig.moreActions.length" class="grid-card-more-actions">
                                    <BDropdown
                                        v-b-tooltip.top.noninteractive
                                        :data-grid-card-actions-dropdown="props.item.id"
                                        right
                                        no-caret
                                        class="grid-card--actions-dropdown"
                                        toggle-class="inline-icon-button"
                                        title="More actions"
                                        variant="link">
                                        <template v-slot:button-content>
                                            <FontAwesomeIcon :icon="faBars" fixed-width />
                                        </template>

                                        <BDropdownItem
                                            v-for="moreAction in props.cardConfig.moreActions
                                                .filter((a) => a?.condition && a?.condition(props.item))
                                                .reverse()"
                                            :key="moreAction.class"
                                            :class="moreAction.class"
                                            :href="moreAction.href"
                                            :title="moreAction.title"
                                            :target="moreAction.target"
                                            :to="moreAction.to?.(props.item)"
                                            @click="moreAction.onClick?.(props.item)">
                                            <FontAwesomeIcon :icon="moreAction.icon" fixed-width />
                                            <span>{{ moreAction.title }}</span>
                                        </BDropdownItem>
                                    </BDropdown>
                                </div>
                            </div>
                        </div>

                        <div class="grid-card-body">
                            <span class="grid-card-name font-weight-bold">
                                {{ props.item.name }}
                                <BButton
                                    v-if="cardConfig.renameAllowed"
                                    v-b-tooltip.hover.noninteractive
                                    :data-grid-item-rename="props.item.id"
                                    class="inline-icon-button grid-card-rename"
                                    variant="link"
                                    size="sm"
                                    title="Rename"
                                    @click="showRename = !showRename">
                                    <FontAwesomeIcon :icon="faPen" fixed-width />
                                </BButton>
                            </span>
                        </div>
                    </div>

                    <div class="grid-card-footer">
                        <div class="grid-card-tags">
                            <StatelessTags
                                clickable
                                :value="props.item.tags"
                                :max-visible-tags="props.cardConfig.gridView ? 2 : 8"
                                @input="onTagsUpdate($event)"
                                @tag-click="onTagClick($event)" />
                        </div>

                        <div class="grid-card-actions">
                            <BButtonGroup>
                                <BButton
                                    v-for="action in props.cardConfig.actions"
                                    v-if="action.condition && action.condition(props.item)"
                                    :key="action.title"
                                    :size="action.size"
                                    :disabled="action.disabled"
                                    :variant="action.variant"
                                    :to="action.to && action?.to(props.item)"
                                    @click="action.onClick?.(props.item)">
                                    <FontAwesomeIcon :icon="action.icon" />
                                    <span class="compact-view"> {{ action.title }}</span>
                                </BButton>
                            </BButtonGroup>

                            <BButton
                                v-for="actionPrimary in props.cardConfig.primaryActions"
                                v-if="actionPrimary.condition && actionPrimary.condition(props.item)"
                                :key="actionPrimary.title"
                                :size="actionPrimary.size"
                                :disabled="actionPrimary.disabled"
                                :variant="actionPrimary.variant"
                                :to="actionPrimary.to && actionPrimary?.to(props.item)"
                                @click="actionPrimary.onClick?.(props.item)">
                                <FontAwesomeIcon :icon="actionPrimary.icon" />
                                <span class="compact-view"> {{ actionPrimary.title }}</span>
                            </BButton>
                        </div>
                    </div>
                </div>
            </div>

            <BCollapse class="w-100" :visible="expanded"> Hello from Here!</BCollapse>
        </div>
    </div>
</template>

<style scoped lang="scss">
@import "theme/blue.scss";
@import "breakpoints.scss";

.grid-card-item {
    container: grid-card-item / inline-size;
    padding: 0;

    @container (max-width: #{$breakpoint-md}) {
        & {
            padding: 0 0.25rem 0.5rem 0.25rem;
        }
    }

    &.grid-card-shared {
        border-left: 0.25rem solid $brand-primary;
    }

    .grid-card-container {
        height: 100%;
        display: flex;
        // gap: 0.5rem;
        flex-direction: column;
        // justify-content: space-between;

        .grid-card-control {
            // width: 2rem;
            display: flex;
            gap: 0.4rem;
            flex-direction: column;
            padding-top: 0.25rem;
            // align-items: center;
        }

        .grid-card-data {
            width: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;

            .grid-card-header {
                display: flex;
                justify-content: space-between;

                .grid-card-header-right {
                    display: flex;
                    gap: 0.25rem;
                    align-items: center;
                }
            }

            .grid-card-body {
                .grid-card-name {
                    font-size: 1rem;
                    font-weight: 700;
                    word-break: break-all;
                    margin-bottom: 0.5rem;
                }
            }

            .grid-card-footer {
                display: flex;
                justify-content: space-between;
                align-items: end;

                .grid-card-actions {
                    display: flex;
                    gap: 0.25rem;

                    @container (max-width: #{$breakpoint-md}) {
                        .compact-view {
                            display: none;
                        }
                    }
                }
            }
        }
    }
}
</style>
