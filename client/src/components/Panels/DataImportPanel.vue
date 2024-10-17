<script setup lang="ts">
import { faAws, faDropbox } from "@fortawesome/free-brands-svg-icons";
import {
    faCog,
    faDatabase,
    faEdit,
    faExclamation,
    faFile,
    faFolderOpen,
    faLaptop,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BAlert, BButton, BButtonGroup } from "bootstrap-vue";
import { ref } from "vue";

import { filesDialog } from "@/utils/data";

import FileSourceCard from "../FileSource/FileSourceCard.vue";
import DataImportCard from "@/components/DataImport/DataImportCard.vue";
import ActivityPanel from "@/components/Panels/ActivityPanel.vue";

const counterRunning = ref(0);
const uploadLocalFile = ref<HTMLInputElement | null>(null);

function addFiles(event: Event) {
    const files = (event.target as HTMLInputElement).files;

    if (files?.length && files.length > 0) {
        counterRunning.value += files.length;
        // queue.value.addFiles(files);
    }
}

function onImportFileClick() {
    console.log("onImportFileClick");

    uploadLocalFile.value?.click();
}

function onImportRemoteFiles() {
    filesDialog(
        (items: any) => {
            // queue.value.add(
            //     items.map((item) => {
            //         const rval = {
            //             mode: "url",
            //             name: item.label,
            //             size: item.size,
            //             path: item.url,
            //         };
            //         return rval;
            //     })
            // );
        },
        { multiple: true }
    );
}

function onPinFrequentlyUsedObjectStores() {
    console.log("onPinFrequentlyUsedObjectStores");
}
</script>

<template>
    <ActivityPanel
        title="Data Import"
        go-to-all-title="Advanced import options"
        href="/data_import"
        class="data-import-panel">
        <template v-slot:header-buttons>
            <BButtonGroup>
                <BButton
                    v-b-tooltip.bottom.hover
                    data-description="pin frequently used your object stores"
                    size="sm"
                    variant="link"
                    title="Pin frequently used object stores"
                    @click="onPinFrequentlyUsedObjectStores">
                    <FontAwesomeIcon :icon="faCog" fixed-width />
                </BButton>
            </BButtonGroup>
        </template>

        <div class="data-import-panel-cards">
            <DataImportCard
                title="Upload file"
                :icon="faLaptop"
                tooltip="Upload a file from your computer"
                @onClick="onImportFileClick" />
            <DataImportCard
                title="Remote files"
                :icon="faFolderOpen"
                tooltip="Import files from remote sources"
                @onClick="onImportRemoteFiles" />
            <DataImportCard
                title="Data Libraries"
                :icon="faDatabase"
                tooltip="View and manage your file sources"
                @onClick="onImportRemoteFiles" />

            <DataImportCard title="Paste/Fetch data" :icon="faEdit" tooltip="Paste or fetch data from a URL" />
            <!-- <DataImportCard title="My File Sources" :icon="faEdit" tooltip="View and manage your file sources" /> -->
            <!-- <DataImportCard title="File Sources" :icon="faFile" tooltip="View and manage your file sources" /> -->
        </div>

        <hr class="divider" />

        <FileSourceCard title="My Dropbox" :icon="faDropbox" description="Lab data" />
        <FileSourceCard title="AWS S3" :icon="faAws" description="My S3 object store" />

        <!-- <div ref="modalContentElement" class="drag-over inner-content">Drop Files here to Upload</div> -->
        <BAlert show variant="info" class="drag-alert">
            <FontAwesomeIcon :icon="faExclamation" />
            You can drag and drop files anywhere to upload them.
        </BAlert>

        <input ref="uploadLocalFile" type="file" multiple class="data-import-panel-upload-input" @click="addFiles" />
    </ActivityPanel>
</template>

<style lang="scss" scoped>
@import "theme/blue.scss";

.data-import-panel {
    .data-import-panel-cards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.2rem;
        margin-bottom: 1rem;
    }

    .drag-over {
        width: 100%;
        bottom: 1rem;
        min-height: 25vh;
        position: absolute;

        border-radius: 1rem;
        border: 0.25rem dashed;
        border-color: $brand-primary;

        text-align: center;

        // .inner-content {
        flex: 1 1 auto;
        display: grid;
        place-items: center;
        color: $brand-primary;
        font-weight: bold;
        // }
    }

    .divider {
        width: 100%;
    }

    .drag-alert {
        position: absolute;
        bottom: 0.1rem;
    }

    .data-import-panel-upload-input {
        display: none;
    }
}

// .notifications-box-list {
//     overflow-y: scroll;
// }

// .notifications-box-list-enter-active {
//     transition: all 0.5s ease;
// }

// .notifications-box-list-leave-active {
//     transition: all 0.3s ease;
// }

// .notifications-box-list-enter {
//     opacity: 0;
//     transform: translateY(-2rem);
// }

// .notifications-box-list-leave-to {
//     opacity: 0;
//     transform: translateY(-1rem);
// }
</style>
