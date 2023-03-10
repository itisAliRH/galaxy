import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { sortByObjectProp } from "@/utils/sorting";
import {
    cloneHistory,
    createAndSelectNewHistory,
    deleteHistoryById,
    getCurrentHistoryFromServer,
    getHistoryByIdFromServer,
    getHistoryList,
    secureHistoryOnServer,
    setCurrentHistoryOnServer,
    updateHistoryFields,
} from "@/stores/services/history.services";

// TODO: Add all history fields
export interface History {
    id: string;
    name: string;
}

const isLoadingHistory = new Set();

export const useHistoryStore = defineStore(
    "historyStore",
    () => {
        const historiesLoading = ref(false);
        const pinnedHistories = ref<{ id: string }[]>([]);
        const storedCurrentHistoryId = ref<string | null>(null);
        const storedHistories = ref<{ [key: string]: History }>({});

        const histories = computed(() => {
            return Object.values(storedHistories.value).sort(sortByObjectProp("name"));
        });

        const getFirstHistoryId = computed(() => {
            return storedHistories.value[0]?.id ?? null;
        });

        const currentHistory = computed(() => {
            if (storedCurrentHistoryId.value !== null) {
                return storedHistories.value[storedCurrentHistoryId.value];
            }
            return null;
        });

        const currentHistoryId = computed(() => {
            if (storedCurrentHistoryId.value === null || !(storedCurrentHistoryId.value in storedHistories.value)) {
                return getFirstHistoryId.value;
            } else {
                return storedCurrentHistoryId.value;
            }
        });

        const getHistoryById = computed(() => {
            return (historyId: string) => {
                return storedHistories.value[historyId] ?? null;
            };
        });

        const getHistoryNameById = computed(() => {
            return (historyId: string) => {
                const history = storedHistories.value[historyId];
                if (history) {
                    return history.name;
                } else {
                    return "...";
                }
            };
        });

        async function setCurrentHistory(historyId: string) {
            const currentHistory = await setCurrentHistoryOnServer(historyId);
            selectHistory(currentHistory as History);
        }

        function setCurrentHistoryId(historyId: string) {
            storedCurrentHistoryId.value = historyId;
        }

        function setHistory(history: History) {
            storedHistories.value[history.id] = history;
        }

        function setHistories(histories: History[]) {
            // The incoming history list may contain less information than the already stored
            // histories, so we ensure that already available details are not getting lost.
            const enrichedHistories = histories.map((history) => {
                const historyState = storedHistories.value[history.id] || {};
                return Object.assign({}, historyState, history);
            });
            // Histories are provided as list but stored as map.
            const newMap = enrichedHistories.reduce((acc, h) => ({ ...acc, [h.id]: h }), {}) as {
                [key: string]: History;
            };
            // Ensure that already stored histories, which are not available in the incoming array,
            // are not lost. This happens e.g. with shared histories since they have different owners.
            Object.values(storedHistories.value).forEach((history) => {
                const historyId = history.id;
                if (!newMap[historyId]) {
                    newMap[historyId] = history;
                }
            });
            // Update stored histories
            storedHistories.value = newMap;
        }

        function setHistoriesLoading(loading: boolean) {
            historiesLoading.value = loading;
        }

        function pinHistory(historyId: string) {
            pinnedHistories.value.push({ id: historyId });
        }

        function unpinHistory(historyId: string) {
            pinnedHistories.value = pinnedHistories.value.filter((h) => h.id !== historyId);
        }

        function selectHistory(history: History) {
            setHistory(history);
            setCurrentHistoryId(history.id);
        }

        async function copyHistory(history: History, name: string, copyAll: boolean) {
            const newHistory = await cloneHistory(history, name, copyAll);
            selectHistory(newHistory as History);
        }

        async function createNewHistory() {
            const newHistory = await createAndSelectNewHistory();
            return selectHistory(newHistory as History);
        }

        async function deleteHistory(historyId: string, purge: boolean) {
            const deletedHistory = (await deleteHistoryById(historyId, purge)) as History;
            delete storedHistories.value[deletedHistory.id];
            if (getFirstHistoryId.value) {
                return setCurrentHistoryId(getFirstHistoryId.value);
            } else {
                return createNewHistory();
            }
        }

        async function loadCurrentHistory() {
            const history = await getCurrentHistoryFromServer();
            selectHistory(history as History);
        }

        async function loadHistories() {
            if (!historiesLoading.value) {
                setHistoriesLoading(true);
                await getHistoryList()
                    .then((histories) => setHistories(histories))
                    .catch((error) => console.warn(error))
                    .finally(() => {
                        setHistoriesLoading(false);
                    });
            }
        }

        async function loadHistoryById(historyId: string) {
            if (!isLoadingHistory.has(historyId)) {
                await getHistoryByIdFromServer(historyId)
                    .then((history: any) => setHistory(history))
                    .catch((error: any) => console.warn(error))
                    .finally(() => {
                        isLoadingHistory.delete(historyId);
                    });
                isLoadingHistory.add(historyId);
            }
        }

        async function secureHistory(history: History) {
            const securedHistory = await secureHistoryOnServer(history);
            setHistory(securedHistory as History);
        }

        async function updateHistory({ id, ...update }: History) {
            const savedHistory = await updateHistoryFields(id, update);
            setHistory(savedHistory as History);
        }

        return {
            histories,
            currentHistory,
            currentHistoryId,
            pinnedHistories,
            getHistoryById,
            getHistoryNameById,
            setCurrentHistory,
            setCurrentHistoryId,
            setHistory,
            setHistories,
            pinHistory,
            unpinHistory,
            selectHistory,
            copyHistory,
            createNewHistory,
            deleteHistory,
            loadCurrentHistory,
            loadHistories,
            loadHistoryById,
            secureHistory,
            updateHistory,
            historiesLoading,
        };
    },
    {
        persist: {
            paths: ["pinnedHistories"],
        },
    }
);
