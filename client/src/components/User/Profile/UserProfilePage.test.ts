import { getFakeRegisteredUser } from "@tests/test-data";
import { getLocalVue } from "@tests/vitest/helpers";
import { enableAutoDestroy, mount } from "@vue/test-utils";
import flushPromises from "flush-promises";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import VueRouter from "vue-router";

import { useServerMock } from "@/api/client/__mocks__";
import { useUserStore } from "@/stores/userStore";

import ProfileItemPreviewModal from "./ProfileItemPreviewModal.vue";
import ProfileReadmeCard from "./ProfileReadmeCard.vue";
import UserProfilePage from "./UserProfilePage.vue";

// The readme card embeds PageView (and with it the whole Markdown rendering
// stack); its internals are out of scope here, so stub it file-wide.
vi.mock("@/components/Page/PageView.vue", () => ({
    default: { name: "PageView", props: ["pageId"], render: (h: (tag: string) => unknown) => h("div") },
}));

const localVue = getLocalVue(true);
localVue.use(VueRouter);
const { server, http } = useServerMock();

enableAutoDestroy(afterEach);

const TEST_USERNAME = "public-alice";
const TEST_USER_ENCODED_ID = "f2db41e1fa331b3e";

function publicProfile(overrides: Record<string, unknown> = {}) {
    return {
        id: TEST_USER_ENCODED_ID,
        username: TEST_USERNAME,
        display_name: "Alice Doe",
        email_hash: "d41d8cd98f00b204e9800998ecf8427e",
        description: "Galaxy core committer and software engineer",
        affiliation: "University of Freiburg",
        research_interests: null,
        orcid: "0000-0002-1825-0097",
        links: [{ type: "custom", url: "https://example.org" }],
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

async function mountPage(identifier = TEST_USERNAME, currentUsername: string | null = null) {
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
        propsData: { identifier },
    });
    await flushPromises();
    return wrapper;
}

