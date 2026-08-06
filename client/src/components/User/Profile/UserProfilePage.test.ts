import { getFakeRegisteredUser } from "@tests/test-data";
import { getLocalVue } from "@tests/vitest/helpers";
import { mount } from "@vue/test-utils";
import flushPromises from "flush-promises";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import VueRouter from "vue-router";

import { useServerMock } from "@/api/client/__mocks__";
import { useUserStore } from "@/stores/userStore";

import UserProfilePage from "./UserProfilePage.vue";

const localVue = getLocalVue(true);
localVue.use(VueRouter);
const { server, http } = useServerMock();

const TEST_USERNAME = "public-alice";

function publicProfile(overrides: Record<string, unknown> = {}) {
    return {
        username: TEST_USERNAME,
        display_name: "Alice Doe",
        description: "Galaxy core committer and software engineer",
        affiliation: "University of Freiburg",
        research_interests: null,
        orcid: "0000-0002-1825-0097",
        links: [{ label: "website", url: "https://example.org" }],
        visible_sections: {},
        layout: null,
        ...overrides,
    };
}

/** Every section card fetches its list on mount; default to empty lists. */
function mockEmptySections() {
    const emptyInit = { headers: { total_matches: "0" } };
    server.use(
        http.get("/api/configuration", ({ response }) => response(200).json({} as never)),
        http.get("/api/histories", ({ response }) => response(200).json([] as never, emptyInit)),
        http.get("/api/workflows", ({ response }) => response(200).json([] as never, emptyInit)),
        http.get("/api/pages", ({ response }) => response(200).json([] as never, emptyInit)),
        http.get("/api/visualizations", ({ response }) => response(200).json([] as never, emptyInit)),
    );
}

async function mountPage(username = TEST_USERNAME, currentUsername: string | null = null) {
    const pinia = createPinia();
    setActivePinia(pinia);
    if (currentUsername) {
        const userStore = useUserStore();
        userStore.currentUser = getFakeRegisteredUser({ username: currentUsername });
    }
    const wrapper = mount(UserProfilePage as object, {
        localVue,
        pinia,
        router: new VueRouter(),
        propsData: { username },
    });
    await flushPromises();
    return wrapper;
}

