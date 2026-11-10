import type { CaptionPreset } from '@/types';

const EPOCH = '1970-01-01T00:00:00.000Z';

// Every animation toggle off, so each stacked preset below turns on exactly
// the ones it uses and restyling never leaves an old animation running.
const NO_ANIMATION = {
    FadeEnabled: 0,
    PopInEnabled: 0,
    SlideUpEnabled: 0,
    SlideDownEnabled: 0,
    WhipEnabled: 0,
    BlurInEnabled: 0,
    GrowEnabled: 0,
    BlinkEnabled: 0,
};

// Plain filled text: no highlight, outline or shadow.
const PLAIN_TEXT = {
    HighlightEnabled: 0,
    FillEnabled: 1,
    OutlineEnabled: 0,
    ShadowEnabled: 0,
};

const WHITE = { FillColorRed: 1, FillColorGreen: 1, FillColorBlue: 1 };

type Motion = 'Fade' | 'PopIn' | 'SlideUp' | 'SlideDown' | 'Whip' | 'BlurIn' | 'Grow' | 'Blink';

const ANIMATION_MODES = { in: 0, out: 1, both: 2 } as const;

/**
 * How one line style moves: which animations it runs, word by word or as a
 * whole line, on the way in, out or both, and how long each takes.
 */
function motion(
    moves: Motion[],
    level: 'word' | 'line',
    mode: keyof typeof ANIMATION_MODES,
    seconds: number,
): Record<string, number> {
    const toggles = Object.fromEntries(moves.map((move) => [`${move}Enabled`, 1]));
    return {
        ...toggles,
        AnimationLevel: level === 'word' ? 1 : 0,
        AnimationMode: ANIMATION_MODES[mode],
        AnimationLength: seconds,
    };
}

/** '#RRGGBB' as 0-1 channels. */
function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(
        (c) => Math.round(c * 1000) / 1000,
    ) as [number, number, number];
}

/** A fill colour for a line style. */
function fill(hex: string): Record<string, number> {
    const [r, g, b] = rgb(hex);
    return { FillColorRed: r, FillColorGreen: g, FillColorBlue: b };
}

// Every animation a line style does not turn on stays off, so restyling never
// leaves an old one running; plain white fill, no highlight, outline or shadow.
const STACKED_BASE = {
    ...NO_ANIMATION,
    ...PLAIN_TEXT,
    ...WHITE,
};

interface StackedLayout {
    maxLines: number;
    maxWordsPerLine: number;
    maxCharsPerLine: number;
    pattern: string[];
    emphasis: Record<string, unknown>;
    anchorY: number;
    overlap: number;
    accentColors?: string[];
    roles: Record<string, Record<string, unknown>>;
}

function stackedPreset(id: string, name: string, description: string, layout: StackedLayout): CaptionPreset {
    const { accentColors, ...rest } = layout;
    return {
        id: `builtin:${id}`,
        name,
        description,
        builtIn: true,
        version: 1,
        createdAt: EPOCH,
        updatedAt: EPOCH,
        macroSettings: {
            Stacked: {
                ...rest,
                ...(accentColors ? { accentColors: accentColors.map(rgb) } : {}),
                base: STACKED_BASE,
            },
        },
    };
}

const emphasis = (role: string, maxChars = 6) => ({
    enabled: true,
    role,
    maxWords: 1,
    maxChars,
    skipFirstLine: true,
});
const NO_EMPHASIS = { enabled: false };

/*
 * Stacked presets: a phrase builds up line by line, each line its own style
 * on its own track. Every preset pairs fonts the way luxury editorial design
 * does, and only pairings that hold up there:
 *
 *  - Fonts: a refined sans (geometric Futura or Avenir, humanist Gill Sans or
 *    Optima, hairline Helvetica, engraved Copperplate), usually in capitals
 *    or light weights, against a high-contrast or old-style serif italic
 *    (Didot, Bodoni, Baskerville, Hoefler, Cochin, Palatino, Times). The
 *    contrast in kind (sans against serif, upright against italic, hairline
 *    against heavy) is what reads as expensive; two similar fonts never do.
 *    Every font ships with macOS.
 *  - Colours: ivory, champagne and gold with at most one soft accent; giant
 *    background words are white in Difference blend so they read over any
 *    footage, and tinted words in Overlay or Screen let the picture in.
 *  - Motion: each line has a job. Small words carry the phrase (fade, blur,
 *    slide), the hero word lands (pop, whip, blink), giant words drift (slow
 *    grow). Lines next to each other move in opposite directions (up against
 *    down) so they meet. Slower than social defaults, 0.25 to 0.4 seconds,
 *    which reads as calm and deliberate.
 *
 * The first four were matched frame by frame to reference videos, then given
 * a serif partner so they pair fonts like the rest.
 */
