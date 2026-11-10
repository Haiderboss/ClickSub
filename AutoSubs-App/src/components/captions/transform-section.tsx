import * as React from "react";
import { Loader, Move, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { applyTransformToTimeline } from "@/api/resolve-api";
import { useSettingsStore } from "@/stores/settings-store";
import {
    DEFAULT_CAPTION_TRANSFORM,
    TRANSFORM_RANGES,
    clampTransform,
    isDefaultTransform,
    type CaptionTransform,
} from "@/lib/caption-transform";

const FIELDS: Array<keyof CaptionTransform> = ["scale", "x", "y"];

/**
 * One size and position for every caption: new captions are placed with it,
 * and letting go of a slider (or the button) moves every ClickSub caption
 * already on the timeline.
 */
export function TransformSection() {
    const { t } = useTranslation();
    const transform = useSettingsStore((s) => s.captionTransform);
    const updateSetting = useSettingsStore((s) => s.updateSetting);
    const [applying, setApplying] = React.useState(false);

    const set = (patch: Partial<CaptionTransform>) =>
        updateSetting("captionTransform", clampTransform({ ...transform, ...patch }));

    /** `quiet` skips the success toast, for the apply that follows each slider drag. */
    async function apply(next: CaptionTransform, quiet = false) {
        setApplying(true);
        try {
            const result = await applyTransformToTimeline(clampTransform(next));
            if (result.matched === 0) {
                if (!quiet) toast.warning(t("captions.transform.noMatches"));
            } else if (result.failed > 0) {
                toast.warning(t("captions.transform.partial", { updated: result.updated, failed: result.failed }));
            } else if (!quiet) {
                toast.success(t("captions.transform.success", { count: result.updated }));
            }
        } catch (err) {
            console.error("Failed to resize captions:", err);
            toast.error(t("captions.transform.failed"));
        } finally {
            setApplying(false);
        }
    }

    return (
        <section className="space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 pl-1">
                    <Label className="text-xs text-muted-foreground">{t("captions.transform.label")}</Label>
                    <p className="text-xs text-muted-foreground">{t("captions.transform.description")}</p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    disabled={isDefaultTransform(transform)}
                    onClick={() => {
                        updateSetting("captionTransform", DEFAULT_CAPTION_TRANSFORM);
                        void apply(DEFAULT_CAPTION_TRANSFORM, true);
                    }}
                >
                    <RotateCcw className="size-3.5" />
                    {t("captions.transform.reset")}
                </Button>
            </div>

            {FIELDS.map((field) => (
                <div key={field} className="space-y-1.5 px-1">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{t(`captions.transform.${field}`)}</span>
                        <span className="tabular-nums">{Math.round(transform[field])}%</span>
                    </div>
                    <Slider
                        min={TRANSFORM_RANGES[field].min}
                        max={TRANSFORM_RANGES[field].max}
                        step={1}
                        value={[transform[field]]}
                        onValueChange={([value]) => set({ [field]: value })}
                        onValueCommit={([value]) => void apply({ ...transform, [field]: value }, true)}
                        aria-label={t(`captions.transform.${field}`)}
                    />
                </div>
            ))}

            <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={applying}
                onClick={() => void apply(transform)}
            >
                {applying ? (
                    <Loader className="size-4 animate-spin will-change-transform" />
                ) : (
                    <Move className="size-4" />
                )}
                {applying ? t("captions.transform.applying") : t("captions.transform.apply")}
            </Button>
        </section>
    );
}
