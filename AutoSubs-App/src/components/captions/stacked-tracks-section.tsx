import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSettingsStore } from "@/stores/settings-store";
import type { StackedConfig } from "@/lib/stacked-captions";
import { STACKED_LAYOUT_DEFAULTS } from "@/lib/stacked-captions";

const TRACK_CHOICES = [2, 3, 4, 5];
const PRESET_VALUE = "preset";

interface StackedTracksSectionProps {
    /** The selected stacked preset's configuration. */
    config: StackedConfig;
}

/**
 * How many lines, each on its own video track, a stacked preset builds a
 * phrase up to. "Preset" keeps the count the preset was designed with.
 */
export function StackedTracksSection({ config }: StackedTracksSectionProps) {
    const { t } = useTranslation();
    const stackedTracks = useSettingsStore((s) => s.stackedTracks);
    const updateSetting = useSettingsStore((s) => s.updateSetting);

    const presetCount = config.maxLines ?? STACKED_LAYOUT_DEFAULTS.maxLines;
    const value = stackedTracks == null ? PRESET_VALUE : String(stackedTracks);

    return (
        <section className="space-y-1.5">
            <Label className="pl-1 text-xs text-muted-foreground">{t("captions.tracks.label")}</Label>
            <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                className="justify-start"
                value={value}
                onValueChange={(next) => {
                    // Radix clears the value when the selected item is clicked again.
                    if (!next) return;
                    updateSetting("stackedTracks", next === PRESET_VALUE ? null : Number(next));
                }}
            >
                <ToggleGroupItem value={PRESET_VALUE} className="px-2.5 text-xs">
                    {t("captions.tracks.preset", { count: presetCount })}
                </ToggleGroupItem>
                {TRACK_CHOICES.map((count) => (
                    <ToggleGroupItem key={count} value={String(count)} className="px-2.5 text-xs">
                        {count}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
            <p className="pl-1 text-xs text-muted-foreground">{t("captions.tracks.description")}</p>
        </section>
    );
}
