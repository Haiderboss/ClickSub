import assert from "node:assert/strict";
import { test } from "node:test";
import {
    DEFAULT_CAPTION_TRANSFORM,
    TRANSFORM_RANGES,
    clampTransform,
    isDefaultTransform,
    transformForPlacement,
} from "../src/lib/caption-transform.ts";

test("the designed size and place is the default", () => {
    assert.ok(isDefaultTransform(DEFAULT_CAPTION_TRANSFORM));
    assert.ok(!isDefaultTransform({ scale: 120, x: 0, y: 0 }));
    assert.ok(!isDefaultTransform({ scale: 100, x: 0, y: -10 }));
});

test("new captions only carry a transform when it changes something", () => {
    assert.equal(transformForPlacement(DEFAULT_CAPTION_TRANSFORM), undefined);
    assert.deepEqual(transformForPlacement({ scale: 80, x: 5, y: 12 }), { scale: 80, x: 5, y: 12 });
});

test("position reaches the frame edge both ways", () => {
    assert.deepEqual(clampTransform({ scale: 100, x: -100, y: 100 }), { scale: 100, x: -100, y: 100 });
});

test("values are kept in range", () => {
    assert.deepEqual(clampTransform({ scale: 1000, x: -190, y: 190 }), {
        scale: TRANSFORM_RANGES.scale.max,
        x: TRANSFORM_RANGES.x.min,
        y: TRANSFORM_RANGES.y.max,
    });
    assert.deepEqual(clampTransform({ scale: Number.NaN, x: Number.NaN, y: 3 }), { scale: 100, x: 0, y: 3 });
});
