<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { getPublishedHistories, type PublishedHistory } from "@/api/histories";

import Heading from "@/components/Common/Heading.vue";
import UtcDate from "@/components/UtcDate.vue";

const MAX_ITEMS = 5;

interface Props {
    /**
     * Username whose published histories are listed
     */
    username: string;
}

const props = defineProps<Props>();

const loading = ref(true);
const histories = ref<PublishedHistory[]>([]);
const total = ref(0);

const showCard = computed(() => !loading.value && histories.value.length > 0);
const listUrl = computed(() => `/histories/list_published?owner=${props.username}`);

async function load() {
    loading.value = true;
    try {
        // Galaxy search syntax; the quoted value makes the username an exact match.
        const result = await getPublishedHistories({
            limit: MAX_ITEMS,
            offset: 0,
            search: `user:'${props.username}'`,
            sortBy: "update_time",
            sortDesc: true,
        });
        histories.value = result.data;
        total.value = result.total;
    } catch {
        // The card is optional page content — render nothing on failure.
        histories.value = [];
    } finally {
        loading.value = false;
    }
}

onMounted(load);
</script>

<template>
    <section v-if="showCard" class="profile-histories-card">
        <Heading h2 size="md"
            >Published histories <span class="profile-histories-count">{{ total }}</span></Heading
        >

        <div class="gx-card profile-histories-list">
            <router-link
                v-for="history in histories"
                :key="history.id"
                class="gx-row-accent profile-histories-item"
                :to="`/published/history?id=${history.id}`">
                <span class="profile-histories-name">{{ history.name }}</span>

                <span class="profile-histories-meta">
                    updated <UtcDate :date="history.update_time" mode="elapsed" />
                </span>
            </router-link>

            <router-link v-if="total > MAX_ITEMS" class="profile-histories-more" :to="listUrl">
                View all {{ total }} →
            </router-link>
        </div>
    </section>
</template>

<style scoped lang="scss">
.profile-histories-card {
    .profile-histories-count {
        font-weight: 400;
        font-size: 0.9rem;
        opacity: 0.7;
        margin-left: 0.25rem;
    }

    .profile-histories-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .profile-histories-item {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.5rem 0.75rem 0.5rem 0.9rem;
        border: 1px solid rgba(37, 83, 123, 0.12);
        border-radius: 0.375rem;
        text-decoration: none;

        &:hover {
            text-decoration: none;
            box-shadow: 0 1px 4px rgba(44, 49, 67, 0.15);
        }

        .profile-histories-name {
            font-weight: 700;
            color: var(--color-galaxy-dark);
        }

        .profile-histories-meta {
            font-size: 0.8rem;
            color: var(--color-galaxy-grey);
            opacity: 0.8;
        }
    }

    .profile-histories-more {
        font-size: 0.85rem;
        font-weight: 600;
        align-self: flex-start;
    }
}
</style>
