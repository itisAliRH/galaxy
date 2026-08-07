import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
    faGithub,
    faGitlab,
    faLinkedin,
    faMastodon,
    faOrcid,
    faTwitter,
    faYoutube,
} from "@fortawesome/free-brands-svg-icons";
import { faGlobe, faGraduationCap } from "@fortawesome/free-solid-svg-icons";

import type { components } from "@/api/schema";
import { galaxyLogo, type IconLike } from "@/components/icons/galaxyIcons";

export type UserProfileLink = components["schemas"]["UserProfileLink"];
export type ProfileLinkType = components["schemas"]["ProfileLinkType"];
export type WellKnownLinkType = Exclude<ProfileLinkType, "custom">;

export interface WellKnownLink {
    type: WellKnownLinkType;
    label: string;
    icon: IconLike;
    placeholder: string;
}

/**
 * The fixed link slots every profile offers, in display order. Links render
 * with the service icon only — no user-provided labels anywhere.
 */
export const WELL_KNOWN_LINKS: WellKnownLink[] = [
    {
        type: "gtn",
        label: "GTN profile",
        // TODO: swap for a real GTN brand icon via the custom-icon pipeline
        // (client/icons/galaxy/); the graduation cap matches the GTN motif.
        icon: faGraduationCap,
        placeholder: "https://training.galaxyproject.org/…",
    },
    {
        type: "hub",
        label: "Galaxy Hub profile",
        icon: galaxyLogo,
        placeholder: "https://galaxyproject.org/…",
    },
    {
        type: "github",
        label: "GitHub",
        icon: faGithub,
        placeholder: "https://github.com/…",
    },
];

/** Custom links to known services get their brand icon; everything else falls back to a globe. */
const BRAND_ICONS: [RegExp, IconDefinition][] = [
    [/(^|\.)github\.com$/, faGithub],
    [/(^|\.)gitlab\.com$/, faGitlab],
    [/(^|\.)linkedin\.com$/, faLinkedin],
    [/(^|\.)orcid\.org$/, faOrcid],
    [/(^|\.)(twitter|x)\.com$/, faTwitter],
    [/(^|\.)(youtube\.com|youtu\.be)$/, faYoutube],
    [/(^|\.)mastodon\./, faMastodon],
];

export function linkHostname(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

export function wellKnownLink(type: ProfileLinkType | undefined): WellKnownLink | undefined {
    return WELL_KNOWN_LINKS.find((slot) => slot.type === type);
}

export function profileLinkIcon(link: UserProfileLink): IconLike {
    const slot = wellKnownLink(link.type);
    if (slot) {
        return slot.icon;
    }
    const host = linkHostname(link.url);
    for (const [pattern, icon] of BRAND_ICONS) {
        if (pattern.test(host)) {
            return icon;
        }
    }
    return faGlobe;
}

/** Fixed service name for the well-known slots, the hostname for customs. */
export function profileLinkText(link: UserProfileLink): string {
    return wellKnownLink(link.type)?.label ?? linkHostname(link.url);
}

/** Well-known slots must be https (the server enforces it); customs may be http. */
export function isUsableLinkUrl(url: string, type: ProfileLinkType = "custom"): boolean {
    const pattern = type === "custom" ? /^https?:\/\/.+/ : /^https:\/\/.+/;
    return pattern.test(url.trim());
}
