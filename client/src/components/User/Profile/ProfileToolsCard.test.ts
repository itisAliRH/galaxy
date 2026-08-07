import { getFakeRegisteredUser } from "@tests/test-data";
import { getLocalVue } from "@tests/vitest/helpers";
import { mount } from "@vue/test-utils";
import flushPromises from "flush-promises";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import VueRouter from "vue-router";

import { useServerMock } from "@/api/client/__mocks__";
import { useUserStore } from "@/stores/userStore";

import ProfileToolsCard from "./ProfileToolsCard.vue";

const localVue = getLocalVue(true);
localVue.use(VueRouter);
const { server, http } = useServerMock();

const TOOLS = [
    { id: "cat1", name: "Concatenate datasets" },
    { id: "head1", name: "Select first lines" },
    { id: "sort1", name: "Sort data" },
];

const OWNER_FAVORITES = {
    tools: ["cat1", "head1", "sort1"],
    tags: ["genomics"],
    edam_operations: [],
    edam_topics: [],
    order: [
        { object_type: "tools", object_id: "cat1" },
        { object_type: "tags", object_id: "genomics" },
        { object_type: "tools", object_id: "head1" },
        { object_type: "tools", object_id: "sort1" },
    ],
};

let pinia: ReturnType<typeof createPinia>;

beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
});

function seedUser(favorites?: object) {
    const userStore = useUserStore();
    userStore.currentUser = getFakeRegisteredUser({ id: "fake_user_id", username: "owner-user" });
    if (favorites) {
        userStore.currentPreferences = { favorites } as never;
    }
    return userStore;
}

async function mountCard(props: Record<string, unknown> = {}) {
    const wrapper = mount(ProfileToolsCard as object, {
        localVue,
        pinia,
        router: new VueRouter(),
        propsData: { tools: TOOLS, ...props },
    });
    await flushPromises();
    return wrapper;
}

describe("ProfileToolsCard.vue", () => {
    describe("visitor view", () => {
        it("shows all provided tools with a favorite button each", async () => {
            seedUser();
            const wrapper = await mountCard();
            expect(wrapper.findAll(".profile-tools-item").length).toBe(3);
            expect(wrapper.findAll(".profile-tools-favorite").length).toBe(3);
            expect(wrapper.find(".profile-tools-grip").exists()).toBe(false);
        });

        it("adds a tool to the visitor's favorites through the favorites API", async () => {
            seedUser({ tools: [], tags: [], edam_operations: [], edam_topics: [], order: [] });
            let putBody: unknown = null;
            server.use(
                http.put("/api/users/{user_id}/favorites/{object_type}", async ({ request, response }) => {
                    putBody = await request.json();
                    return response(200).json({ tools: ["cat1"], order: [] } as never);
                }),
            );
            const wrapper = await mountCard();
            await wrapper.find(".profile-tools-favorite").trigger("click");
            await flushPromises();
            expect(putBody).toEqual({ object_id: "cat1" });
        });

        it("disables the favorite button for anonymous users", async () => {
            const userStore = useUserStore();
            userStore.currentUser = { isAnonymous: true, total_disk_usage: 0 } as never;
            const wrapper = await mountCard();
            const button = wrapper.find(".profile-tools-favorite");
            expect(button.classes()).toContain("g-disabled");
        });
    });

    describe("owner view", () => {
        it("slices the visible rows to the layout limit and reports the hidden tail", async () => {
            seedUser(OWNER_FAVORITES);
            const wrapper = await mountCard({ editable: true, layout: { limit: 2 } });
            expect(wrapper.findAll(".profile-tools-item").length).toBe(2);
            expect(wrapper.find(".profile-tools-more").text()).toContain("1 more");
        });

        it("emits only the limit on slider change", async () => {
            seedUser(OWNER_FAVORITES);
            const wrapper = await mountCard({ editable: true, layout: { limit: 2 }, maxItems: 10 });
            const slider = wrapper.find("input[type=range]");
            (slider.element as HTMLInputElement).value = "3";
            await slider.trigger("change");
            const emitted = wrapper.emitted("update:layout")!;
            expect(emitted[emitted.length - 1]![0]).toEqual({ limit: 3 });
        });

        it("persists a drag reorder into the full favorites order, preserving non-tool entries", async () => {
            const userStore = seedUser(OWNER_FAVORITES);
            let putBody: { order: { object_type: string; object_id: string }[] } | null = null;
            server.use(
                http.put("/api/users/{user_id}/favorites/order", async ({ request, response }) => {
                    putBody = (await request.json()) as never;
                    return response(200).json({ ...OWNER_FAVORITES, ...putBody } as never);
                }),
            );
            const wrapper = await mountCard({ editable: true });
            // simulate vuedraggable committing a drop through the writable computed
            wrapper.findComponent({ name: "draggable" }).vm.$emit("input", [TOOLS[2], TOOLS[0], TOOLS[1]]);
            await flushPromises();
            expect(putBody!.order).toEqual([
                { object_type: "tools", object_id: "sort1" },
                { object_type: "tags", object_id: "genomics" },
                { object_type: "tools", object_id: "cat1" },
                { object_type: "tools", object_id: "head1" },
            ]);
            expect(userStore.currentFavorites.order).toEqual(putBody!.order);
        });

        it("resets the local order when the reorder request fails", async () => {
            seedUser(OWNER_FAVORITES);
            server.use(
                http.put("/api/users/{user_id}/favorites/order", ({ response }) =>
                    response("5XX").json({ err_msg: "boom", err_code: 500 }, { status: 500 }),
                ),
            );
            const wrapper = await mountCard({ editable: true });
            wrapper.findComponent({ name: "draggable" }).vm.$emit("input", [TOOLS[2], TOOLS[0], TOOLS[1]]);
            await flushPromises();
            const names = wrapper.findAll(".profile-tools-name");
            expect(names.at(0).text()).toBe("Concatenate datasets");
        });

        it("keeps the eye toggle wiring and reports content", async () => {
            seedUser(OWNER_FAVORITES);
            const wrapper = await mountCard({ editable: true });
            expect(wrapper.emitted("loaded")![0]![0]).toBe(true);
        });
    });
});
