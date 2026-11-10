/**
 * Stacked captions: a phrase builds up as stacked lines, each line in its own
 * style and on its own video track. The Lua side
 * (`resources/modules/stacked_layout.lua`) does the splitting and placement;
 * this file only reads and edits the configuration a preset carries.
 *
 * The configuration lives in the preset's `macroSettings` under one reserved
 * key. The macro only applies keys it declares, so the key is inert to it and
 * stacked presets import, export and duplicate like any other.
 */

export const STACKED_KEY = "Stacked";

export interface StackedEmphasis {
    enabled?: boolean;
    role?: string;
    maxWords?: number;
    maxChars?: number;
    skipFirstLine?: boolean;
}

export interface StackedConfig {
    maxLines?: number;
    maxWordsPerLine?: number;
    maxCharsPerLine?: number;
    linePause?: number;
    screenPause?: number;
    breakOnPunctuation?: boolean;
    holdGap?: number;
    pattern?: string[];
    emphasis?: StackedEmphasis;
    anchorX?: number;
    anchorY?: number;
    lineSpacing?: number;
    overlap?: number;
    /** Fill colours for line styles marked `Accent`, one per phrase in turn, as [r, g, b] in 0-1. */
    accentColors?: number[][];
    /** Macro settings shared by every line style. */
    base?: Record<string, unknown>;
    /** Macro settings per line style, plus the layout-only keys in `LAYOUT_ONLY_KEYS`. */
    roles?: Record<string, Record<string, unknown>>;
}

/** The layout fields the app lets you edit, with the Lua defaults they fall back to. */
export const STACKED_LAYOUT_DEFAULTS = {
    maxLines: 3,
    maxWordsPerLine: 3,
    maxCharsPerLine: 12,
    overlap: 0.25,
    anchorY: 0.7,
    emphasisEnabled: true,
} as const;

const DEFAULT_PATTERN = ["sans", "serif", "italic"];
const DEFAULT_EMPHASIS_ROLE = "emphasis";

/** Keys a line style must not keep: the layout positions every line itself. */
const POSITION_KEYS = ["TextPosition"];

/**
 * Line style keys the layout reads rather than the macro: sideways offset,
 * the clip's blend mode and opacity, capitals, and the per-phrase accent
 * colour. Fusion never sees them, so editing a style there keeps them.
 */
const LAYOUT_ONLY_KEYS = ["OffsetX", "CompositeMode", "Opacity", "Uppercase", "Accent"];

/** Resolve's clip blend modes, by the names `stacked_layout.lua` maps to Resolve's numbers. */
export const BLEND_MODES = [
    "Normal",
    "Add",
    "Subtract",
    "Difference",
    "Multiply",
    "Screen",
    "Overlay",
    "Hardlight",
    "Softlight",
    "Darken",
    "Lighten",
    "ColorDodge",
    "ColorBurn",
    "Exclusion",
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

/** The stacked configuration a preset carries, or null for an ordinary preset. */
export function stackedConfigOf(macroSettings: Record<string, unknown> | undefined): StackedConfig | null {
    const raw = macroSettings?.[STACKED_KEY];
    return isRecord(raw) ? (raw as StackedConfig) : null;
}

/** Every line style the preset uses, in the order they appear on screen. */
export function stackedRoles(config: StackedConfig): string[] {
    const pattern = config.pattern?.length ? config.pattern : DEFAULT_PATTERN;
    const roles = [...pattern];
    if (config.emphasis?.enabled !== false) {
        roles.push(config.emphasis?.role ?? DEFAULT_EMPHASIS_ROLE);
    }
    roles.push(...Object.keys(config.roles ?? {}));
    return [...new Set(roles)];
}

/** The settings to open one line style with in Fusion: its own over the shared base. */
export function roleSettingsForEditing(config: StackedConfig, role: string): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...(config.base ?? {}), ...(config.roles?.[role] ?? {}) };
    for (const key of [...LAYOUT_ONLY_KEYS, ...POSITION_KEYS]) delete merged[key];
    return merged;
}

/**
 * Store settings captured from Fusion as one line style. The layout-only keys
 * survive, and the captured position is dropped because each line's position
 * comes from the layout.
 */
