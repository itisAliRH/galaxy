<script setup lang="ts">
import { library } from "@fortawesome/fontawesome-svg-core";
import { faInfoCircle, faTimes } from "@fortawesome/free-solid-svg-icons";
import { storeToRefs } from "pinia";

import { useBroadcastsStore } from "@/stores/broadcastsStore";

import BroadcastContainer from "@/components/Notifications/Broadcasts/BroadcastContainer.vue";

library.add(faInfoCircle, faTimes);

const { activeBroadcasts } = storeToRefs(useBroadcastsStore());
</script>

<template>
    <div v-if="activeBroadcasts.length > 0">
        <div v-for="broadcast in activeBroadcasts" :key="broadcast.id">
            <BroadcastContainer :broadcast="broadcast" />
        </div>
    </div>
</template>
