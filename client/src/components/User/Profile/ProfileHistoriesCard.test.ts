import { getLocalVue } from "@tests/vitest/helpers";
import { mount } from "@vue/test-utils";
import flushPromises from "flush-promises";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import VueRouter from "vue-router";

import { useServerMock } from "@/api/client/__mocks__";

import ProfileHistoriesCard from "./ProfileHistoriesCard.vue";

const localVue = getLocalVue(true);
localVue.use(VueRouter);
const { server, http } = useServerMock();

const TEST_USERNAME = "public-alice";

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

async function mountCard() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(ProfileHistoriesCard as object, {
        localVue,
        pinia,
        router: new VueRouter(),
        propsData: { username: TEST_USERNAME },
    });
    await flushPromises();
    return wrapper;
}

describe("ProfileHistoriesCard.vue", () => {
    it("lists published histories with the exact-match user filter", async () => {
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

    it("renders nothing when the user has no published histories", async () => {
        server.use(
            http.get("/api/histories", ({ response }) =>
                response(200).json([] as never, { headers: { total_matches: "0" } }),
            ),
        );
        const wrapper = await mountCard();

        expect(wrapper.find("section").exists()).toBe(false);
    });

    it("links to the full published list when there are more items", async () => {
        server.use(
            http.get("/api/histories", ({ response }) =>
                response(200).json([1, 2, 3, 4, 5].map((n) => history(`h${n}`, `History ${n}`)) as never, {
                    headers: { total_matches: "12" },
                }),
            ),
        );
        const wrapper = await mountCard();

        expect(wrapper.text()).toContain("View all 12");
    });
});
