import { getFakeRegisteredUser } from "@tests/test-data";
import { getLocalVue } from "@tests/vitest/helpers";
import { mount } from "@vue/test-utils";
import flushPromises from "flush-promises";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VueRouter from "vue-router";

import { useServerMock } from "@/api/client/__mocks__";
import { Toast } from "@/composables/toast";
import { useUserStore } from "@/stores/userStore";

import ProfileSettings from "./ProfileSettings.vue";

vi.mock("@/composables/toast", () => ({
    Toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

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
    links: { type: string; url: string }[] | null;
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

function publishedInput(wrapper: Awaited<ReturnType<typeof mountComponent>>) {
    return wrapper.find("#profile-published").element as HTMLInputElement;
}

describe("ProfileSettings.vue", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows the toggle reflecting the published state from GET", async () => {
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) =>
                response(200).json(profileResponse({ published: true })),
            ),
        );
        const wrapper = await mountComponent();

        expect(wrapper.text()).toContain("Enable my public page");
        expect(publishedInput(wrapper).checked).toBe(true);
    });

    it("PUTs exactly { published: true } when the toggle is switched on", async () => {
        let putBody: Record<string, unknown> | undefined;
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) => response(200).json(profileResponse())),
            http.put("/api/users/{user_id}/profile", async ({ request, response }) => {
                putBody = (await request.json()) as Record<string, unknown>;
                return response(200).json(profileResponse({ published: true }));
            }),
        );
        const wrapper = await mountComponent();

        expect(publishedInput(wrapper).checked).toBe(false);
        await wrapper.find("#profile-published").setChecked(true);
        await flushPromises();

        expect(putBody).toEqual({ published: true });
        expect(Object.keys(putBody ?? {})).toEqual(["published"]);
        expect(publishedInput(wrapper).checked).toBe(true);
        expect(Toast.success).toHaveBeenCalledWith("Public profile enabled");
    });

    it("renders the full page URL and links to the profile route", async () => {
        server.use(http.get("/api/users/{user_id}/profile", ({ response }) => response(200).json(profileResponse())));
        const wrapper = await mountComponent();

        const link = wrapper.find("a.profile-url");
        expect(link.exists()).toBe(true);
        expect(link.text()).toBe(`${window.location.origin}/profile/${TEST_USERNAME}`);
        expect(link.attributes("href")).toContain(`/profile/${TEST_USERNAME}`);
    });

    it("explains how to change the username and links to Manage Information", async () => {
        server.use(http.get("/api/users/{user_id}/profile", ({ response }) => response(200).json(profileResponse())));
        const wrapper = await mountComponent();

        expect(wrapper.text()).toContain("public name");
        const links = wrapper.findAll("a").wrappers.map((link) => link.attributes("href"));
        expect(links.some((href) => href?.includes("/user/information"))).toBe(true);
    });

    it("does not render the removed profile inputs or a save button", async () => {
        server.use(http.get("/api/users/{user_id}/profile", ({ response }) => response(200).json(profileResponse())));
        const wrapper = await mountComponent();

        expect(wrapper.find("#profile-orcid").exists()).toBe(false);
        expect(wrapper.find("#profile-display-name").exists()).toBe(false);
        expect(wrapper.find("#profile-settings-save").exists()).toBe(false);
    });

    it("reverts the toggle when the PUT fails", async () => {
        server.use(
            http.get("/api/users/{user_id}/profile", ({ response }) => response(200).json(profileResponse())),
            http.put("/api/users/{user_id}/profile", ({ response }) =>
                response("4XX").json({ err_msg: "publish failed", err_code: 400001 }, { status: 400 }),
            ),
        );
        const wrapper = await mountComponent();

        expect(publishedInput(wrapper).checked).toBe(false);
        await wrapper.find("#profile-published").setChecked(true);
        await flushPromises();

        expect(publishedInput(wrapper).checked).toBe(false);
        expect(Toast.error).toHaveBeenCalledWith("publish failed");
        expect(Toast.success).not.toHaveBeenCalled();
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
