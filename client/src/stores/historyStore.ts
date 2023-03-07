import { defineStore } from "pinia";
import { sortByObjectProp } from "@/utils/sorting";
import {
    cloneHistory,
    createAndSelectNewHistory,
    deleteHistoryById,
    getCurrentHistoryFromServer,
    getHistoryById,
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

interface State {
    storedHistories: { [key: string]: History };
    pinnedHistories: { id: string }[];
    storedCurrentHistoryId: string | null;
    historiesLoading: boolean;
}

const isLoadingHistory = new Set();

export const useHistoryStore = defineStore("historyStore", {
    state: (): State => ({
        storedHistories: {},
        pinnedHistories: [],
        storedCurrentHistoryId: null,
        historiesLoading: false,
    }),
    getters: {
        histories(state) {
            return Object.values(state.storedHistories).sort(sortByObjectProp("name"));
        },
        firstHistory(state) {
            return state.storedHistories[0] ?? null;
        },
        getFirstHistoryId(state) {
            return state.storedHistories[0]?.id ?? null;
        },
        currentHistory(state) {
            if (state.storedCurrentHistoryId !== null) {
                return state.storedHistories[state.storedCurrentHistoryId];
            }
            return null;
        },
        currentHistoryId(state): string | null {
            const { storedHistories, storedCurrentHistoryId } = state;
            if (storedCurrentHistoryId === null || !(storedCurrentHistoryId in storedHistories)) {
                return this.getFirstHistoryId;
            } else {
                return storedCurrentHistoryId;
            }
        },
        getHistoryById(state) {
            return (historyId: string) => {
                return state.storedHistories[historyId] ?? null;
            };
        },
        getHistoryNameById(state) {
            return (historyId: string) => {
                const history = state.storedHistories[historyId];
                if (history) {
                    return history.name;
                } else {
                    return "...";
                }
            };
        },
    },
    actions: {
        async setCurrentHistory(historyId: string) {
            const currentHistory = await setCurrentHistoryOnServer(historyId);
            this.selectHistory(currentHistory as History);
        },
        setCurrentHistoryId(historyId: string) {
            this.storedCurrentHistoryId = historyId;
        },
        setHistory(history: History) {
            this.storedHistories[history.id] = history;
        },
        setHistories(histories: History[]) {
            // The incoming history list may contain less information than the already stored
            // histories, so we ensure that already available details are not getting lost.
            const enrichedHistories = histories.map((history) => {
                const historyState = this.storedHistories[history.id] || {};
                return Object.assign({}, historyState, history);
            });
            // Histories are provided as list but stored as map.
            const newMap = enrichedHistories.reduce((acc, h) => ({ ...acc, [h.id]: h }), {}) as {
                [key: string]: History;
            };
            // Ensure that already stored histories, which are not available in the incoming array,
            // are not lost. This happens e.g. with shared histories since they have different owners.
            Object.values(this.storedHistories).forEach((history) => {
                const historyId = history.id;
                if (!newMap[historyId]) {
                    newMap[historyId] = history;
                }
            });
            // Update stored histories
            this.storedHistories = newMap;
        },
        setHistoriesLoading(loading: boolean) {
            this.historiesLoading = loading;
        },
        pinHistory(historyId: string) {
            this.pinnedHistories.push({ id: historyId });
        },
        unpinHistory(historyId: string) {
            this.pinnedHistories = this.pinnedHistories.filter((h) => h.id !== historyId);
        },
        selectHistory(history: History) {
            this.setHistory(history);
            this.setCurrentHistoryId(history.id);
        },
        async copyHistory(history: History, name: string, copyAll: boolean) {
            const newHistory = await cloneHistory(history, name, copyAll);
            this.selectHistory(newHistory as History);
        },
        async createNewHistory() {
            const newHistory = await createAndSelectNewHistory();
            return this.selectHistory(newHistory as History);
        },
        async deleteHistory(historyId: string, purge: boolean) {
            const deletedHistory = (await deleteHistoryById(historyId, purge)) as History;
            delete this.storedHistories[deletedHistory.id];
            if (this.getFirstHistoryId) {
                return this.setCurrentHistoryId(this.getFirstHistoryId);
            } else {
                return this.createNewHistory();
            }
        },
        async loadCurrentHistory() {
            const history = await getCurrentHistoryFromServer();
            this.selectHistory(history as History);
        },
        async loadHistories() {
            if (!this.historiesLoading) {
                this.setHistoriesLoading(true);
                await getHistoryList()
                    .then((histories) => this.setHistories(histories))
                    .catch((error) => console.warn(error))
                    .finally(() => {
                        this.setHistoriesLoading(false);
                    });
            }
        },
        async loadHistoryById(historyId: string) {
            if (!isLoadingHistory.has(historyId)) {
                await getHistoryById(historyId)
                    .then((history) => this.setHistory(history as History))
                    .catch((error) => console.warn(error))
                    .finally(() => {
                        isLoadingHistory.delete(historyId);
                    });
                isLoadingHistory.add(historyId);
            }
        },
        async secureHistory(history: History) {
            const securedHistory = await secureHistoryOnServer(history);
            this.setHistory(securedHistory as History);
        },
        async updateHistory({ id, ...update }: History) {
            const savedHistory = await updateHistoryFields(id, update);
            this.setHistory(savedHistory as History);
        },
    },
    persist: {
        paths: ["pinnedHistories"],
    },
});
