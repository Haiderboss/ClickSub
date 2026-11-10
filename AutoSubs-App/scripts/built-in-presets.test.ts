import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { BUILT_IN_PRESETS } from "../src/presets/built-in-presets.ts";
import { BLEND_MODES, stackedConfigOf, stackedRoles } from "../src/lib/stacked-captions.ts";

const stacked = BUILT_IN_PRESETS.map((preset) => ({ preset, config: stackedConfigOf(preset.macroSettings) })).filter(
    (entry): entry is { preset: (typeof BUILT_IN_PRESETS)[number]; config: NonNullable<ReturnType<typeof stackedConfigOf>> } =>
        entry.config !== null,
);

const ANIMATION_TOGGLES = [
    "FadeEnabled", "PopInEnabled", "SlideUpEnabled", "SlideDownEnabled",
    "WhipEnabled", "BlurInEnabled", "GrowEnabled", "BlinkEnabled",
];

// Fonts that pair well in luxury editorial design, all shipped with macOS.
const LUXURY_SANS = new Set(["Futura", "Avenir Next", "Gill Sans", "Optima", "Helvetica Neue", "Copperplate"]);
const LUXURY_SERIF = new Set([
    "Didot", "Bodoni 72", "Baskerville", "Hoefler Text", "Cochin", "Palatino", "Times New Roman", "Big Caslon",
]);
const LUXURY_SCRIPT = new Set(["Snell Roundhand"]);

const en = JSON.parse(readFileSync(new URL("../src/i18n/locales/en/translation.json", import.meta.url), "utf8"));

test("there are fourteen stacked presets with unique ids", () => {
    assert.equal(stacked.length, 14);
    const ids = BUILT_IN_PRESETS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
});

for (const { preset, config } of stacked) {
    test(`${preset.name}: every line style it uses is defined and named`, () => {
        for (const role of stackedRoles(config)) {
            assert.ok(config.roles?.[role], `${role} has no style`);
            assert.ok(en.captions.stacked.role[role], `${role} has no label`);
        }
    });

    test(`${preset.name}: pairs a refined sans or script with a serif`, () => {
        const families = new Set(Object.values(config.roles ?? {}).map((r) => r.Font as string));
        for (const family of families) {
            assert.ok(LUXURY_SANS.has(family) || LUXURY_SERIF.has(family) || LUXURY_SCRIPT.has(family),
                `${family} is not one of the luxury pairing fonts`);
        }
        assert.ok([...families].some((f) => LUXURY_SERIF.has(f)), "needs a serif");
        assert.ok([...families].some((f) => LUXURY_SANS.has(f) || LUXURY_SCRIPT.has(f)), "needs a sans or script partner");
    });

    test(`${preset.name}: mixes motion and keeps blends valid`, () => {
        const roles = Object.values(config.roles ?? {});
        const motions = new Set(
            roles.map((r) => ANIMATION_TOGGLES.filter((key) => r[key] === 1).sort().join("+")),
        );
        assert.ok(motions.size === roles.length, "each line style moves its own way");
        for (const role of roles) {
            assert.ok(ANIMATION_TOGGLES.some((key) => role[key] === 1), "every line animates");
            if (role.CompositeMode !== undefined) {
                assert.ok((BLEND_MODES as readonly unknown[]).includes(role.CompositeMode));
            }
        }
        for (const colour of config.accentColors ?? []) {
            assert.equal(colour.length, 3);
            for (const channel of colour) assert.ok(channel >= 0 && channel <= 1);
        }
        assert.ok(roles.some((r) => r.Accent) === (config.accentColors?.length ?? 0) > 0, "accents and accent roles go together");
    });

    test(`${preset.name}: the shared base turns every animation off`, () => {
        for (const key of ANIMATION_TOGGLES) assert.equal(config.base?.[key], 0, key);
        assert.equal(config.base?.ShadowEnabled, 0, "no glow");
    });
}