export function withRoleSettings(
    macroSettings: Record<string, unknown>,
    role: string,
    captured: Record<string, unknown>,
): Record<string, unknown> {
    const config = stackedConfigOf(macroSettings) ?? {};
    const previous = config.roles?.[role] ?? {};
    const next: Record<string, unknown> = { ...captured };
    for (const key of POSITION_KEYS) delete next[key];
    for (const key of LAYOUT_ONLY_KEYS) {
        if (previous[key] !== undefined) next[key] = previous[key];
    }
    return {
        ...macroSettings,
        [STACKED_KEY]: { ...config, roles: { ...(config.roles ?? {}), [role]: next } },
    };
}

export interface StackedLayoutValues {
    maxLines: number;
    maxWordsPerLine: number;
    maxCharsPerLine: number;
    overlap: number;
    anchorY: number;
    emphasisEnabled: boolean;
}

/** The editable layout values, filled in from the defaults. */
export function layoutValuesOf(config: StackedConfig): StackedLayoutValues {
    const d = STACKED_LAYOUT_DEFAULTS;
    return {
        maxLines: config.maxLines ?? d.maxLines,
        maxWordsPerLine: config.maxWordsPerLine ?? d.maxWordsPerLine,
        maxCharsPerLine: config.maxCharsPerLine ?? d.maxCharsPerLine,
        overlap: config.overlap ?? d.overlap,
        anchorY: config.anchorY ?? d.anchorY,
        emphasisEnabled: config.emphasis?.enabled ?? d.emphasisEnabled,
    };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Write edited layout values back, clamped to ranges the layout can use. */
export function withLayout(
    macroSettings: Record<string, unknown>,
    values: StackedLayoutValues,
): Record<string, unknown> {
    const config = stackedConfigOf(macroSettings) ?? {};
    const whole = (value: number, min: number, max: number) =>
        clamp(Math.round(Number.isFinite(value) ? value : min), min, max);
    return {
        ...macroSettings,
        [STACKED_KEY]: {
            ...config,
            maxLines: whole(values.maxLines, 1, 6),
            maxWordsPerLine: whole(values.maxWordsPerLine, 1, 10),
            maxCharsPerLine: whole(values.maxCharsPerLine, 4, 60),
            overlap: clamp(Number.isFinite(values.overlap) ? values.overlap : 0, 0, 0.9),
            anchorY: clamp(Number.isFinite(values.anchorY) ? values.anchorY : 0.5, 0, 1),
            emphasis: { ...(config.emphasis ?? {}), enabled: values.emphasisEnabled },
        },
    };
}

export interface RoleClipValues {
    blend: BlendMode;
    /** Clip opacity, 0-100. */
    opacity: number;
}

function blendOf(value: unknown): BlendMode | undefined {
    if (typeof value === "number") return BLEND_MODES[value];
    return BLEND_MODES.find((mode) => mode === value);
}

/** How a line style's clip mixes with the video, falling back to the shared base, then Normal at 100%. */
export function roleClipValues(config: StackedConfig, role: string): RoleClipValues {
    const own = config.roles?.[role] ?? {};
    const base = config.base ?? {};
    const opacity = Number(own.Opacity ?? base.Opacity ?? 100);
    return {
        blend: blendOf(own.CompositeMode ?? base.CompositeMode) ?? "Normal",
        opacity: Number.isFinite(opacity) ? clamp(opacity, 0, 100) : 100,
    };
}

/** Write each line style's blend mode and opacity back. */
export function withRoleClipValues(
    macroSettings: Record<string, unknown>,
    values: Record<string, RoleClipValues>,
): Record<string, unknown> {
    const config = stackedConfigOf(macroSettings) ?? {};
    const roles = { ...(config.roles ?? {}) };
    for (const [role, { blend, opacity }] of Object.entries(values)) {
        roles[role] = {
            ...(roles[role] ?? {}),
            CompositeMode: blendOf(blend) ?? "Normal",
            Opacity: Math.round(clamp(Number.isFinite(opacity) ? opacity : 100, 0, 100)),
        };
    }
    return { ...macroSettings, [STACKED_KEY]: { ...config, roles } };
}
