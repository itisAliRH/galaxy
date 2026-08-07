import { getLocalVue } from "@tests/vitest/helpers";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import type { UserProfileLink } from "./profileLinks";

import ProfileLinksEditor from "./ProfileLinksEditor.vue";

const localVue = getLocalVue(true);

function mountEditor(props: Record<string, unknown> = {}) {
    return mount(ProfileLinksEditor as object, {
        localVue,
        propsData: props,
    });
}

function lastEmitted(wrapper: ReturnType<typeof mountEditor>): UserProfileLink[] {
    const events = wrapper.emitted("update:links")!;
    return events[events.length - 1]![0];
}

describe("ProfileLinksEditor.vue", () => {
    describe("display mode", () => {
        it("renders well-known links with fixed service names and customs with hostnames", () => {
            const links: UserProfileLink[] = [
                { type: "gtn", url: "https://training.galaxyproject.org/hall-of-fame/alice/" },
                { type: "hub", url: "https://galaxyproject.org/people/alice/" },
                { type: "github", url: "https://github.com/alice" },
                { type: "custom", url: "https://www.example.org/lab" },
            ];
            const wrapper = mountEditor({ links });
            const anchors = wrapper.findAll("a.profile-links-anchor");
            expect(anchors.length).toBe(4);
            expect(anchors.at(0).text()).toContain("GTN profile");
            expect(anchors.at(1).text()).toContain("Galaxy Hub profile");
            expect(anchors.at(2).text()).toContain("GitHub");
            expect(anchors.at(3).text()).toContain("example.org");
            // no user-provided labels anywhere
            expect(wrapper.text()).not.toContain("lab");
        });

        it("renders only the provided well-known slots", () => {
            const wrapper = mountEditor({ links: [{ type: "github", url: "https://github.com/alice" }] });
            const anchors = wrapper.findAll("a.profile-links-anchor");
            expect(anchors.length).toBe(1);
            expect(anchors.at(0).attributes("href")).toBe("https://github.com/alice");
        });

        it("renders nothing without links", () => {
            const wrapper = mountEditor({ links: [] });
            expect(wrapper.find(".profile-links").exists()).toBe(false);
        });
    });

    describe("edit mode", () => {
        it("always shows the three fixed slot inputs and no label inputs", () => {
            const wrapper = mountEditor({ editable: true, links: [] });
            for (const type of ["gtn", "hub", "github"]) {
                expect(wrapper.find(`[data-description="profile link ${type}"]`).exists()).toBe(true);
            }
            expect(wrapper.find('[placeholder="Label (optional)"]').exists()).toBe(false);
        });

        it("emits typed links in canonical order (slots first, customs after)", async () => {
            const wrapper = mountEditor({ editable: true, links: [] });
            await wrapper.find('[data-description="profile link github"]').setValue("https://github.com/alice");
            await wrapper.find("#profile-links-add").trigger("click");
            await wrapper.find('[data-description="profile link custom"]').setValue("https://example.org");
            await wrapper
                .find('[data-description="profile link gtn"]')
                .setValue("https://training.galaxyproject.org/x");
            expect(lastEmitted(wrapper)).toEqual([
                { type: "gtn", url: "https://training.galaxyproject.org/x" },
                { type: "github", url: "https://github.com/alice" },
                { type: "custom", url: "https://example.org" },
            ]);
        });

        it("drops a cleared slot from the emitted links", async () => {
            const wrapper = mountEditor({
                editable: true,
                links: [{ type: "github", url: "https://github.com/alice" }] as UserProfileLink[],
            });
            await wrapper.find('[data-description="profile link github"]').setValue("");
            expect(lastEmitted(wrapper)).toEqual([]);
        });

        it("does not emit half-typed or non-https well-known urls", async () => {
            const wrapper = mountEditor({ editable: true, links: [] });
            await wrapper.find('[data-description="profile link github"]').setValue("http://github.com/alice");
            expect(lastEmitted(wrapper)).toEqual([]);
        });

        it("removes a custom row via its trash button", async () => {
            const wrapper = mountEditor({
                editable: true,
                links: [{ type: "custom", url: "https://example.org" }] as UserProfileLink[],
            });
            await wrapper.find('[aria-label="Remove link"]').trigger("click");
            expect(lastEmitted(wrapper)).toEqual([]);
        });

        it("caps the total number of links at maxLinks", async () => {
            const wrapper = mountEditor({
                editable: true,
                maxLinks: 2,
                links: [
                    { type: "github", url: "https://github.com/alice" },
                    { type: "custom", url: "https://example.org" },
                ] as UserProfileLink[],
            });
            expect(wrapper.find("#profile-links-add").exists()).toBe(false);
        });
    });
});
