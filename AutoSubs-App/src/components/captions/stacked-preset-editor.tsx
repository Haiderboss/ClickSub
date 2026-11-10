import * as React from "react";
import { ChevronRight, LayoutList, Type } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FusionPresetEditor } from "@/components/captions/fusion-preset-editor";
import { usePresets } from "@/contexts/PresetsContext";
import {
    BLEND_MODES,
    layoutValuesOf,
    roleClipValues,
    stackedConfigOf,
    stackedRoles,
    withLayout,
    withRoleClipValues,
    type BlendMode,
    type RoleClipValues,
    type StackedLayoutValues,
} from "@/lib/stacked-captions";
import type { CaptionPreset } from "@/types";

interface StackedPresetEditorProps {
    preset: CaptionPreset;
    onDone: () => void;
}

type Target = { kind: "layout" } | { kind: "role"; role: string };

/**
 * Editing a stacked preset means editing one part of it: each line style is
 * a full caption look, edited in Fusion like any preset, while the layout
 * (how phrases split into lines and where they sit) belongs to the app.
 */
export function StackedPresetEditor({ preset, onDone }: StackedPresetEditorProps) {
    const { t } = useTranslation();
    const [target, setTarget] = React.useState<Target | null>(null);
    const config = stackedConfigOf(preset.macroSettings) ?? {};

    if (target?.kind === "role") {
        return <FusionPresetEditor preset={preset} role={target.role} onDone={onDone} />;
    }
    if (target?.kind === "layout") {
        return <StackedLayoutForm preset={preset} onDone={onDone} />;
    }

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <h3 className="text-sm font-medium">{t("captions.stacked.chooseTitle")}</h3>
                <p className="text-xs text-muted-foreground">{t("captions.stacked.chooseBody")}</p>
            </div>

            <div className="space-y-2">
                <Item asChild variant="outline" size="sm">
                    <button type="button" className="w-full text-left" onClick={() => setTarget({ kind: "layout" })}>
                        <ItemMedia variant="icon">
                            <LayoutList />
                        </ItemMedia>
                        <ItemContent>
                            <ItemTitle>{t("captions.stacked.layoutTitle")}</ItemTitle>
                            <ItemDescription className="text-xs leading-tight line-clamp-1">
                                {t("captions.stacked.layoutDescription")}
                            </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                            <ChevronRight className="size-4 text-muted-foreground" />
                        </ItemActions>
                    </button>
                </Item>

                {stackedRoles(config).map((role) => (
                    <Item key={role} asChild variant="outline" size="sm">
                        <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => setTarget({ kind: "role", role })}
                        >
                            <ItemMedia variant="icon">
                                <Type />
                            </ItemMedia>
                            <ItemContent>
                                <ItemTitle>{roleLabel(t, role)}</ItemTitle>
                                <ItemDescription className="text-xs leading-tight line-clamp-1">
                                    {t("captions.stacked.styleDescription")}
                                </ItemDescription>
                            </ItemContent>
                            <ItemActions>
                                <ChevronRight className="size-4 text-muted-foreground" />
                            </ItemActions>
                        </button>
                    </Item>
                ))}
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
                {t("captions.preset.action.cancel")}
            </Button>
        </div>
    );
}

/** Display name of a line style, falling back to its key for custom ones. */
function roleLabel(t: (key: string, options?: Record<string, unknown>) => string, role: string) {
    return t(`captions.stacked.role.${role}`, { defaultValue: role });
}

const PERCENT_FIELDS = new Set<keyof StackedLayoutValues>(["overlap", "anchorY"]);