describe("UserProfilePage.vue", () => {
    it("renders identity from the public API", async () => {
        mockEmptySections();
        server.use(http.get("/api/profiles/{user_identifier}", ({ response }) => response(200).json(publicProfile())));
        const wrapper = await mountPage();

        expect(wrapper.text()).toContain("Alice Doe");
        expect(wrapper.text()).toContain(TEST_USERNAME);
        expect(wrapper.text()).toContain("Galaxy core committer and software engineer");
        expect(wrapper.text()).toContain("University of Freiburg");
        expect(wrapper.text()).toContain("0000-0002-1825-0097");
        expect(wrapper.find(".gx-brand").exists()).toBe(true);
        expect(wrapper.find("img.user-avatar").exists()).toBe(true);
    });

    it("falls back to the username when display_name is unset", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{user_identifier}", ({ response }) =>
                response(200).json(publicProfile({ display_name: null })),
            ),
        );
        const wrapper = await mountPage();

        expect(wrapper.find("h1").text()).toBe(TEST_USERNAME);
    });

    it("shows the not-found state on 404", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{user_identifier}", ({ response }) =>
                response("4XX").json({ err_msg: "not found", err_code: 404001 }, { status: 404 }),
            ),
        );
        const wrapper = await mountPage("nobody");

        expect(wrapper.text()).toContain("No public profile");
    });

    it("centers the identity for visitors when no section has content", async () => {
        mockEmptySections();
        server.use(http.get("/api/profiles/{user_identifier}", ({ response }) => response(200).json(publicProfile())));
        const wrapper = await mountPage(TEST_USERNAME, "someone-else");

        expect(wrapper.find(".user-profile-layout-solo").exists()).toBe(true);
        expect(wrapper.find(".user-profile-content").isVisible()).toBe(false);
    });

    it("lists section content for visitors", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{user_identifier}", ({ response }) => response(200).json(publicProfile())),
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

    it("opens the identity editor only once the owner asks for it", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(publicProfile({ published: true }) as never),
            ),
        );
        const wrapper = await mountPage(TEST_USERNAME, TEST_USERNAME);

        // the identity card reads as visitors see it until "Edit profile" is clicked
        expect(wrapper.find("h1.profile-identity-name").exists()).toBe(true);
        expect(wrapper.text()).not.toContain("Research interests");
        expect(wrapper.text()).toContain("Page settings");
        expect(wrapper.text()).toContain("This is your page as visitors see it.");
        expect(wrapper.text()).not.toContain("Your page is not published");

        await wrapper.find("#profile-edit").trigger("click");

        // every field becomes a real input, GitHub style
        expect(wrapper.find("h1.profile-identity-name").exists()).toBe(false);
        expect(wrapper.text()).toContain("Research interests");
        expect(wrapper.findAll("input").length).toBeGreaterThan(2);
        expect(wrapper.find("#profile-edit-save").exists()).toBe(true);
        expect(wrapper.find("#profile-edit-cancel").exists()).toBe(true);
    });

    it("discards buffered identity edits on cancel", async () => {
        mockEmptySections();
        let putCount = 0;
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(publicProfile({ published: true }) as never),
            ),
            http.put("/api/users/{user_id}/profile", ({ response }) => {
                putCount += 1;
                return response(200).json(publicProfile({ published: true }) as never);
            }),
        );
        const wrapper = await mountPage(TEST_USERNAME, TEST_USERNAME);

        await wrapper.find("#profile-edit").trigger("click");
        await wrapper.find("#profile-edit-cancel").trigger("click");

        // nothing was sent and the editor closed
        expect(putCount).toBe(0);
        expect(wrapper.find(".click-to-edit-label").exists()).toBe(false);
        expect(wrapper.find("#profile-edit").exists()).toBe(true);
    });

    it("sends nothing when save is pressed without an identity change", async () => {
        mockEmptySections();
        let putCount = 0;
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(publicProfile({ published: true }) as never),
            ),
            http.put("/api/users/{user_id}/profile", ({ response }) => {
                putCount += 1;
                return response(200).json(publicProfile({ published: true }) as never);
            }),
        );
        const wrapper = await mountPage(TEST_USERNAME, TEST_USERNAME);

        await wrapper.find("#profile-edit").trigger("click");
        await wrapper.find("#profile-edit-save").trigger("click");
        await flushPromises();

        expect(putCount).toBe(0);
        expect(wrapper.find("#profile-edit").exists()).toBe(true);
    });

    it("hides editing affordances in the owner's public preview", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(publicProfile({ published: true }) as never),
            ),
        );
        const wrapper = await mountPage(TEST_USERNAME, TEST_USERNAME);

        await wrapper.find("#profile-edit").trigger("click");
        await wrapper.find("#profile-public-view").trigger("click");

        expect(wrapper.text()).toContain("This is how visitors see your page.");
        expect(wrapper.find(".click-to-edit-label").exists()).toBe(false);
        expect(wrapper.text()).toContain("Back to editing");
    });

    it("fills the main column with a placeholder when only side sections have content", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{user_identifier}", ({ response }) =>
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
            http.get("/api/profiles/{user_identifier}", ({ response }) =>
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
            http.get("/api/profiles/{user_identifier}", ({ response }) =>
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
            propsData: { identifier: TEST_USERNAME },
        });
        await flushPromises();
        expect(wrapper.text()).toContain("No public profile");

        const userStore = useUserStore();
        userStore.currentUser = getFakeRegisteredUser({ username: TEST_USERNAME });
        await flushPromises();

        expect(wrapper.text()).toContain("Your page is not published");
        expect(wrapper.find("#profile-edit").exists()).toBe(true);
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
            http.get("/api/profiles/{user_identifier}", ({ response }) =>
                response(200).json(publicProfile({ visible_sections: { about: false } })),
            ),
        );
        const wrapper = await mountPage();

        expect(wrapper.text()).toContain("Alice Doe");
        expect(wrapper.text()).not.toContain("University of Freiburg");
    });

    it("opens the preview modal from a section row", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{user_identifier}", ({ response }) => response(200).json(publicProfile())),
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

        const modal = wrapper.findComponent(ProfileItemPreviewModal);
        expect(modal.props("show")).toBe(false);

        await wrapper.find(".profile-list-preview").trigger("click");

        expect(modal.props("show")).toBe(true);
        expect((modal.props("item") as { name: string }).name).toBe("RNA-seq reference run");
        expect((modal.props("definition") as { key: string }).key).toBe("histories");
    });
    it("canonicalizes an encoded-id URL to the username URL", async () => {
        mockEmptySections();
        server.use(http.get("/api/profiles/{user_identifier}", ({ response }) => response(200).json(publicProfile())));
        const pinia = createPinia();
        setActivePinia(pinia);
        const router = new VueRouter();
        const wrapper = mount(UserProfilePage as object, {
            localVue,
            pinia,
            router,
            propsData: { identifier: TEST_USER_ENCODED_ID },
        });
        await flushPromises();

        expect(wrapper.text()).toContain("Alice Doe");
        expect(router.currentRoute.path).toBe(`/profile/${TEST_USERNAME}`);
    });

    it("renders the readme for visitors and defeats the solo layout", async () => {
        mockEmptySections();
        server.use(
            http.get("/api/profiles/{user_identifier}", ({ response }) =>
                response(200).json(
                    publicProfile({
                        readme_page: { id: "page123", title: "About my lab", content_format: "markdown" },
                    }),
                ),
            ),
        );
        const wrapper = await mountPage(TEST_USERNAME, "someone-else");

        expect(wrapper.text()).toContain("README");
        expect(wrapper.text()).toContain("About my lab");
        expect(wrapper.find(".user-profile-layout-solo").exists()).toBe(false);
        // visitors get no readme management controls
        expect(wrapper.find('[data-description="remove readme"]').exists()).toBe(false);
    });

    it("lets the owner set a readme page", async () => {
        mockEmptySections();
        let putBody: Record<string, unknown> | null = null;
        const readmePage = {
            id: "page123",
            title: "My Readme",
            content_format: "markdown",
            published: true,
            deleted: false,
        };
        server.use(
            // the page reloads the profile after the save; reflect the stored readme
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(
                    publicProfile({ published: true, readme_page: putBody ? readmePage : null }) as never,
                ),
            ),
            http.put("/api/users/{user_id}/profile", async ({ request, response }) => {
                putBody = (await request.json()) as never;
                return response(200).json(publicProfile({ published: true, readme_page: readmePage }) as never);
            }),
        );
        const wrapper = await mountPage(TEST_USERNAME, TEST_USERNAME);

        // the owner sees the add-readme invitation
        expect(wrapper.find('[data-description="add readme"]').exists()).toBe(true);

        wrapper.findComponent(ProfileReadmeCard).vm.$emit("update:readme", "page123");
        await flushPromises();

        expect(putBody).toEqual({ readme_page_id: "page123" });
        expect(wrapper.text()).toContain("My Readme");
    });
});
