import assert from "node:assert/strict";
import { test } from "node:test";
import {
    layoutValuesOf,
    roleClipValues,
    roleSettingsForEditing,
    stackedConfigOf,
    stackedRoles,
    withLayout,
    withRoleClipValues,
    withRoleSettings,
} from "../src/lib/stacked-captions.ts";

const preset = () => ({
    Font: "ignored by stacked placement",
    Stacked: {
        pattern: ["sans", "serif"],
        base: { FadeEnabled: 1, TextSize: 0.08 },
        roles: {
            sans: { Font: "Inter", OffsetX: 0.02 },
            extra: { Font: "Mono" },
        },
    },
});

test("ordinary presets are not stacked", () => {
    assert.equal(stackedConfigOf({ Font: "Arial" }), null);
    assert.equal(stackedConfigOf(undefined), null);
    assert.equal(stackedConfigOf({ Stacked: [1, 2] }), null);
    assert.ok(stackedConfigOf(preset()));
});

test("roles follow the pattern, then emphasis, then any others", () => {
    assert.deepEqual(stackedRoles(stackedConfigOf(preset())!), ["sans", "serif", "emphasis", "extra"]);
    assert.deepEqual(stackedRoles({}), ["sans", "serif", "italic", "emphasis"]);
    assert.deepEqual(stackedRoles({ emphasis: { enabled: false } }), ["sans", "serif", "italic"]);
});

test("a role opens with its own settings over the base, without position", () => {
    const settings = roleSettingsForEditing(stackedConfigOf(preset())!, "sans");
    assert.deepEqual(settings, { FadeEnabled: 1, TextSize: 0.08, Font: "Inter" });
    assert.deepEqual(roleSettingsForEditing({ base: { A: 1 } }, "missing"), { A: 1 });
});

test("captured settings replace one role and keep its offset", () => {
    const before = preset();
    const after = withRoleSettings(before, "sans", { Font: "Futura", TextPosition: [0.5, 0.1, 0] });
    const config = stackedConfigOf(after)!;
    assert.deepEqual(config.roles!.sans, { Font: "Futura", OffsetX: 0.02 });
    assert.deepEqual(config.roles!.extra, { Font: "Mono" });
    assert.deepEqual(config.base, { FadeEnabled: 1, TextSize: 0.08 });
    assert.equal(after.Font, before.Font);
    assert.deepEqual(before.Stacked.roles.sans, { Font: "Inter", OffsetX: 0.02 }, "input is not mutated");
});

test("a new role can be added", () => {
    const after = withRoleSettings(preset(), "emphasis", { Font: "Black" });
    assert.deepEqual(stackedConfigOf(after)!.roles!.emphasis, { Font: "Black" });
});

test("layout values fall back to the defaults", () => {
    assert.deepEqual(layoutValuesOf({}), {
        maxLines: 3,
        maxWordsPerLine: 3,
        maxCharsPerLine: 12,
        overlap: 0.25,
        anchorY: 0.7,
        emphasisEnabled: true,
    });
    assert.equal(layoutValuesOf({ maxLines: 2, emphasis: { enabled: false } }).emphasisEnabled, false);
});

test("layout edits are clamped and keep the rest of the config", () => {
    const after = withLayout(preset(), {
        maxLines: 2.6,
        maxWordsPerLine: 0,
        maxCharsPerLine: Number.NaN,
        overlap: 2,
        anchorY: -1,
        emphasisEnabled: false,
    });
    const config = stackedConfigOf(after)!;
    assert.equal(config.maxLines, 3);
    assert.equal(config.maxWordsPerLine, 1);
    assert.equal(config.maxCharsPerLine, 4);
    assert.equal(config.overlap, 0.9);
    assert.equal(config.anchorY, 0);
    assert.equal(config.emphasis!.enabled, false);
    assert.deepEqual(config.pattern, ["sans", "serif"]);
    assert.ok(config.roles!.sans);
});

test("layout-only keys stay out of Fusion and survive an edit there", () => {
    const settings = {
        Stacked: {
            roles: {
                hero: { Font: "Avenir Next", OffsetX: 0.1, CompositeMode: "Screen", Opacity: 80, Uppercase: true, Accent: true },
            },
        },
    };
    const editing = roleSettingsForEditing(stackedConfigOf(settings)!, "hero");
    assert.deepEqual(editing, { Font: "Avenir Next" });

    const saved = stackedConfigOf(withRoleSettings(settings, "hero", { Font: "Futura", TextPosition: [0, 0, 0] }))!;
    assert.deepEqual(saved.roles!.hero, {
        Font: "Futura",
        OffsetX: 0.1,
        CompositeMode: "Screen",
        Opacity: 80,
        Uppercase: true,
        Accent: true,
    });
});

test("clip blend values fall back to the base, then Normal at full opacity", () => {
    const config = {
        base: { Opacity: 90 },
        roles: { a: { CompositeMode: "Overlay" }, b: { CompositeMode: 5, Opacity: 300 }, c: { CompositeMode: "Glitter" } },
    };
    assert.deepEqual(roleClipValues(config, "a"), { blend: "Overlay", opacity: 90 });
    assert.deepEqual(roleClipValues(config, "b"), { blend: "Screen", opacity: 100 });
    assert.deepEqual(roleClipValues(config, "c"), { blend: "Normal", opacity: 90 });
    assert.deepEqual(roleClipValues({}, "missing"), { blend: "Normal", opacity: 100 });
});

test("writing clip blend values keeps the rest of the style", () => {
    const next = withRoleClipValues(preset(), {
        sans: { blend: "Multiply", opacity: 55.4 },
        fresh: { blend: "Screen", opacity: -10 },
    });
    const config = stackedConfigOf(next)!;
    assert.deepEqual(config.roles!.sans, { Font: "Inter", OffsetX: 0.02, CompositeMode: "Multiply", Opacity: 55 });
    assert.deepEqual(config.roles!.fresh, { CompositeMode: "Screen", Opacity: 0 });
    assert.deepEqual(config.roles!.extra, { Font: "Mono" });
    assert.equal(next.Font, "ignored by stacked placement");
});