function StackedLayoutForm({ preset, onDone }: StackedPresetEditorProps) {
    const { t } = useTranslation();
    const { updatePreset } = usePresets();
    const config = stackedConfigOf(preset.macroSettings) ?? {};
    const roles = stackedRoles(config);
    const [values, setValues] = React.useState(() => layoutValuesOf(config));
    const [clipValues, setClipValues] = React.useState<Record<string, RoleClipValues>>(() =>
        Object.fromEntries(roles.map((role) => [role, roleClipValues(config, role)])),
    );
    const setClipValue = (role: string, patch: Partial<RoleClipValues>) =>
        setClipValues((v) => ({ ...v, [role]: { ...v[role], ...patch } }));
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // Overlap and height read as percentages, which is how editors think of them.
    const shown = (key: keyof StackedLayoutValues) => {
        const value = values[key] as number;
        return PERCENT_FIELDS.has(key) ? Math.round(value * 100) : value;
    };
    const setNumber = (key: keyof StackedLayoutValues, raw: string) => {
        const value = Number(raw);
        setValues((v) => ({ ...v, [key]: PERCENT_FIELDS.has(key) ? value / 100 : value }));
    };

    async function handleSave() {
        setSaving(true);
        setError(null);
        try {
            const macroSettings = withRoleClipValues(withLayout(preset.macroSettings, values), clipValues);
            await updatePreset(preset.id, { macroSettings });
            onDone();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSaving(false);
        }
    }

    const fields: Array<{ key: keyof StackedLayoutValues; min: number; max: number }> = [
        { key: "maxLines", min: 1, max: 6 },
        { key: "maxWordsPerLine", min: 1, max: 10 },
        { key: "maxCharsPerLine", min: 4, max: 60 },
        { key: "overlap", min: 0, max: 90 },
        { key: "anchorY", min: 0, max: 100 },
    ];

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-medium">{t("captions.stacked.layoutTitle")}</h3>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
                {fields.map(({ key, min, max }) => (
                    <div key={key} className="space-y-1.5">
                        <Label className="text-xs" htmlFor={`stacked-${key}`}>
                            {t(`captions.stacked.field.${key}`)}
                        </Label>
                        <Input
                            id={`stacked-${key}`}
                            type="number"
                            min={min}
                            max={max}
                            value={shown(key)}
                            onChange={(e) => setNumber(key, e.target.value)}
                        />
                    </div>
                ))}
            </div>

            <Item variant="outline" size="sm">
                <ItemContent>
                    <ItemTitle>{t("captions.stacked.field.emphasis")}</ItemTitle>
                    <ItemDescription className="text-xs leading-tight line-clamp-1">
                        {t("captions.stacked.field.emphasisDescription")}
                    </ItemDescription>
                </ItemContent>
                <ItemActions>
                    <Switch
                        checked={values.emphasisEnabled}
                        onCheckedChange={(checked) => setValues((v) => ({ ...v, emphasisEnabled: checked }))}
                    />
                </ItemActions>
            </Item>

            <div className="space-y-2">
                <div className="space-y-0.5">
                    <h4 className="text-xs font-medium">{t("captions.stacked.blendTitle")}</h4>
                    <p className="text-xs text-muted-foreground">{t("captions.stacked.blendDescription")}</p>
                </div>
                {roles.map((role) => (
                    <div key={role} className="grid grid-cols-[1fr_7.5rem_4.5rem] items-center gap-2">
                        <span className="truncate text-xs">{roleLabel(t, role)}</span>
                        <Select
                            value={clipValues[role].blend}
                            onValueChange={(blend) => setClipValue(role, { blend: blend as BlendMode })}
                        >
                            <SelectTrigger
                                className="h-8 bg-background text-xs"
                                aria-label={t("captions.stacked.field.blend")}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {BLEND_MODES.map((mode) => (
                                    <SelectItem key={mode} value={mode}>
                                        {t(`captions.stacked.blend.${mode}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            type="number"
                            className="h-8 text-xs"
                            min={0}
                            max={100}
                            aria-label={t("captions.stacked.field.opacity")}
                            value={clipValues[role].opacity}
                            onChange={(e) => setClipValue(role, { opacity: Number(e.target.value) })}
                        />
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={saving}>
                    {t("captions.preset.action.cancel")}
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving}>
                    {saving ? t("captions.preset.action.saving") : t("captions.preset.action.save")}
                </Button>
            </div>
        </div>
    );
}
