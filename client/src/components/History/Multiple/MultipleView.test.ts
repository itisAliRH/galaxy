import axios from "axios";
import { createPinia } from "pinia";
import flushPromises from "flush-promises";
import MockAdapter from "axios-mock-adapter";
import MultipleView from "./MultipleView.vue";
import { getLocalVue } from "tests/jest/helpers";
import { mount, type Wrapper } from "@vue/test-utils";
import { useUserStore } from "@/stores/userStore";
import { useHistoryStore } from "@/stores/historyStore";

const COUNT = 8;
const USER_ID = "test-user-id";
const currentUser = { id: USER_ID, email: "u@se.r", tags_used: [] };
const CURRENT_HISTORY_ID = "test-history-id-1";

const getFakeHistorySummaries = (num: number, selectedIndex: number) => {
    return Array.from({ length: num }, (_, index) => ({
        id: selectedIndex === index ? CURRENT_HISTORY_ID : `test-history-id-${index}`,
        name: `History-${index}`,
        tags: [],
        update_time: new Date().toISOString(),
    }));
};

describe("MultipleView", () => {
    let userStore;
    let historyStore;
    let axiosMock: MockAdapter;
    let wrapper: Wrapper<MultipleView>;

    beforeEach(async () => {
        const pinia = createPinia();
        const localVue = getLocalVue();
        axiosMock = new MockAdapter(axios);

        wrapper = mount(MultipleView, { pinia, localVue });

        userStore = useUserStore();
        userStore.currentUser = currentUser;
        historyStore = useHistoryStore();
        historyStore.setHistories(getFakeHistorySummaries(COUNT, 0));
        historyStore.setCurrentHistoryId(CURRENT_HISTORY_ID);

        axiosMock
            .onGet(new RegExp(`/api/histories/${CURRENT_HISTORY_ID}/contents\\?.*`))
            .reply(200, { stats: { total_matches: 0 }, contents: [] });
        await flushPromises();
    });

    afterEach(() => {
        axiosMock.reset();
    });

    it("should show the current history", async () => {
        expect(wrapper.find("button[title='Current History']").exists()).toBeTruthy();
    });
});