const STACKED_PRESETS: CaptionPreset[] = [
    stackedPreset('stacked-editorial', 'Stacked Editorial',
        'Futura capitals rise, Didot italic drops to meet them, Didot punch word blinks in Difference.', {
        maxLines: 3,
        maxWordsPerLine: 3,
        maxCharsPerLine: 12,
        pattern: ['sans', 'serif', 'italic'],
        emphasis: emphasis('emphasis', 7),
        anchorY: 0.67,
        overlap: 0.22,
        roles: {
            sans: {
                Font: 'Futura', Style: 'Medium', TextSize: 0.065, Uppercase: true,
                ...motion(['SlideUp', 'Fade'], 'word', 'in', 0.25),
            },
            serif: {
                Font: 'Didot', Style: 'Regular', TextSize: 0.1, OffsetX: -0.03,
                ...motion(['SlideDown', 'Fade'], 'line', 'in', 0.3),
            },
            italic: {
                Font: 'Didot', Style: 'Italic', TextSize: 0.095, OffsetX: 0.04,
                ...motion(['BlurIn', 'Fade'], 'word', 'both', 0.3),
            },
            emphasis: {
                Font: 'Didot', Style: 'Bold', TextSize: 0.14, CompositeMode: 'Difference',
                ...motion(['Blink', 'Grow'], 'line', 'in', 0.2),
            },
        },
    }),
    // Park video: light words pop, coloured words whip, the giant word is white
    // in Difference blend (pale over trees, dark over sky) and keeps growing.
    // A Bodoni italic line gives the Futura its serif partner.
    stackedPreset('stacked-bold-mix', 'Bold Mix',
        'Futura pops and whips in yellow or red, Bodoni italic drops in, giant word in Difference.', {
        maxLines: 4,
        maxWordsPerLine: 2,
        maxCharsPerLine: 10,
        pattern: ['light', 'accent', 'light', 'italic'],
        emphasis: emphasis('giant', 5),
        anchorY: 0.8,
        overlap: 0.3,
        accentColors: ['#EBDC4E', '#F23A1E'],
        roles: {
            light: { Font: 'Futura', Style: 'Medium', TextSize: 0.08, ...motion(['PopIn'], 'word', 'in', 0.15) },
            accent: {
                Font: 'Futura', Style: 'Bold', TextSize: 0.14, Accent: true, Opacity: 95,
                ...motion(['Whip'], 'word', 'both', 0.18),
            },
            italic: {
                Font: 'Bodoni 72', Style: 'Book Italic', TextSize: 0.12,
                ...motion(['SlideDown', 'Fade'], 'line', 'in', 0.25),
            },
            giant: {
                Font: 'Futura', Style: 'Bold', TextSize: 0.18, CompositeMode: 'Difference', Opacity: 90,
                ...motion(['Blink', 'Grow'], 'line', 'both', 0.25),
            },
        },
    }),
    // House video: a huge cream word in Avenir capitals, Baskerville italic
    // around it, the gold word yellow in Overlay so the picture shows through.
    stackedPreset('stacked-cream-pop', 'Cream Pop',
        'Baskerville italic rises and drops around huge cream Avenir capitals, gold in Overlay.', {
        maxLines: 3,
        maxWordsPerLine: 2,
        maxCharsPerLine: 10,
        pattern: ['small', 'hero', 'tail'],
        emphasis: emphasis('gold'),
        anchorY: 0.78,
        overlap: 0.28,
        roles: {
            small: {
                Font: 'Baskerville', Style: 'SemiBold Italic', TextSize: 0.075, OffsetX: -0.06,
                ...motion(['SlideUp', 'BlurIn'], 'word', 'both', 0.25),
            },
            hero: {
                Font: 'Avenir Next', Style: 'Heavy', TextSize: 0.15, Uppercase: true, Opacity: 92, ...fill('#FFE5CA'),
                ...motion(['PopIn', 'BlurIn'], 'line', 'both', 0.3),
            },
            tail: {
                Font: 'Baskerville', Style: 'Italic', TextSize: 0.07, OffsetX: 0.06,
                ...motion(['SlideDown', 'Fade'], 'word', 'in', 0.25),
            },
            gold: {
                Font: 'Baskerville', Style: 'Bold Italic', TextSize: 0.17, CompositeMode: 'Overlay', ...fill('#FAD940'),
                ...motion(['Fade', 'Grow'], 'line', 'both', 0.3),
            },
        },
    }),
    // White suit video: a hairline sans lead-in over a heavy italic serif
    // whose colour changes every phrase.
    stackedPreset('stacked-serif-accent', 'Serif Accent',
        'Hairline Avenir capitals drop in, Hoefler italic rises out of a blur, new colour each phrase.', {
        maxLines: 2,
        maxWordsPerLine: 3,
        maxCharsPerLine: 14,
        pattern: ['lead', 'accent'],
        emphasis: NO_EMPHASIS,
        anchorY: 0.6,
        overlap: 0.15,
        accentColors: ['#9ED6F2', '#FA9E1F', '#5CCF61', '#E37369', '#FAC726'],
        roles: {
            lead: {
                Font: 'Avenir Next', Style: 'Ultra Light', TextSize: 0.06, Uppercase: true,
                ...motion(['SlideDown', 'Fade'], 'word', 'both', 0.3),
            },
            accent: {
                Font: 'Hoefler Text', Style: 'Black Italic', TextSize: 0.13, Accent: true,
                ...motion(['SlideUp', 'BlurIn'], 'line', 'both', 0.3),
            },
        },
    }),
    // The classic pairing: geometric Futura capitals against a Times italic,
    // red as the single accent.
    stackedPreset('stacked-bauhaus-times', 'Bauhaus Times',
        'Futura capitals rise, Times italic in red drops to meet them, giant word in Difference.', {
        maxLines: 3,
        maxWordsPerLine: 2,
        maxCharsPerLine: 11,
        pattern: ['caps', 'italic'],
        emphasis: emphasis('giant'),
        anchorY: 0.72,
        overlap: 0.2,
        roles: {
            caps: {
                Font: 'Futura', Style: 'Bold', TextSize: 0.085, Uppercase: true,
                ...motion(['SlideUp', 'Fade'], 'word', 'in', 0.25),
            },
            italic: {
                Font: 'Times New Roman', Style: 'Italic', TextSize: 0.115, ...fill('#E63946'),
                ...motion(['SlideDown', 'Fade'], 'line', 'both', 0.3),
            },
            giant: {
                Font: 'Futura', Style: 'Bold', TextSize: 0.19, Uppercase: true, CompositeMode: 'Difference',
                ...motion(['PopIn', 'Grow'], 'line', 'in', 0.25),
            },
        },
    }),
    // Parisian house: Optima capitals (the sans of perfume bottles) with a
    // Didot italic in champagne, the punch word blinking on in Screen.
    stackedPreset('stacked-maison', 'Maison',
        'Optima capitals fade in, Didot italic in champagne rises, punch word blinks on in Screen.', {
        maxLines: 3,
        maxWordsPerLine: 3,
        maxCharsPerLine: 13,
        pattern: ['caps', 'italic'],
        emphasis: emphasis('emphasis', 7),
        anchorY: 0.7,
        overlap: 0.15,
        roles: {
            caps: {
                Font: 'Optima', Style: 'Regular', TextSize: 0.06, Uppercase: true, ...fill('#FFFDF5'),
                ...motion(['Fade', 'BlurIn'], 'word', 'both', 0.35),
            },
            italic: {
                Font: 'Didot', Style: 'Italic', TextSize: 0.12, ...fill('#EAD7B7'),
                ...motion(['SlideUp', 'Fade'], 'line', 'both', 0.35),
            },
            emphasis: {
                Font: 'Didot', Style: 'Bold', TextSize: 0.15, CompositeMode: 'Screen', ...fill('#F3E3C3'),
                ...motion(['Blink', 'Grow'], 'line', 'in', 0.25),
            },
        },
    }),
    // Fashion magazine: hairline sans capitals over a Didone, a blush italic
    // and a champagne word that brightens the picture in Screen.
    stackedPreset('stacked-vogue', 'Vogue',
        'Hairline capitals blur in, Didot rises slowly, blush italic drops, champagne in Screen.', {
        maxLines: 3,
        maxWordsPerLine: 3,
        maxCharsPerLine: 14,
        pattern: ['lead', 'hero', 'italic'],
        emphasis: emphasis('emphasis', 8),
        anchorY: 0.7,
        overlap: 0.15,
        roles: {
            lead: {
                Font: 'Avenir Next', Style: 'Ultra Light', TextSize: 0.055, Uppercase: true,
                ...motion(['BlurIn', 'Fade'], 'word', 'both', 0.35),
            },
            hero: { Font: 'Didot', Style: 'Bold', TextSize: 0.12, ...motion(['SlideUp', 'Fade'], 'line', 'both', 0.35) },
            italic: {
                Font: 'Didot', Style: 'Italic', TextSize: 0.1, ...fill('#F6C1C7'),
                ...motion(['SlideDown', 'Fade'], 'line', 'both', 0.35),
            },
            emphasis: {
                Font: 'Didot', Style: 'Italic', TextSize: 0.16, CompositeMode: 'Screen', ...fill('#E8D5B5'),
                ...motion(['Fade', 'Grow'], 'line', 'both', 0.35),
            },
        },
    }),
    // Atelier: Gill Sans light capitals with a Cochin italic in soft rose, the
    // calm pairing of old fashion houses.
    stackedPreset('stacked-atelier', 'Atelier',
        'Gill Sans capitals rise, Cochin italic in rose drops to meet them, ivory word grows.', {
        maxLines: 3,
        maxWordsPerLine: 3,
        maxCharsPerLine: 14,
        pattern: ['caps', 'italic'],
        emphasis: emphasis('emphasis', 7),
        anchorY: 0.68,
        overlap: 0.15,
        roles: {
            caps: {
                Font: 'Gill Sans', Style: 'Light', TextSize: 0.06, Uppercase: true,
                ...motion(['SlideUp', 'Fade'], 'word', 'both', 0.3),
            },
            italic: {
                Font: 'Cochin', Style: 'Italic', TextSize: 0.12, ...fill('#F2C4CE'),
                ...motion(['SlideDown', 'BlurIn'], 'line', 'both', 0.35),
            },
            emphasis: {
                Font: 'Cochin', Style: 'Bold', TextSize: 0.15, ...fill('#FFF8E7'),
                ...motion(['Fade', 'Grow'], 'line', 'both', 0.4),
            },
        },
    }),
    // Riviera: Avenir capitals in soft sea and sand colours under a
    // Baskerville italic, the giant word in Difference.
    stackedPreset('stacked-riviera', 'Riviera',
        'Baskerville italic drops in, Avenir capitals pop up in sea or sand, giant word in Difference.', {
        maxLines: 3,
        maxWordsPerLine: 2,
        maxCharsPerLine: 11,
        pattern: ['italic', 'hero'],
        emphasis: emphasis('giant'),
        anchorY: 0.74,
        overlap: 0.22,
        accentColors: ['#A8DADC', '#F1E3C8', '#F4B6A6'],
        roles: {
            italic: {
                Font: 'Baskerville', Style: 'Italic', TextSize: 0.09,
                ...motion(['SlideDown', 'Fade'], 'word', 'both', 0.28),
            },
            hero: {
                Font: 'Avenir Next', Style: 'Demi Bold', TextSize: 0.12, Uppercase: true, Accent: true,
                ...motion(['PopIn', 'SlideUp'], 'line', 'both', 0.28),
            },
            giant: {
                Font: 'Avenir Next', Style: 'Ultra Light', TextSize: 0.2, Uppercase: true, CompositeMode: 'Difference',
                ...motion(['Fade', 'Grow'], 'line', 'both', 0.35),
            },
        },
    }),
    // Signature: a flowing script against engraved Didot capitals, ivory and
    // gold, the gold word in Overlay. The wedding-invitation pairing.
    stackedPreset('stacked-signature', 'Signature',
        'Didot capitals rise, gold script blurs in like a signature, gold word in Overlay.', {
        maxLines: 3,
        maxWordsPerLine: 2,
        maxCharsPerLine: 12,
        pattern: ['caps', 'script'],
        emphasis: emphasis('gold'),
        anchorY: 0.7,
        overlap: 0.25,
        roles: {
            caps: {
                Font: 'Didot', Style: 'Regular', TextSize: 0.065, Uppercase: true, ...fill('#FFFDF5'),
                ...motion(['SlideUp', 'Fade'], 'word', 'both', 0.3),
            },
            script: {
                Font: 'Snell Roundhand', Style: 'Bold', TextSize: 0.13, ...fill('#E3C27A'),
                ...motion(['BlurIn', 'Fade'], 'word', 'both', 0.4),
            },
            gold: {
                Font: 'Snell Roundhand', Style: 'Black', TextSize: 0.17, CompositeMode: 'Overlay', ...fill('#F2C94C'),
                ...motion(['SlideDown', 'Grow'], 'line', 'both', 0.35),
            },
        },
    }),
    // Noir: black and white only, hairline Helvetica capitals against Bodoni,
    // the heavy words in Difference so the stack inverts with the picture.
    stackedPreset('stacked-noir', 'Noir',
        'Hairline capitals rise, Bodoni whips in Difference, giant Bodoni word blinks and grows.', {
        maxLines: 3,
        maxWordsPerLine: 2,
        maxCharsPerLine: 12,
        pattern: ['lead', 'serif'],
        emphasis: emphasis('giant'),
        anchorY: 0.7,
        overlap: 0.2,
        roles: {
            lead: {
                Font: 'Helvetica Neue', Style: 'UltraLight', TextSize: 0.065, Uppercase: true,
                ...motion(['SlideUp', 'Fade'], 'word', 'in', 0.25),
            },
            serif: {
                Font: 'Bodoni 72', Style: 'Book Italic', TextSize: 0.13, CompositeMode: 'Difference',
                ...motion(['Whip', 'Fade'], 'line', 'both', 0.22),
            },
            giant: {
                Font: 'Bodoni 72', Style: 'Bold', TextSize: 0.21, CompositeMode: 'Difference',
                ...motion(['Blink', 'Grow'], 'line', 'both', 0.22),
            },
        },
    }),
    // Luxury: spaced humanist capitals over a Bodoni italic in gold, the gold
    // punch word in Overlay so it glints with the footage. Slow and calm.
    stackedPreset('stacked-luxury-gold', 'Luxury Gold',
        'Gill Sans capitals blur in slowly, Bodoni italic in gold rises, gold word glints in Overlay.', {
        maxLines: 3,
        maxWordsPerLine: 3,
        maxCharsPerLine: 14,
        pattern: ['caps', 'italic'],
        emphasis: emphasis('gold', 7),
        anchorY: 0.68,
        overlap: 0.12,
        roles: {
            caps: {
                Font: 'Gill Sans', Style: 'Light', TextSize: 0.055, Uppercase: true, ...fill('#FFFFF0'),
                ...motion(['BlurIn', 'Fade'], 'word', 'both', 0.35),
            },
            italic: {
                Font: 'Bodoni 72', Style: 'Book Italic', TextSize: 0.11, ...fill('#D4AF37'),
                ...motion(['SlideUp', 'Fade'], 'line', 'both', 0.35),
            },
            gold: {
                Font: 'Bodoni 72', Style: 'Bold', TextSize: 0.15, CompositeMode: 'Overlay', ...fill('#F2C94C'),
                ...motion(['Fade', 'Grow'], 'line', 'both', 0.4),
            },
        },
    }),
    // Palm Coast: Avenir with a Palatino italic in sage and sand, the key word
    // popping in a soft accent.
    stackedPreset('stacked-palm-coast', 'Palm Coast',
        'Avenir rises, Palatino italic drops to meet it, key word pops in sage, sand or peach.', {
        maxLines: 3,
        maxWordsPerLine: 3,
        maxCharsPerLine: 12,
        pattern: ['sans', 'italic'],
        emphasis: emphasis('accent'),
        anchorY: 0.7,
        overlap: 0.18,
        accentColors: ['#B7D3B0', '#F1E3C8', '#F6C6A8'],
        roles: {
            sans: {
                Font: 'Avenir Next', Style: 'Medium', TextSize: 0.07,
                ...motion(['SlideUp', 'Fade'], 'word', 'both', 0.25),
            },
            italic: {
                Font: 'Palatino', Style: 'Italic', TextSize: 0.105,
                ...motion(['SlideDown', 'Fade'], 'line', 'both', 0.3),
            },
            accent: {
                Font: 'Palatino', Style: 'Bold Italic', TextSize: 0.15, Accent: true,
                ...motion(['PopIn', 'Grow'], 'line', 'both', 0.25),
            },
        },
    }),
    // Heritage: engraved Copperplate capitals with Big Caslon and a
    // Baskerville italic, antique gold, the big word in Overlay.
    stackedPreset('stacked-heritage', 'Heritage',
        'Copperplate capitals fade in, Baskerville italic drops, Big Caslon word glints in Overlay.', {
        maxLines: 3,
        maxWordsPerLine: 3,
        maxCharsPerLine: 13,
        pattern: ['caps', 'italic'],
        emphasis: emphasis('giant'),
        anchorY: 0.7,
        overlap: 0.15,
        roles: {
            caps: {
                Font: 'Copperplate', Style: 'Light', TextSize: 0.06, Uppercase: true, ...fill('#F5EBDD'),
                ...motion(['Fade', 'SlideUp'], 'word', 'both', 0.3),
            },
            italic: {
                Font: 'Baskerville', Style: 'Italic', TextSize: 0.11, ...fill('#C9A86A'),
                ...motion(['SlideDown', 'BlurIn'], 'line', 'both', 0.35),
            },
            giant: {
                Font: 'Big Caslon', Style: 'Medium', TextSize: 0.19, CompositeMode: 'Overlay', ...fill('#F5EBDD'),
                ...motion(['Blink', 'Grow'], 'line', 'both', 0.25),
            },
        },
    }),
];

