--[[
    Stacked captions: a phrase builds up as 1-6 lines stacked on top of each
    other, each line in its own style ("But my best" / "performing" / "viral
    videos"), then clears for the next phrase.

    Every line is its own AutoSubs Caption clip on its own video track, so each
    one can carry its own font, size and position, and stays editable by hand
    in Resolve afterwards. This module is the pure part: it turns transcript
    segments into screens and lines, picks a style for each line, and works out
    where each line sits. It never touches Resolve, so it can be tested without
    it.

    The configuration travels inside a preset's macroSettings under the
    reserved `Stacked` key. The macro only applies keys it declares in
    InputKeys, so the key is inert anywhere else.
]]

local stacked_layout = {}

stacked_layout.KEY = "Stacked"

--- Keys that belong to the layout, never to the macro: stripped before a
--- role's settings are written to a clip.
---   OffsetX        shifts the line sideways from the anchor
---   CompositeMode  the clip's blend mode in Resolve (see BLEND_MODES)
---   Opacity        the clip's opacity in Resolve, 0-100
---   Uppercase      writes the line in capitals
---   Accent         takes the fill colour from `accentColors`, one per screen
local LAYOUT_ONLY_KEYS = { OffsetX = true, CompositeMode = true, Opacity = true, Uppercase = true, Accent = true }

--- Resolve's composite modes by name, as TimelineItem:SetProperty takes them.
stacked_layout.BLEND_MODES = {
    Normal = 0, Add = 1, Subtract = 2, Difference = 3, Multiply = 4, Screen = 5,
    Overlay = 6, Hardlight = 7, Softlight = 8, Darken = 9, Lighten = 10,
    ColorDodge = 11, ColorBurn = 12, Exclusion = 13,
}

--- How many tracks (lines per screen) a stacked preset can use.
stacked_layout.MAX_LINES = 6

stacked_layout.DEFAULTS = {
    maxLines = 3,
    maxWordsPerLine = 3,
    maxCharsPerLine = 12,
    -- A pause this long between two words starts a new line...
    linePause = 0.35,
    -- ...and this long starts a new screen.
    screenPause = 0.7,
    -- Commas end a line, sentence punctuation ends the screen.
    breakOnPunctuation = true,
    -- A screen stays up until the next one starts when the gap is shorter
    -- than this, so captions don't flicker off between phrases.
    holdGap = 1.0,
    -- Line styles cycle through this pattern from the top of each screen.
    pattern = { "sans", "serif", "italic" },
    -- Short punch lines ("even", "sales,") get the emphasis style instead.
    emphasis = {
        enabled = true,
        role = "emphasis",
        maxWords = 1,
        maxChars = 7,
        skipFirstLine = true,
    },
    -- Where the first line of each screen sits (0-1, Fusion coordinates:
    -- y = 1 is the top of the frame). Later lines stack downwards.
    anchorX = 0.5,
    anchorY = 0.7,
    -- Line height as a multiple of TextSize, and how much each line tucks
    -- under the one above (0 = touching, 0.3 = 30% overlap).
    lineSpacing = 1.0,
    overlap = 0.25,
    -- Fill colours for roles marked `Accent`, used in turn, one per screen.
    -- Each is { red, green, blue } in 0-1.
    accentColors = {},
    -- Settings shared by every role (animation, colours...). Each role's own
    -- settings win over these.
    base = {},
    roles = {},
}

local function copy(t)
    local out = {}
    for k, v in pairs(t or {}) do out[k] = v end
    return out
end

--- UTF-8 aware character count.
local function utf8len(s)
    local _, count = string.gsub(s, "[^\128-\191]", "")
    return count
end

local function trim(s)
    return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

--- The stacked configuration carried by a preset, or nil for a normal preset.
--- `tracks`, when given, overrides how many lines (and so tracks) a screen
--- builds up to.
function stacked_layout.config_of(presetSettings, tracks)
    if type(presetSettings) ~= "table" then return nil end
    local raw = presetSettings[stacked_layout.KEY]
    if type(raw) ~= "table" then return nil end
    local cfg = stacked_layout.normalize(raw)
    tracks = tonumber(tracks)
    if tracks then
        cfg.maxLines = math.max(1, math.min(stacked_layout.MAX_LINES, math.floor(tracks)))
    end
    return cfg
end

--- Fill a raw configuration in from the defaults. Nested tables are merged one
--- level deep so a preset can override a single emphasis field.
function stacked_layout.normalize(raw)
    raw = raw or {}
    local cfg = copy(stacked_layout.DEFAULTS)
    for k, v in pairs(raw or {}) do cfg[k] = v end
    cfg.emphasis = copy(stacked_layout.DEFAULTS.emphasis)
    for k, v in pairs(type(raw.emphasis) == "table" and raw.emphasis or {}) do cfg.emphasis[k] = v end
    if type(cfg.pattern) ~= "table" or #cfg.pattern == 0 then
        cfg.pattern = copy(stacked_layout.DEFAULTS.pattern)
    end
    if type(cfg.roles) ~= "table" then cfg.roles = {} end
    if type(cfg.base) ~= "table" then cfg.base = {} end
    local accents = {}
    for _, c in ipairs(type(cfg.accentColors) == "table" and cfg.accentColors or {}) do
        if type(c) == "table" and tonumber(c[1]) and tonumber(c[2]) and tonumber(c[3]) then
            accents[#accents + 1] = { tonumber(c[1]), tonumber(c[2]), tonumber(c[3]) }
        end
    end
    cfg.accentColors = accents
    cfg.maxLines = math.max(1, math.min(stacked_layout.MAX_LINES, math.floor(tonumber(cfg.maxLines) or 3)))
    cfg.maxWordsPerLine = math.max(1, math.floor(tonumber(cfg.maxWordsPerLine) or 3))
    return cfg
end

local function ends_sentence(word)
    return trim(word):match("[%.%!%?]$") ~= nil
end

local function ends_clause(word)
    return trim(word):match("[,;:]$") ~= nil
end

--- Give `tokens[from..to]` times between `t0` and `t1`, in proportion to
--- their length.
local function spread(out, tokens, from, to, t0, t1)
    local total = 0
    for i = from, to do total = total + utf8len(tokens[i]) end
    local used = 0
    for i = from, to do
        local s = t0 + (t1 - t0) * (total > 0 and used / total or 0)
        used = used + utf8len(tokens[i])
        out[i] = { word = (i == 1 and "" or " ") .. tokens[i], start = s,
            ["end"] = t0 + (t1 - t0) * (total > 0 and used / total or 1) }
    end
end

--- Words of a segment, in step with its text.
---
--- Editing a caption in the app changes only its text: the words keep what
--- was transcribed, because the app compares the two to find the edits. So a
--- word whose text the user kept keeps its timing, and new or retyped words
--- share the time between the kept ones. Without word timings, the text is
--- split evenly over the segment.
function stacked_layout.words_of(segment)
    local timed = {}
    for _, w in ipairs(segment.words or {}) do
        if w.word and trim(w.word) ~= "" and tonumber(w.start) and tonumber(w["end"]) then
            timed[#timed + 1] = w
        end
    end

    local text = tostring(segment.text or "")
    local transcribed = {}
    for i, w in ipairs(timed) do transcribed[i] = trim(w.word) end
    if #timed > 0 and table.concat(transcribed):gsub("%s+", "") == text:gsub("%s+", "") then
        local words = {}
        for i, w in ipairs(timed) do words[i] = copy(w) end
        return words
    end

    local tokens = {}
    for token in text:gmatch("%S+") do tokens[#tokens + 1] = token end
    local t0 = tonumber(segment.start) or (timed[1] and tonumber(timed[1].start))
    local t1 = tonumber(segment["end"]) or (timed[#timed] and tonumber(timed[#timed]["end"]))
    if #tokens == 0 or not t0 or not t1 then return {} end

    -- Longest common subsequence of the transcribed and the edited words.
    local n, m = #transcribed, #tokens
    local lcs = {}
    for i = n + 1, 1, -1 do
        lcs[i] = {}
        for j = m + 1, 1, -1 do
            if i > n or j > m then
                lcs[i][j] = 0
            elseif transcribed[i] == tokens[j] then
                lcs[i][j] = lcs[i + 1][j + 1] + 1
            else
                lcs[i][j] = math.max(lcs[i + 1][j], lcs[i][j + 1])
            end
        end
    end

    local words = {}
    local i, j = 1, 1
    local gapFrom, gapTime = 1, t0
    local function close_gap(to, untilTime)
        if to < gapFrom then return end
        -- Words added where there is no pause take the second half of the
        -- word before them, so they still show.
        local prev = words[gapFrom - 1]
        if untilTime <= gapTime and prev then
            local mid = (tonumber(prev.start) + tonumber(prev["end"])) / 2
            prev["end"], gapTime = mid, mid
        end
        spread(words, tokens, gapFrom, to, gapTime, math.max(gapTime, untilTime))
    end
    while j <= m do
        if i <= n and transcribed[i] == tokens[j] then
            local w = timed[i]
            close_gap(j - 1, tonumber(w.start))
            words[j] = copy(w)
            words[j].word = (j == 1 and "" or " ") .. tokens[j]
            gapFrom, gapTime = j + 1, tonumber(w["end"])
            i, j = i + 1, j + 1
        elseif i <= n and lcs[i + 1][j] >= lcs[i][j + 1] then
            i = i + 1
        else
            j = j + 1
        end
    end
    close_gap(m, t1)
    return words
end
local words_of = stacked_layout.words_of

local function line_chars(line)
    local n = 0
    for i, w in ipairs(line.words) do
        n = n + utf8len(i == 1 and trim(w.word) or w.word)
    end
    return n
end

--- Which style a line gets: the pattern by position, unless it is a short
--- punch line, which gets the emphasis style.
function stacked_layout.role_for(cfg, line, lineIndex)
    local e = cfg.emphasis
    if e.enabled and not (e.skipFirstLine and lineIndex == 1) and #line.words <= (e.maxWords or 1) then
        local letters = 0
        for _, w in ipairs(line.words) do
            letters = letters + utf8len((trim(w.word):gsub("%p", "")))
        end
        if letters <= (e.maxChars or 7) then
            return e.role
        end
    end
    return cfg.pattern[((lineIndex - 1) % #cfg.pattern) + 1]
end

--[[
    Split segments into screens of lines.

    Returns a list of screens:
      { segmentIndex, speaker_id, start, ["end"], lines = {
          { words, text, start, ["end"], role } } }
    Screens never cross a segment boundary.
]]
function stacked_layout.build_screens(segments, cfg)
    local screens = {}

    for segmentIndex, segment in ipairs(segments or {}) do
        local words = words_of(segment)
        local screen, line, prev = nil, nil, nil

        local function close_line()
            if line and #line.words > 0 then
                table.insert(screen.lines, line)
            end
            line = nil
        end
        local function close_screen()
            close_line()
            if screen and #screen.lines > 0 then
                table.insert(screens, screen)
            end
            screen = nil
        end

        for _, word in ipairs(words) do
            local gap = prev and (word.start - prev["end"]) or 0
            local newScreen = screen == nil
                or gap >= cfg.screenPause
                or (cfg.breakOnPunctuation and prev and ends_sentence(prev.word))
            local newLine = newScreen or line == nil
                or gap >= cfg.linePause
                or (cfg.breakOnPunctuation and prev and ends_clause(prev.word))
                or #line.words >= cfg.maxWordsPerLine
                or (line_chars(line) + utf8len(word.word) > cfg.maxCharsPerLine)

            -- A full screen spills onto the next one.
            if not newScreen and newLine and #screen.lines + (line and 1 or 0) >= cfg.maxLines then
                newScreen = true
            end

            if newScreen then
                close_screen()
                screen = { segmentIndex = segmentIndex, speaker_id = segment.speaker_id, lines = {} }
            elseif newLine then
                close_line()
            end
            if line == nil then line = { words = {} } end
            table.insert(line.words, word)
            prev = word
        end
        close_screen()
    end

    for _, screen in ipairs(screens) do
        for i, line in ipairs(screen.lines) do
            -- The first word's leading space would offset the macro's
            -- per-word character indices, so it is dropped from both.
            line.words[1] = copy(line.words[1])
            line.words[1].word = trim(line.words[1].word)
            local parts = {}
            for _, w in ipairs(line.words) do parts[#parts + 1] = w.word end
            line.text = table.concat(parts)
            line.start = line.words[1].start
            line["end"] = line.words[#line.words]["end"]
            line.role = stacked_layout.role_for(cfg, line, i)
        end
        screen.start = screen.lines[1].start
        screen["end"] = screen.lines[#screen.lines]["end"]
    end

    -- Hold each screen until the next one when the gap is short.
    for i = 1, #screens - 1 do
        local gap = screens[i + 1].start - screens[i]["end"]
        if gap > 0 and gap < cfg.holdGap then
            screens[i]["end"] = screens[i + 1].start
        end
    end

    return screens
end

local function role_value(cfg, role, key, fallback)
    local r = cfg.roles[role]
    if type(r) == "table" and r[key] ~= nil then return r[key] end
    if cfg.base[key] ~= nil then return cfg.base[key] end
    return fallback
end

local function is_on(value)
    return value == true or value == 1
end

--- A role's settings merged over the shared base, without TextPosition (that
--- is per line) or layout-only keys. An accent role on screen `screenIndex`
--- gets that screen's accent colour as its fill.
function stacked_layout.role_settings(cfg, role, screenIndex)
    local out = copy(cfg.base)
    for k, v in pairs(type(cfg.roles[role]) == "table" and cfg.roles[role] or {}) do out[k] = v end
    for k in pairs(LAYOUT_ONLY_KEYS) do out[k] = nil end
    out.TextPosition = nil
    local accents = cfg.accentColors or {}
    if is_on(role_value(cfg, role, "Accent", false)) and #accents > 0 then
        local c = accents[(((screenIndex or 1) - 1) % #accents) + 1]
        out.FillEnabled = 1
        out.FillColorRed, out.FillColorGreen, out.FillColorBlue = c[1], c[2], c[3]
    end
    return out
end

--- What a role sets on the timeline clip itself rather than in the macro:
--- { CompositeMode = <Resolve enum>, Opacity = 0-100 }, either may be absent.
--- An unknown blend mode name is ignored rather than guessed.
function stacked_layout.clip_properties(cfg, role)
    local props = {}
    local mode = role_value(cfg, role, "CompositeMode", nil)
    if type(mode) == "string" then mode = stacked_layout.BLEND_MODES[mode] end
    if tonumber(mode) then props.CompositeMode = math.floor(tonumber(mode)) end
    local opacity = tonumber(role_value(cfg, role, "Opacity", nil))
    if opacity then props.Opacity = math.max(0, math.min(100, opacity)) end
    return props
end

--[[
    Centre positions of each line of a screen, top line at the anchor and the
    rest stacking downwards. Text+ sizes are relative to frame width, so the
    frame aspect (width / height) converts them into heights.
]]
function stacked_layout.line_positions(cfg, screen, aspect)
    aspect = aspect or (16 / 9)
    local positions = {}
    local y = cfg.anchorY
    local prevHeight = nil
    for i, line in ipairs(screen.lines) do
        local size = tonumber(role_value(cfg, line.role, "TextSize", 0.08)) or 0.08
        local height = size * cfg.lineSpacing * aspect
        if prevHeight then
            y = y - (prevHeight + height) / 2 * (1 - cfg.overlap)
        end
        local offsetX = tonumber(role_value(cfg, line.role, "OffsetX", 0)) or 0
        positions[i] = { cfg.anchorX + offsetX, y, 0 }
        prevHeight = height
    end
    return positions
end

--[[
    Flatten screens into one caption per line, ready to place on the timeline:
      { segmentIndex, screenIndex, lineIndex, role, text, words, start,
        ["end"], speaker_id, presetSettings, clipProperties }
    `start` is the line's first word, `end` the end of its screen, so the lines
    of a screen appear one after another and clear together.
]]
function stacked_layout.line_captions(segments, cfg, aspect)
    local out = {}
    for screenIndex, screen in ipairs(stacked_layout.build_screens(segments, cfg)) do
        local positions = stacked_layout.line_positions(cfg, screen, aspect)
        for lineIndex, line in ipairs(screen.lines) do
            local settings = stacked_layout.role_settings(cfg, line.role, screenIndex)
            settings.TextPosition = positions[lineIndex]
            local text, words = line.text, line.words
            -- Capitals keep every character in place, so word timings stay valid.
            if is_on(role_value(cfg, line.role, "Uppercase", false)) then
                text = text:upper()
                words = {}
                for i, w in ipairs(line.words) do
                    words[i] = copy(w)
                    words[i].word = w.word:upper()
                end
            end
            table.insert(out, {
                segmentIndex = screen.segmentIndex,
                screenIndex = screenIndex,
                lineIndex = lineIndex,
                role = line.role,
                text = text,
                words = words,
                start = line.start,
                ["end"] = screen["end"],
                speaker_id = screen.speaker_id,
                presetSettings = settings,
                clipProperties = stacked_layout.clip_properties(cfg, line.role),
            })
        end
    end
    return out
end

--- Settings for a single-clip preview of a stacked preset: its first style.
function stacked_layout.preview_settings(cfg)
    return stacked_layout.role_settings(cfg, cfg.pattern[1])
end

return stacked_layout
