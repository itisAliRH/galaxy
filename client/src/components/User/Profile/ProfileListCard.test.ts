import { getLocalVue } from "@tests/vitest/helpers";
import { mount } from "@vue/test-utils";
import flushPromises from "flush-promises";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import VueRouter from "vue-router";

import { useServerMock } from "@/api/client/__mocks__";

import { PROFILE_SECTIONS } from "./sections";

import ProfileListCard from "./ProfileListCard.vue";

const localVue = getLocalVue(true);
localVue.use(VueRouter);
const { server, http } = useServerMock();

const TEST_USERNAME = "public-alice";

const historiesSection = PROFILE_SECTIONS.find((section) => section.key === "histories")!;

function history(id: string, name: string) {
    return {
        id,
        name,
        update_time: "2026-07-01T12:00:00.000Z",
        username: TEST_USERNAME,
        owner: TEST_USERNAME,
        published: true,
    };
}

function mockHistories(items: ReturnType<typeof history>[], total = items.length) {
    server.use(
        http.get("/api/histories", ({ response }) =>
            response(200).json(items as never, { headers: { total_matches: String(total) } }),
        ),
    );
}

async function mountCard(props: Record<string, unknown> = {}) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(ProfileListCard as object, {
        localVue,
        pinia,
        router: new VueRouter(),
        propsData: { definition: historiesSection, username: TEST_USERNAME, ...props },
    });
    await flushPromises();
    return wrapper;
}

describe("ProfileListCard.vue", () => {
    it("lists published items with the exact-match user filter", async () => {
        let searchParam: string | null = null;
        server.use(
            http.get("/api/histories", ({ request, response }) => {
                searchParam = new URL(request.url).searchParams.get("search");
                return response(200).json([history("abc1", "RNA-seq reference run")] as never, {
                    headers: { total_matches: "1" },
                });
            }),
        );
        const wrapper = await mountCard();

        expect(searchParam).toBe(`user:'${TEST_USERNAME}'`);
        expect(wrapper.text()).toContain("Published histories");
        expect(wrapper.text()).toContain("RNA-seq reference run");
        expect(wrapper.text()).not.toContain("View all");
    });

    it("renders nothing for visitors when the list is empty", async () => {
        mockHistories([]);
        const wrapper = await mountCard();

        expect(wrapper.find("section").exists()).toBe(false);
    });

    it("shows an empty hint to the owner", async () => {
        mockHistories([]);
        const wrapper = await mountCard({ editable: true });

        expect(wrapper.text()).toContain("No published histories yet");
    });

    it("renders nothing for visitors when the section is hidden", async () => {
        mockHistories([history("h1", "History 1")]);
        const wrapper = await mountCard({ visible: false });

        expect(wrapper.find("section").exists()).toBe(false);
    });

    it("shows the hidden note to the owner when the section is hidden", async () => {
        mockHistories([history("h1", "History 1")]);
        const wrapper = await mountCard({ editable: true, visible: false });

        expect(wrapper.text()).toContain("Hidden — only you can see this section.");
        expect(wrapper.text()).toContain("History 1");
    });

    it("applies pins, manual order, and the item limit", async () => {
        mockHistories([1, 2, 3, 4, 5].map((n) => history(`h${n}`, `History ${n}`)));
        const wrapper = await mountCard({
            layout: { limit: 3, pinned: ["h4"], item_order: ["h3", "h1"] },
        });

        const names = wrapper.findAll(".profile-list-name").wrappers.map((w) => w.text());
        expect(names).toEqual(["History 4", "History 3", "History 1"]);
    });

    it("links to the full published list when there are more items than the limit", async () => {
        mockHistories(
            [1, 2, 3, 4, 5].map((n) => history(`h${n}`, `History ${n}`)),
            12,
        );
        const wrapper = await mountCard();

        expect(wrapper.text()).toContain("View all 12");
    });

    it("emits a layout update when the owner pins an item", async () => {
        mockHistories([history("h1", "History 1"), history("h2", "History 2")]);
        const wrapper = await mountCard({ editable: true });

        await wrapper.findAll(".profile-list-pin").wrappers[1]!.trigger("click");

        const emitted = wrapper.emitted("update:layout");
        expect(emitted).toHaveLength(1);
        expect(emitted![0]![0].pinned).toEqual(["h2"]);
    });
});
