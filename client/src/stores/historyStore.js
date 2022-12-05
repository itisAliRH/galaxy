import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { sortByObjectProp } from "utils/sorting";
import {
    cloneHistory,
    createAndSelectNewHistory,
    deleteHistoryById,
    getCurrentHistoryFromServer,
    getHistoryList,
    secureHistoryOnServer,
    setCurrentHistoryOnServer,
    updateHistoryFields,
} from "./services/history.services";

export const useHistoryStore = defineStore(
    "historyStore",
    () => {
        const isLoadingHistory = ref(new Set());
        const isLoadingHistories = ref(false);

        /* Store state */
        const histories = ref({});
        const pinnedHistories = ref([]);
        const currentHistoryId = ref(null);
        const historiesLoading = ref(false);

        /* Store getters */
        const currentHistory = computed(() => {
            return histories.value[currentHistoryId.value] || null;
        });

        const getCurrentHistoryId = () => {
            return currentHistoryId.value || getFirstHistoryId();
        };

        const getFirstHistory = () => {
            return histories.value[0] || null;
        };

        const getFirstHistoryId = () => {
            return histories.value[0]?.id || null;
        };

        const getHistories = () => {
            return Object.values(histories.value).sort(sortByObjectProp("name"));
        };

        const getHistoryById = (id) => {
            return histories.value[id] || null;
        };

        const getHistoryNameById = (id) => {
            const details = histories.value[id];
            if (details && details.name) {
                return details.name;
            } else {
                return "...";
            }
        };

        /* Store actions */
        const setCurrentHistoryId = (id) => {
            currentHistoryId.value = id;
        };

        const setHistory = (history) => {
            histories.value[history.id] = history;
        };

        const setHistories = (newHistories = []) => {
            // The incoming history list may contain less information than the already stored
            // histories, so we ensure that already available details are not getting lost.
            const enrichedHistories = newHistories.map((history) => {
                const historyState = histories.value[history.id] || {};
                return Object.assign({}, historyState, history);
            });
            // Histories are provided as list but stored as map.
            const newMap = enrichedHistories.reduce((acc, h) => ({ ...acc, [h.id]: h }), {});
            // Ensure that already stored histories, which are not available in the incoming array,
            // are not lost. This happens e.g. with shared histories since they have different owners.
            Object.values(histories.value).forEach((history) => {
                const historyId = history.id;
                if (!newMap[historyId]) {
                    newMap[historyId] = history;
                }
            });
            // Update stored histories
            histories.value = newMap;
        };

        const setHistoriesLoading = (isLoading) => {
            historiesLoading.value = isLoading;
        };

        const pinHistory = (historyId) => {
            pinnedHistories.value.push({ id: historyId });
        };

        const unpinHistory = (historyId) => {
            pinnedHistories.value = pinnedHistories.value.filter((h) => h.id !== historyId);
        };

        const selectHistory = (history) => {
            setHistory(history);
            setCurrentHistoryId(history.id);
        };

        const copyHistory = async (historyId, name, copyAll) => {
            const newHistory = await cloneHistory(history, name, copyAll);
            return selectHistory(newHistory);
        };

        const createNewHistory = async () => {
            const newHistory = await createAndSelectNewHistory();
            return selectHistory(newHistory);
        };

        const deleteHistory = async (historyId, purge) => {
            const deletedHistory = await deleteHistoryById(historyId, purge);
            delete histories.value[deletedHistory.id];
            if (getFirstHistoryId()) {
                return setCurrentHistoryId(getFirstHistoryId());
            } else {
                return createNewHistory();
            }
        };

        const loadCurrentHistory = async () => {
            return getCurrentHistoryFromServer().then((history) => selectHistory(history));
        };

        const loadHistories = async () => {
            if (!isLoadingHistories.value) {
                setHistoriesLoading(true);
                isLoadingHistories.value = getHistoryList()
                    .then((histories) => setHistories(histories))
                    .catch((error) => console.warn(error))
                    .finally(() => {
                        isLoadingHistories.value = false;
                        setHistoriesLoading(false);
                    });
            }
        };

        const loadHistoryById = async (historyId) => {
            if (!isLoadingHistory.value.has(historyId)) {
                getHistoryById(historyId)
                    .then((history) => setHistory(history))
                    .catch((error) => console.error(error))
                    .finally(() => isLoadingHistory.value.delete(historyId));
                isLoadingHistory.value.add(historyId);
            }
        };

        const resetHistory = () => {
            setHistories([]);
            setCurrentHistoryId(null);
        };

        const secureHistory = async (history) => {
            const securedHistory = await secureHistoryOnServer(history);
            setHistory(securedHistory);
        };

        const setCurrentHistory = async (id) => {
            const changedHistory = await setCurrentHistoryOnServer(id);
            selectHistory(changedHistory);
        };

        const updateHistory = async (id, updateFields) => {
            // save new history params should be an object with an id property and any additional
            // properties that are to be updated on the server. A full history object is not required
            const saveResult = await updateHistoryFields(id, updateFields);
            setHistory(saveResult);
        };

        return {
            histories,
            currentHistory,
            pinnedHistories,
            currentHistoryId,
            historiesLoading,
            setHistory,
            copyHistory,
            getHistories,
            deleteHistory,
            updateHistory,
            loadHistories,
            secureHistory,
            loadHistoryById,
            createNewHistory,
            getFirstHistory,
            getFirstHistoryId,
            setCurrentHistory,
            loadCurrentHistory,
            getHistoryNameById,
            getCurrentHistoryId,
            pinHistory,
            unpinHistory,
            resetHistory,
        };
    },
    {
        persist: ["pinnedHistories"],
    }
);
