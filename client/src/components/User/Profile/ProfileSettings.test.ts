import { getFakeRegisteredUser } from "@tests/test-data";
import { getLocalVue } from "@tests/vitest/helpers";
import { mount } from "@vue/test-utils";
import flushPromises from "flush-promises";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VueRouter from "vue-router";

import { useServerMock } from "@/api/client/__mocks__";
import { useUserStore } from "@/stores/userStore";

import ProfileSettings from "./ProfileSettings.vue";

const localVue = getLocalVue(true);
localVue.use(VueRouter);
const { server, http } = useServerMock();

const TEST_USER_ID = "test_user_id";
const TEST_USERNAME = "test-user";

interface ProfilePayload {
    published: boolean;
    display_name: string | null;
    description: string | null;
    affiliation: string | null;
    research_interests: string | null;
    orcid: string | null;
    links: { label: string; url: string }[] | null;
    visible_sections: Record<string, boolean> | null;
    username: string | null;
}

function profileResponse(overrides: Partial<ProfilePayload> = {}): ProfilePayload {
    return {
        published: false,
        display_name: null,
        description: null,
        affiliation: null,
        research_interests: null,
        orcid: null,
        avatar_seed: null,
        links: null,
        visible_sections: null,
        username: TEST_USERNAME,
        ...overrides,
    };
}

async function mountComponent() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const userStore = useUserStore();
    userStore.currentUser = getFakeRegisteredUser({ id: TEST_USER_ID, username: TEST_USERNAME });
    const wrapper = mount(ProfileSettings as object, { localVue, pinia, router: new VueRouter() });
    await flushPromises();
    return wrapper;
}

describe("ProfileSettings.vue", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("loads an empty, unpublished profile", async () => {
        server.use(http.get("/api/users/{user_id}/profile", ({ response }) => response(200).json(profileResponse())));
        const wrapper = await mountComponent();

        expect(wrapper.text()).toContain("Enable my public page");
        const publishedInput = wrapper.find("#profile-published").element as HTMLInputElement;
        expect(publishedInput.checked).toBe(false);
        expect(wrapper.text()).toContain(`/people/${TEST_USERNAME}`);
    });

    it("populates fields from an existing profile", async () => {
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(
                    profileResponse({
                        published: true,
                        display_name: "Alice Doe",
                        description: "Galaxy core committer and software engineer",
                        orcid: "0000-0002-1825-0097",
                        visible_sections: { histories: false },
                    }),
                ),
            ),
        );
        const wrapper = await mountComponent();

        expect((wrapper.find("#profile-display-name").element as HTMLInputElement).value).toBe("Alice Doe");
        expect((wrapper.find("#profile-orcid").element as HTMLInputElement).value).toBe("0000-0002-1825-0097");
        expect((wrapper.find("#profile-published").element as HTMLInputElement).checked).toBe(true);
        expect((wrapper.find("#profile-section-histories").element as HTMLInputElement).checked).toBe(false);
        // unset sections default to visible
        expect((wrapper.find("#profile-section-workflows").element as HTMLInputElement).checked).toBe(true);
    });

    it("saves edited fields via PUT", async () => {
        let putBody: Record<string, unknown> | undefined;
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) => response(200).json(profileResponse())),
            http.put("/api/users/{user_id}/profile", async ({ request, response }) => {
                putBody = (await request.json()) as Record<string, unknown>;
                return response(200).json(profileResponse({ display_name: "New Name", published: true }));
            }),
        );
        const wrapper = await mountComponent();

        await wrapper.find("#profile-display-name").setValue("New Name");
        await wrapper.find("#profile-settings-save").trigger("click");
        await flushPromises();

        expect(putBody).toBeDefined();
        expect(putBody?.display_name).toBe("New Name");
        // empty inputs are sent as null, not empty strings
        expect(putBody?.orcid).toBeNull();
        expect(putBody?.avatar_seed).toBeNull();
    });

    it("randomize stores a fresh seed and sends it on save", async () => {
        let putBody: Record<string, unknown> | undefined;
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) => response(200).json(profileResponse())),
            http.put("/api/users/{user_id}/profile", async ({ request, response }) => {
                putBody = (await request.json()) as Record<string, unknown>;
                return response(200).json(profileResponse());
            }),
        );
        const wrapper = await mountComponent();

        await wrapper.find("#profile-avatar-randomize").trigger("click");
        await wrapper.find("#profile-settings-save").trigger("click");
        await flushPromises();

        expect(typeof putBody?.avatar_seed).toBe("string");
        expect((putBody?.avatar_seed as string).length).toBeGreaterThan(0);
    });

    it("shows an error message when loading fails", async () => {
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response("4XX").json({ err_msg: "profile pages disabled", err_code: 403001 }, { status: 403 }),
            ),
        );
        const wrapper = await mountComponent();

        expect(wrapper.text()).toContain("profile pages disabled");
    });
});
