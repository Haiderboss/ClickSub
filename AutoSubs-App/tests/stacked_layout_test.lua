-- Tests for modules/stacked_layout.lua, the screen/line splitting behind
-- stacked captions. Pure logic, no Resolve mocks needed.
--
-- Run from the AutoSubs-App directory:
--   luajit tests/stacked_layout_test.lua

local MODULES = (arg and arg[0] and arg[0]:match("(.*/)") or "./") .. "../src-tauri/resources/modules"
local L = assert(loadfile(MODULES .. "/stacked_layout.lua"))()

local PASS, FAIL = 0, 0
local function check(cond, label, extra)
    if cond then
        PASS = PASS + 1
        print("  PASS " .. label)
    else
        FAIL = FAIL + 1
        print("  FAIL " .. label .. (extra and ("  (" .. tostring(extra) .. ")") or ""))
    end
end

-- Builds a segment from { word, start, end } triples, with whisper-style
-- leading spaces on every word after the first.
local function segment(list, speaker)
    local words, parts = {}, {}
    for i, w in ipairs(list) do
        local text = (i == 1 and "" or " ") .. w[1]
        words[i] = { word = text, start = w[2], ["end"] = w[3] }
        parts[i] = text
    end
    return {
        start = list[1][2],
        ["end"] = list[#list][3],
        text = table.concat(parts),
        words = words,
        speaker_id = speaker,
    }
end

local function texts(screen)
    local out = {}
    for i, line in ipairs(screen.lines) do out[i] = line.text end
    return table.concat(out, " / ")
end

local function roles(screen)
    local out = {}
    for i, line in ipairs(screen.lines) do out[i] = line.role end
    return table.concat(out, ",")
end

-- Modelled on the reference video. Its line breaks fall on the speaker's
-- pauses (a beat before "viral", "even", "scripted.", "that" and "sales,"), and "the most"
-- starts a new screen after a longer one.
local REFERENCE = {
    segment({
        { "But", 0.00, 0.05 }, { "my", 0.05, 0.10 }, { "best", 0.10, 0.18 },
        { "performing", 0.19, 0.60 },
        { "viral", 1.00, 1.20 }, { "videos", 1.25, 1.45 },
        { "were", 1.50, 1.62 }, { "not", 1.62, 1.80 },
        { "even", 2.20, 2.35 },
        { "scripted.", 2.75, 3.05 },
    }),
    segment({
        { "The", 3.15, 3.25 }, { "ones", 3.25, 3.35 },
        { "that", 3.75, 3.85 }, { "got", 3.85, 3.95 }, { "me", 3.95, 4.05 },
        { "the", 4.80, 4.90 }, { "most", 4.90, 5.00 },
        { "sales,", 5.40, 5.75 },
    }),
}

print("== reference video")
do
    local cfg = L.normalize({})
    local screens = L.build_screens(REFERENCE, cfg)
    check(#screens == 4, "splits into four screens", #screens)
    check(texts(screens[1]) == "But my best / performing / viral videos", "screen 1 lines", texts(screens[1]))
    check(roles(screens[1]) == "sans,serif,italic", "screen 1 follows the pattern", roles(screens[1]))
    check(texts(screens[2]) == "were not / even / scripted.", "screen 2 lines", texts(screens[2]))
    check(roles(screens[2]) == "sans,emphasis,italic", "short middle line gets emphasis", roles(screens[2]))
    check(texts(screens[3]) == "The ones / that got me", "screen 3 lines", texts(screens[3]))
    check(texts(screens[4]) == "the most / sales,", "screen 4 lines", texts(screens[4]))
    check(roles(screens[4]) == "sans,emphasis", "punch word gets emphasis", roles(screens[4]))
    check(screens[1].lines[2].role == "serif", "long single word is not emphasised")
end

print("== line text and timing")
do
    local cfg = L.normalize({})
    local screens = L.build_screens(REFERENCE, cfg)
    local line = screens[1].lines[1]
    check(line.text == "But my best", "first word's leading space is dropped", "'" .. line.text .. "'")
    check(line.words[1].word == "But", "word list matches the text")
    check(line.start == 0.00 and line["end"] == 0.18, "line spans its words")
    check(screens[1].lines[3].start == 1.00, "later lines start at their first word")
    check(REFERENCE[1].words[1].word == "But" and REFERENCE[1].words[2].word == " my",
        "source words are not mutated")
end

print("== screens hold until the next one")
do
    local cfg = L.normalize({})
    local screens = L.build_screens(REFERENCE, cfg)
    check(screens[1]["end"] == screens[2].start, "short gap is closed", screens[1]["end"])
    local far = L.build_screens({
        segment({ { "one", 0, 0.5 } }),
        segment({ { "two", 5, 5.5 } }),
    }, cfg)
    check(far[1]["end"] == 0.5, "long gap is left alone", far[1]["end"])
end

print("== limits and punctuation")
do
    local seg = segment({
        { "a", 0, 0.1 }, { "b", 0.1, 0.2 }, { "c", 0.2, 0.3 }, { "d", 0.3, 0.4 },
        { "e", 0.4, 0.5 }, { "f", 0.5, 0.6 }, { "g", 0.6, 0.7 },
    })
    local screens = L.build_screens({ seg }, L.normalize({ maxWordsPerLine = 2, maxLines = 2 }))
    check(texts(screens[1]) == "a b / c d", "words per line and lines per screen", texts(screens[1]))
    check(texts(screens[2]) == "e f / g", "overflow spills to a new screen", texts(screens[2]))

    local punct = L.build_screens({
        segment({ { "Hi,", 0, 0.1 }, { "you", 0.1, 0.2 }, { "there.", 0.2, 0.3 }, { "Next", 0.3, 0.4 } }),
    }, L.normalize({}))
    check(texts(punct[1]) == "Hi, / you there.", "comma ends a line", texts(punct[1]))
    check(texts(punct[2]) == "Next", "full stop ends a screen", punct[2] and texts(punct[2]))

    local noPunct = L.build_screens({
        segment({ { "Hi,", 0, 0.1 }, { "you", 0.1, 0.2 } }),
    }, L.normalize({ breakOnPunctuation = false }))
    check(texts(noPunct[1]) == "Hi, you", "punctuation breaks can be turned off", texts(noPunct[1]))
end

print("== segments without word timings")
do
    local screens = L.build_screens({ { start = 0, ["end"] = 1, text = "split me evenly" } }, L.normalize({}))
    check(#screens == 1 and texts(screens[1]) == "split me / evenly", "falls back to the text", screens[1] and texts(screens[1]))
end

print("== emphasis rule settings")
do
    local seg = { segment({ { "Go", 0, 0.1 } }) }
    check(L.build_screens(seg, L.normalize({}))[1].lines[1].role == "sans", "first line skipped by default")
    local always = L.normalize({ emphasis = { skipFirstLine = false } })
    check(always.emphasis.maxChars == 7, "partial emphasis override keeps other defaults")
    check(L.build_screens(seg, always)[1].lines[1].role == "emphasis", "first line can be emphasised")
    local off = L.normalize({ emphasis = { enabled = false } })
    local s = L.build_screens(REFERENCE, off)
    check(roles(s[2]) == "sans,serif,italic", "emphasis can be turned off", roles(s[2]))
end

print("== positions and settings")
do
    local cfg = L.normalize({
        anchorX = 0.5,
        anchorY = 0.7,
        overlap = 0,
        lineSpacing = 1,
        base = { FadeEnabled = 1, TextSize = 0.1 },
        roles = {
            sans = { Font = "Inter", OffsetX = 0.02 },
            serif = { Font = "Georgia", TextSize = 0.2, TextPosition = { 0, 0, 0 } },
        },
    })
    local screen = { lines = { { role = "sans" }, { role = "serif" } } }
    local pos = L.line_positions(cfg, screen, 1)
    check(pos[1][1] == 0.52 and pos[1][2] == 0.7, "first line at the anchor plus its offset")
    check(math.abs(pos[2][2] - (0.7 - 0.15)) < 1e-9, "second line sits half of both heights lower", pos[2][2])
    local tight = L.line_positions(L.normalize({ overlap = 0.5, base = { TextSize = 0.1 } }),
        { lines = { { role = "x" }, { role = "x" } } }, 1)
    check(math.abs(tight[2][2] - 0.65) < 1e-9, "overlap pulls lines together", tight[2][2])
    local tall = L.line_positions(L.normalize({ overlap = 0, base = { TextSize = 0.1 } }),
        { lines = { { role = "x" }, { role = "x" } } }, 9 / 16)
    check(math.abs(tall[2][2] - (0.7 - 0.1 * 9 / 16)) < 1e-9, "frame aspect converts size to height", tall[2][2])

    local s = L.role_settings(cfg, "serif")
    check(s.Font == "Georgia" and s.FadeEnabled == 1 and s.TextSize == 0.2, "role settings merge over base")
    check(s.TextPosition == nil, "role TextPosition is ignored")
    check(L.role_settings(cfg, "sans").OffsetX == nil, "layout-only keys are stripped")
    check(L.role_settings(cfg, "missing").FadeEnabled == 1, "unknown role falls back to base")
    check(L.preview_settings(cfg).Font == "Inter", "preview uses the first pattern style")
end

print("== line captions")
do
    local cfg = L.normalize({ roles = { sans = { Font = "Inter" } } })
    local caps = L.line_captions(REFERENCE, cfg, 9 / 16)
    check(#caps == 10, "one caption per line", #caps)
    local first, second = caps[1], caps[2]
    check(first.screenIndex == 1 and first.lineIndex == 1 and second.lineIndex == 2, "indices recorded")
    check(first.segmentIndex == 1 and caps[#caps].segmentIndex == 2, "segment index kept for tagging")
    check(first["end"] == second["end"], "lines of a screen clear together")
    check(second.start > first.start, "later lines start later")
    check(first.presetSettings.Font == "Inter", "caption carries its role's settings")
    check(type(first.presetSettings.TextPosition) == "table", "caption carries its position")
    check(first.presetSettings.TextPosition[2] > second.presetSettings.TextPosition[2], "lines stack downwards")
end

print("== config_of")
do
    check(L.config_of({ Font = "Arial" }) == nil, "normal preset is not stacked")
    check(L.config_of(nil) == nil, "nil settings are not stacked")
    local cfg = L.config_of({ Stacked = { maxLines = 2 } })
    check(cfg and cfg.maxLines == 2 and cfg.maxWordsPerLine == 3, "stacked preset is filled from defaults")
    check(L.normalize({ pattern = {} }).pattern[1] == "sans", "empty pattern falls back to the default")
end

print("== track count")
do
    local preset = { Stacked = { maxLines = 3 } }
    check(L.config_of(preset, 5).maxLines == 5, "track count overrides the preset")
    check(L.config_of(preset, nil).maxLines == 3, "no track count keeps the preset's")
    check(L.config_of(preset, 99).maxLines == L.MAX_LINES, "track count is capped")
    check(L.config_of(preset, 0).maxLines == 1, "track count is at least one")
    check(L.normalize({ maxLines = 40 }).maxLines == L.MAX_LINES, "preset line count is capped too")

    local cfg = L.config_of({ Stacked = { maxWordsPerLine = 1, emphasis = { enabled = false } } }, 4)
    local screens = L.build_screens({ segment({ { "a", 0, 0.1 }, { "b", 0.1, 0.2 }, { "c", 0.2, 0.3 },
        { "d", 0.3, 0.4 }, { "e", 0.4, 0.5 } }) }, cfg)
    check(#screens == 2 and #screens[1].lines == 4, "four tracks hold four lines a screen", #screens)
    check(screens[1].lines[4].role == "sans", "the pattern repeats past its length", screens[1].lines[4].role)
end

print("== clip properties")
do
    local cfg = L.normalize({
        base = { Opacity = 90 },
        roles = {
            a = { CompositeMode = "Overlay" },
            b = { CompositeMode = 8, Opacity = 150 },
            c = { CompositeMode = "Sparkle" },
        },
    })
    local a, b, c = L.clip_properties(cfg, "a"), L.clip_properties(cfg, "b"), L.clip_properties(cfg, "c")
    check(a.CompositeMode == 6 and a.Opacity == 90, "blend name maps to Resolve's mode, opacity from base")
    check(b.CompositeMode == 8 and b.Opacity == 100, "numeric mode kept, opacity capped at 100")
    check(c.CompositeMode == nil, "unknown blend name is ignored")
    local settings = L.role_settings(cfg, "a")
    check(settings.CompositeMode == nil and settings.Opacity == nil, "clip properties stay out of the macro")
end

print("== accent colours")
do
    local cfg = L.normalize({
        accentColors = { { 1, 0, 0 }, { 0, 1, 0 }, "junk", { 0, 0 } },
        roles = { hero = { Accent = true, FillColorRed = 0.5 }, plain = { FillColorRed = 0.5 } },
    })
    check(#cfg.accentColors == 2, "malformed accent colours are dropped", #cfg.accentColors)
    check(L.role_settings(cfg, "hero", 1).FillColorRed == 1, "screen 1 takes accent 1")
    check(L.role_settings(cfg, "hero", 2).FillColorGreen == 1, "screen 2 takes accent 2")
    check(L.role_settings(cfg, "hero", 3).FillColorRed == 1, "accents cycle")
    check(L.role_settings(cfg, "plain", 2).FillColorRed == 0.5, "only accent roles change colour")
    check(L.role_settings(cfg, "hero", 1).Accent == nil, "accent flag stays out of the macro")
    local none = L.normalize({ roles = { hero = { Accent = true, FillColorRed = 0.5 } } })
    check(L.role_settings(none, "hero", 1).FillColorRed == 0.5, "no accent list keeps the role's own colour")
end

print("== uppercase")
do
    local cfg = L.normalize({
        maxWordsPerLine = 2,
        emphasis = { enabled = false },
        pattern = { "small", "big" },
        roles = { big = { Uppercase = true } },
    })
    local seg = segment({ { "get", 0, 0.2 }, { "in", 0.2, 0.4 }, { "touch", 0.4, 0.6 }, { "café", 0.6, 0.8 } })
    local caps = L.line_captions({ seg }, cfg, 9 / 16)
    check(caps[1].text == "get in", "other roles keep their case", caps[1].text)
    check(caps[2].text == "TOUCH CAFé", "uppercase role is in capitals", caps[2].text)
    check(caps[2].words[2].word == " CAFé", "word timings are uppercased too", caps[2].words[2].word)
    check(#caps[2].text == #"touch café", "capitals keep every character in place")
    check(seg.words[3].word == " touch", "source words are not changed")
end

print("== words follow edited text")
do
    local seg = segment({ { "baad", 0, 0.5 }, { "log", 0.5, 1.0 }, { "aaye", 1.0, 1.5 } })
    local same = L.words_of(seg)
    check(#same == 3 and same[1].start == 0 and same[3]["end"] == 1.5, "unedited words keep their timing")

    seg.text = "Baaz log aaye"
    local fixed = L.words_of(seg)
    check(#fixed == 3, "a retyped word replaces the old one", #fixed)
    check(fixed[1].word == "Baaz" and fixed[1].start == 0 and fixed[1]["end"] == 0.5,
        "retyped word fills the old word's time", fixed[1].word .. " " .. fixed[1]["end"])
    check(fixed[2].word == " log" and fixed[2].start == 0.5, "kept words keep their timing")

    seg.text = "log aaye"
    local removed = L.words_of(seg)
    check(#removed == 2 and removed[1].word == "log" and removed[1].start == 0.5, "a deleted word disappears")

    seg.text = "baad log jaldi aaye"
    local added = L.words_of(seg)
    check(#added == 4 and added[3].word == " jaldi", "an added word appears", #added)
    check(added[2]["end"] == 0.75 and added[3].start == 0.75 and added[3]["end"] == 1.0,
        "an added word borrows time from the word before it", added[3].start)

    seg.text = "sab badal gaya"
    local all = L.words_of(seg)
    check(#all == 3 and all[1].start == 0 and all[3]["end"] == 1.5, "rewritten text spans the caption")

    seg = segment({ { "baad", 0, 0.5 }, { "log", 0.5, 1.0 } })
    seg.text = "baaz log"
    local caps = L.line_captions({ seg }, L.normalize({ maxWordsPerLine = 3 }), 9 / 16)
    check(caps[1].text == "baaz log", "stacked lines show the edited text", caps[1].text)
end

print(string.format("\n%d passed, %d failed", PASS, FAIL))
if FAIL > 0 then os.exit(1) end
