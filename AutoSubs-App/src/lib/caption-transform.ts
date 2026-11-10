/**
 * One size and position for every caption at once. Resolve applies it as the
 * caption clips' own zoom and position (see `transform_properties` in
 * `caption_style.lua`), so it works the same for every preset and template
 * and moves all lines of a stacked caption together.
 */
export interface CaptionTransform {
    /** Percent of the designed size. */
    scale: number;
    /** Percent of the frame width, positive to the right. */
    x: number;
    /** Percent of the frame height, positive upwards. */
    y: number;
}

export const DEFAULT_CAPTION_TRANSFORM: CaptionTransform = { scale: 100, x: 0, y: 0 };

export const TRANSFORM_RANGES = {
    scale: { min: 25, max: 300 },
    x: { min: -100, max: 100 },
    y: { min: -100, max: 100 },
} as const;

function clampTo(value: number, key: keyof CaptionTransform): number {
    const { min, max } = TRANSFORM_RANGES[key];
    if (!Number.isFinite(value)) return DEFAULT_CAPTION_TRANSFORM[key];
    return Math.min(max, Math.max(min, value));
}

export function clampTransform(transform: CaptionTransform): CaptionTransform {
    return {
        scale: clampTo(transform.scale, "scale"),
        x: clampTo(transform.x, "x"),
        y: clampTo(transform.y, "y"),
    };
}

export function isDefaultTransform(transform: CaptionTransform): boolean {
    const t = clampTransform(transform);
    return (
        t.scale === DEFAULT_CAPTION_TRANSFORM.scale &&
        t.x === DEFAULT_CAPTION_TRANSFORM.x &&
        t.y === DEFAULT_CAPTION_TRANSFORM.y
    );
}

/** What to send with new captions: nothing when they keep their designed size and place. */
export function transformForPlacement(transform: CaptionTransform): CaptionTransform | undefined {
    return isDefaultTransform(transform) ? undefined : clampTransform(transform);
}
