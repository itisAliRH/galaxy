const { xml2js } = require("xml-js");
const { promises: fs } = require("fs");
const path = require("path");

async function buildIcons(outputPath) {
    const iconPacksJson = await fs.readFile(path.resolve(__dirname, "./icon-packs.json"));
    const iconPacks = JSON.parse(iconPacksJson);

    const allIcons = [];

    for (const packName in iconPacks) {
        console.info(`Building icon pack "${packName}"`);

        const packConfig = iconPacks[packName];

        const prefix = packConfig["prefix"];
        const folder = packConfig["folder"];

        if (!prefix) {
            throw new Error(`"prefix" is not defined for icon pack "${packName}"`);
        }

        if (!folder) {
            throw new Error(`"folder" is not defined for icon pack "${packName}"`);
        }

        const folderPath = path.resolve(__dirname, folder);
        const files = await fs.readdir(folderPath);

        for (const fileName of files) {
            const icon = await loadIcon(folderPath, fileName, prefix);
            allIcons.push(icon);
        }
    }

    console.info(`Saving generated Icon Pack to: "${outputPath}"`);

    const allIconsJson = JSON.stringify(allIcons);
    await fs.writeFile(path.resolve(outputPath), allIconsJson);

    const md = makeMarkdown(allIcons);
    await fs.writeFile(path.resolve(__dirname, "all-icons.md"), md);

    console.info("Icons built successfully");
}

async function loadIcon(folderPath, fileName, prefix) {
    const segments = fileName.split(".");
    const type = segments[1];
    const name = segments[0];

    if (segments.length !== 3 || !["regular", "solid", "duotone"].includes(type) || !segments[2] === "svg") {
        throw new Error(
            `Failed to load icon "${fileName}". ` +
                'Icon files must be in the following format: "`name`.`type`.svg", where type is `regular`, `solid` or `duotone`'
        );
    }

    const fullPrefix = prefix + type[0];

    console.info(` - loading icon "${fullPrefix} ${name}" from file "${fileName}"`);

    const filePath = path.join(folderPath, fileName);

    const fileXML = await fs.readFile(filePath);
    const file = xml2js(fileXML);
    const svg = file.elements.find((e) => e.name === "svg");

    // icon without path / paths
    const icon = [parseInt(svg.attributes.width), parseInt(svg.attributes.height), [], ""];
    const paths = findAllPaths(svg);

    // duotone want array of paths, the others just a single path
    if (type === "duotone") {
        icon.push(paths);
    } else {
        icon.push(paths[0]);
    }

    return {
        iconName: name,
        prefix: fullPrefix,
        icon,
    };
}

function findAllPaths(element) {
    const childPaths = element.elements?.reduce((accumulator, e) => [...accumulator, ...findAllPaths(e)], []) ?? [];

    if (element.name === "path") {
        return [...childPaths, element.attributes.d];
    } else {
        return childPaths;
    }
}

function makeMarkdown(iconDefinitions) {
    let content = "# Icons\n\n";
    content += "All custom icons available\n\n";
    content += "This file is auto-generated by `build_icons.js`. Manual changes will be lost!\n\n";
    content += "---\n\n";

    iconDefinitions.forEach((icon) => {
        content += `-   \`<FontAwesomeIcon :icon="['${icon.prefix}', '${icon.iconName}']" />\`\n`;
    });

    content += "\n---\n";

    return content;
}

module.exports = buildIcons;