describe("UserProfilePage.vue", () => {
    it("renders identity from the public API", async () => {
        mockEmptySections();
        server.use(http.get("/api/profiles/{username}", ({ response }) => response(200).json(publicProfile())));
        const wrapper = await mountPage();

        expect(wrapper.text()).toContain("Alice Doe");
        expect(wrapper.text()).toContain(TEST_USERNAME);
        expect(wrapper.text()).toContain("Galaxy core committer and software engineer");
        expect(wrapper.text()).toContain("University of Freiburg");
        expect(wrapper.text()).toContain("0000-0002-1825-0097");
        expect(wrapper.find(".gx-brand").exists()).toBe(true);
        expect(wrapper.find("svg.profile-avatar").exists()).toBe(true);
    });

    it("falls back to the username when display_name is unset", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{username}", ({ response }) =>
                response(200).json(publicProfile({ display_name: null })),
            ),
        );
        const wrapper = await mountPage();

        expect(wrapper.find("h1").text()).toBe(TEST_USERNAME);
    });

    it("shows the not-found state on 404", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{username}", ({ response }) =>
                response("4XX").json({ err_msg: "not found", err_code: 404001 }, { status: 404 }),
            ),
        );
        const wrapper = await mountPage("nobody");

        expect(wrapper.text()).toContain("No public profile");
    });

    it("centers the identity for visitors when no section has content", async () => {
        mockEmptySections();
        server.use(http.get("/api/profiles/{username}", ({ response }) => response(200).json(publicProfile())));
        const wrapper = await mountPage(TEST_USERNAME, "someone-else");

        expect(wrapper.find(".user-profile-layout-solo").exists()).toBe(true);
        expect(wrapper.find(".user-profile-content").isVisible()).toBe(false);
    });

    it("lists section content for visitors", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{username}", ({ response }) => response(200).json(publicProfile())),
            http.get("/api/histories", ({ response }) =>
                response(200).json(
                    [
                        {
                            id: "abc1",
                            name: "RNA-seq reference run",
                            update_time: "2026-07-01T12:00:00.000Z",
                            username: TEST_USERNAME,
                            owner: TEST_USERNAME,
                            published: true,
                        },
                    ] as never,
                    { headers: { total_matches: "1" } },
                ),
            ),
        );
        const wrapper = await mountPage(TEST_USERNAME, "someone-else");

        expect(wrapper.find(".user-profile-layout-solo").exists()).toBe(false);
        expect(wrapper.text()).toContain("Published histories");
        expect(wrapper.text()).toContain("RNA-seq reference run");
        // visitors get no editing chrome
        expect(wrapper.find(".click-to-edit-label").exists()).toBe(false);
        expect(wrapper.text()).not.toContain("Page settings");
    });

    it("turns on inline editing for the owner", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(publicProfile({ published: true }) as never),
            ),
        );
        const wrapper = await mountPage(TEST_USERNAME, TEST_USERNAME);

        expect(wrapper.find(".click-to-edit-label").exists()).toBe(true);
        expect(wrapper.text()).toContain("Page settings");
        expect(wrapper.text()).toContain("This is your page as visitors see it.");
        expect(wrapper.text()).not.toContain("Your page is not published");
    });

    it("hides editing affordances in the owner's public preview", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(publicProfile({ published: true }) as never),
            ),
        );
        const wrapper = await mountPage(TEST_USERNAME, TEST_USERNAME);

        await wrapper.find("#profile-public-view").trigger("click");

        expect(wrapper.text()).toContain("This is how visitors see your page.");
        expect(wrapper.find(".click-to-edit-label").exists()).toBe(false);
        expect(wrapper.text()).toContain("Back to editing");
    });

    it("fills the main column with a placeholder when only side sections have content", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{username}", ({ response }) =>
                response(200).json(
                    publicProfile({
                        visible_sections: { histories: false, workflows: false, pages: false },
                        starred_tools: [{ id: "cat1", name: "Concatenate datasets" }],
                    }),
                ),
            ),
        );
        const wrapper = await mountPage(TEST_USERNAME, "someone-else");

        expect(wrapper.find(".user-profile-layout-solo").exists()).toBe(false);
        expect(wrapper.text()).toContain("Nothing shared here yet.");
        expect(wrapper.text()).toContain("Starred tools");
    });

    it("shows starred tools from the profile payload", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{username}", ({ response }) =>
                response(200).json(publicProfile({ starred_tools: [{ id: "cat1", name: "Concatenate datasets" }] })),
            ),
        );
        const wrapper = await mountPage(TEST_USERNAME, "someone-else");

        expect(wrapper.text()).toContain("Starred tools");
        expect(wrapper.text()).toContain("Concatenate datasets");
        expect(wrapper.find(".user-profile-layout-solo").exists()).toBe(false);
    });

    it("switches to the owner view after the user store hydrates", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{username}", ({ response }) =>
                response("4XX").json({ err_msg: "not found", err_code: 404001 }, { status: 404 }),
            ),
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(publicProfile({ published: false }) as never),
            ),
        );
        const pinia = createPinia();
        setActivePinia(pinia);
        const wrapper = mount(UserProfilePage as object, {
            localVue,
            pinia,
            router: new VueRouter(),
            propsData: { username: TEST_USERNAME },
        });
        await flushPromises();
        expect(wrapper.text()).toContain("No public profile");

        const userStore = useUserStore();
        userStore.currentUser = getFakeRegisteredUser({ username: TEST_USERNAME });
        await flushPromises();

        expect(wrapper.text()).toContain("Your page is not published");
        expect(wrapper.find(".click-to-edit-label").exists()).toBe(true);
    });

    it("shows the unpublished banner with a publish action to the owner", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(publicProfile({ published: false }) as never),
            ),
        );
        const wrapper = await mountPage(TEST_USERNAME, TEST_USERNAME);

        expect(wrapper.text()).toContain("Your page is not published");
        expect(wrapper.find("#profile-publish-now").exists()).toBe(true);
    });

    it("hides about fields from visitors when the about section is toggled off", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{username}", ({ response }) =>
                response(200).json(publicProfile({ visible_sections: { about: false } })),
            ),
        );
        const wrapper = await mountPage();

        expect(wrapper.text()).toContain("Alice Doe");
        expect(wrapper.text()).not.toContain("University of Freiburg");
    });
});