// Built-in presets ship empty `macroSettings` so the Fusion macro's own defaults
// are used. Users can create custom presets that capture inspector values via
// the `StartPresetEdit` / `CapturePresetSettings` Resolve endpoints.
export const BUILT_IN_PRESETS: CaptionPreset[] = [
    {
        id: 'builtin:chalkboard-bold',
        name: 'Chalkboard Bold',
        description: 'Bold chalkboard style with yellow highlights and outline.',
        builtIn: true,
        version: 1,
        createdAt: EPOCH,
        updatedAt: EPOCH,
        macroSettings: {
            Font: 'Chalkboard',
            Style: 'Bold',
            TextSize: 0.07,
            TextPosition: [0.5, 0.12, 0],
            FadeEnabled: 0,
            PopInEnabled: 0,
            SlideUpEnabled: 0,
            AnimationLength: 0.2,
            AnimationLevel: 0,
            AnimationMode: 0,
            HighlightExtendHorizontal: 0,
            HighlightExtendVertical: 0,
            HighlightRound: 0.2,
            HighlightColorRed: 1,
            HighlightColorGreen: 0.90344,
            HighlightColorBlue: 0.29,
            FillEnabled: 1,
            FillColorRed: 1,
            FillColorGreen: 1,
            FillColorBlue: 1,
            OutlineEnabled: 1,
            OutlineThickness: 0.08,
            OutlineColorRed: 0,
            OutlineColorGreen: 0,
            OutlineColorBlue: 0,
            ShadowEnabled: 1,
            ShadowColorRed: 0,
            ShadowColorGreen: 0,
            ShadowColorBlue: 0,
            HighlightStyle: 0,
            HighlightEnabled: 1,
        },
    },
    {
        id: 'builtin:default',
        name: 'ClickSub Style',
        description: 'Each word pops in as it is spoken - blue outline - no highlight',
        builtIn: true,
        version: 1,
        createdAt: EPOCH,
        updatedAt: EPOCH,
        macroSettings: {
            Font: 'Arial Rounded MT Bold',
            Style: 'Regular',
            TextSize: 0.07,
            TextPosition: [0.5, 0.12, 0],
            FadeEnabled: 0,
            PopInEnabled: 1,
            SlideUpEnabled: 0,
            AnimationLength: 0.2,
            AnimationLevel: 1,
            AnimationMode: 0,
            HighlightExtendHorizontal: -0.03,
            HighlightExtendVertical: 0.06,
            HighlightRound: 0.2,
            HighlightColorRed: 0,
            HighlightColorGreen: 0.208,
            HighlightColorBlue: 1,
            FillEnabled: 1,
            FillColorRed: 1,
            FillColorGreen: 1,
            FillColorBlue: 1,
            OutlineEnabled: 1,
            OutlineThickness: 0.08,
            OutlineColorRed: 0,
            OutlineColorGreen: 0.25433526011561,
            OutlineColorBlue: 1,
            ShadowEnabled: 0,
            ShadowColorRed: 0,
            ShadowColorGreen: 0,
            ShadowColorBlue: 0,
            HighlightStyle: 3,
            HighlightEnabled: 0,
        },
    },
    {
        id: 'builtin:menlo-bold-red',
        name: 'Menlo Bold Red',
        description: 'Monospace font with red highlights and black outline.',
        builtIn: true,
        version: 1,
        createdAt: EPOCH,
        updatedAt: EPOCH,
        macroSettings: {
            Font: 'Menlo',
            Style: 'Bold',
            TextSize: 0.07,
            TextPosition: [0.5, 0.12, 0],
            FadeEnabled: 0,
            PopInEnabled: 0,
            SlideUpEnabled: 0,
            AnimationLength: 0.2,
            AnimationLevel: 0,
            AnimationMode: 0,
            HighlightExtendHorizontal: -0.04,
            HighlightExtendVertical: 0,
            HighlightRound: 0.2,
            HighlightColorRed: 1,
            HighlightColorGreen: 0,
            HighlightColorBlue: 0,
            FillEnabled: 1,
            FillColorRed: 1,
            FillColorGreen: 1,
            FillColorBlue: 1,
            OutlineEnabled: 1,
            OutlineThickness: 0.08,
            OutlineColorRed: 0,
            OutlineColorGreen: 0,
            OutlineColorBlue: 0,
            ShadowEnabled: 1,
            ShadowColorRed: 0,
            ShadowColorGreen: 0,
            ShadowColorBlue: 0,
            HighlightStyle: 3,
            HighlightEnabled: 1,
        },
    },
    {
        id: 'builtin:futura-bold-blue',
        name: 'Futura Bold Blue',
        description: 'Clean sans-serif with blue highlights and no outline.',
        builtIn: true,
        version: 1,
        createdAt: EPOCH,
        updatedAt: EPOCH,
        macroSettings: {
            Font: 'Futura',
            Style: 'Bold',
            TextSize: 0.07,
            TextPosition: [0.5, 0.12, 0],
            FadeEnabled: 0,
            PopInEnabled: 0,
            SlideUpEnabled: 0,
            AnimationLength: 0.2,
            AnimationLevel: 0,
            AnimationMode: 0,
            HighlightExtendHorizontal: -0.03,
            HighlightExtendVertical: 0.06,
            HighlightRound: 0.2,
            HighlightColorRed: 0,
            HighlightColorGreen: 0.208,
            HighlightColorBlue: 1,
            FillEnabled: 1,
            FillColorRed: 1,
            FillColorGreen: 1,
            FillColorBlue: 1,
            OutlineEnabled: 0,
            OutlineThickness: 0.08,
            OutlineColorRed: 0,
            OutlineColorGreen: 0,
            OutlineColorBlue: 0,
            ShadowEnabled: 0,
            ShadowColorRed: 0,
            ShadowColorGreen: 0,
            ShadowColorBlue: 0,
            HighlightStyle: 3,
            HighlightEnabled: 1,
        },
    },
    ...STACKED_PRESETS,
];

export const DEFAULT_PRESET_ID = 'builtin:chalkboard-bold';

export const isBuiltInPresetId = (id: string) => id.startsWith('builtin:');
