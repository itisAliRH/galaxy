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
        ...overrides,
    };
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
        server.use(
            http.get("/api/profiles/{username}", ({ response }) =>
                response(200).json(publicProfile({ display_name: null })),
            ),
        );
        const wrapper = await mountPage();

        expect(wrapper.find("h1").text()).toBe(TEST_USERNAME);
    });

    it("shows the not-found state on 404", async () => {
        server.use(
            http.get("/api/profiles/{username}", ({ response }) =>
                response("4XX").json({ err_msg: "not found", err_code: 404001 }, { status: 404 }),
            ),
        );
        const wrapper = await mountPage("nobody");

        expect(wrapper.text()).toContain("No public profile");
    });

    it("shows the edit button only for the owner", async () => {
        server.use(http.get("/api/profiles/{username}", ({ response }) => response(200).json(publicProfile())));
        const asOwner = await mountPage(TEST_USERNAME, TEST_USERNAME);
        expect(asOwner.text()).toContain("Edit profile");

        const asVisitor = await mountPage(TEST_USERNAME, "someone-else");
        expect(asVisitor.text()).not.toContain("Edit profile");
    });

    it("hides about fields when the about section is toggled off", async () => {
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
