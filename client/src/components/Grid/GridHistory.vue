<script setup lang="ts">
import { faPlus } from "@fortawesome/free-solid-svg-icons";

import historiesGridConfig from "@/components/Grid/configs/histories";
import historiesPublishedGridConfig from "@/components/Grid/configs/historiesPublished";
import historiesSharedGridConfig from "@/components/Grid/configs/historiesShared";
import { useUserStore } from "@/stores/userStore";

import GridCardView from "./GridCardView.vue";
import HistoryArchive from "@/components/History/Archiving/HistoryArchive.vue";

interface Props {
    activeList?: "archived" | "my" | "shared" | "published";
    username?: string;
}

const props = withDefaults(defineProps<Props>(), {
    activeList: "my",
    username: undefined,
});

const userStore = useUserStore();

const gridCardViewConfig = {
    id: "histories-grid-view",
    plural: "Histories",
    title: "Histories",
    headerActions: [
        {
            id: "history-import",
            title: "Import History",
            size: "sm",
            variant: "outline-primary",
            disabled: false,
            onClick: () => {
                console.log("Import History");
            },
            icon: faPlus,
            text: "Import History",
        },
    ],
    navItems: [
        historiesGridConfig,
        historiesSharedGridConfig,
        historiesPublishedGridConfig,
        {
            id: "archived",
            label: "Archived Histories",
            to: "/histories/archived",
            active: props.activeList === "archived",
            loginRequired: false,
            title: "Manage your Histories",
            limit: 25,
        },
    ],
};
</script>

<template>
    <GridCardView :active-list="activeList" :config="gridCardViewConfig" :items-config="gridCardViewConfig.navItems" />
</template>

<!-- <template>
    <div class="d-flex flex-column">
        <div class="d-flex">
            <Heading h1 separator inline size="xl" class="flex-grow-1 mb-2">Histories</Heading>
            <div v-if="!userStore.isAnonymous">
                <BButton
                    size="sm"
                    variant="outline-primary"
                    to="/histories/import"
                    data-description="grid action import new history">
                    <Icon :icon="faPlus" />
                    <span v-localize>Import History</span>
                </BButton>
            </div>
        </div>
        <BNav pills justified class="mb-2">
            <BNavItem
                id="histories-my-tab"
                :active="activeList === 'my'"
                :disabled="userStore.isAnonymous"
                to="/histories/list">
                My Histories
                <LoginRequired v-if="userStore.isAnonymous" target="histories-my-tab" title="Manage your Histories" />
            </BNavItem>
            <BNavItem
                id="histories-shared-tab"
                :active="activeList === 'shared'"
                :disabled="userStore.isAnonymous"
                to="/histories/list_shared">
                Shared with Me
                <LoginRequired
                    v-if="userStore.isAnonymous"
                    target="histories-shared-tab"
                    title="Manage your Histories" />
            </BNavItem>
            <BNavItem id="histories-published-tab" :active="activeList === 'published'" to="/histories/list_published">
                Public Histories
            </BNavItem>
            <BNavItem
                id="histories-archived-tab"
                :active="activeList === 'archived'"
                :disabled="userStore.isAnonymous"
                to="/histories/archived">
                Archived Histories
                <LoginRequired
                    v-if="userStore.isAnonymous"
                    target="histories-archived-tab"
                    title="Manage your Histories" />
            </BNavItem>
        </BNav>
        <GridList v-if="activeList === 'my'" :grid-config="historiesGridConfig" embedded />
        <GridList v-else-if="activeList === 'shared'" :grid-config="historiesSharedGridConfig" embedded />
        <GridList
            v-else-if="activeList === 'published'"
            :grid-config="historiesPublishedGridConfig"
            :username-search="props.username"
            embedded />
        <HistoryArchive v-else />
    </div>
</template> -->
