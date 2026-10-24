import React from "react";
import { Settings } from "@/icons/lucide-compat";
import { ToolcraftDialog as Dialog, ToolcraftDialogHeader as DialogHeader } from "@openreel/ui";
import { ToolcraftLayout as Layout, ToolcraftLayoutContent as LayoutContent } from "@openreel/ui";
import { useSettingsStore } from "../../../stores/settings-store";
import { GeneralPanel } from "./GeneralPanel";

export const SettingsDialog: React.FC = () => {
  const { settingsOpen, closeSettings } = useSettingsStore();

  return (
    <Dialog
      isOpen={settingsOpen}
      onOpenChange={(open) => !open && closeSettings()}
      width={640}
      purpose="form"
    >
      <Layout
        header={
          <DialogHeader
            title="Settings"
            subtitle="Appearance, saving, playback, timeline and keyboard."
            onOpenChange={(open) => !open && closeSettings()}
            startContent={<Settings size={18} className="text-primary" aria-hidden />}
          />
        }
        content={
          <LayoutContent className="max-h-[70vh] overflow-y-auto">
            <GeneralPanel />
          </LayoutContent>
        }
      />
    </Dialog>
  );
};
