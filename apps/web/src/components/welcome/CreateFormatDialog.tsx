import type { SimpleIcon } from "simple-icons";
import { ToolcraftClickableCard as ClickableCard } from "@openreel/ui";
import {
  ToolcraftDialog as Dialog,
  ToolcraftDialogHeader as DialogHeader,
} from "@openreel/ui";
import {
  ToolcraftLayout as Layout,
  ToolcraftLayoutContent as LayoutContent,
} from "@openreel/ui";
import { PROJECT_FORMATS, type ProjectFormat } from "./project-formats";

const SHAPE_BOX = 56;

function AppIcon({ icon }: { icon: SimpleIcon }) {
  // Black brand marks (TikTok, X) follow the text color so they stay visible in dark mode.
  const fill = icon.hex === "000000" ? "currentColor" : `#${icon.hex}`;
  return (
    <span
      title={icon.title}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg-2 text-fg"
    >
      <svg viewBox="0 0 24 24" width={15} height={15} role="img" aria-label={icon.title}>
        <path d={icon.path} fill={fill} />
      </svg>
    </span>
  );
}

function ShapePreview({ format }: { format: ProjectFormat }) {
  const scale = SHAPE_BOX / Math.max(format.width, format.height);
  return (
    <span className="flex h-14 w-14 items-center justify-center" aria-hidden>
      <span
        className="rounded-md border-2 border-accent bg-accent-soft"
        style={{ width: format.width * scale, height: format.height * scale }}
      />
    </span>
  );
}

export function CreateFormatDialog({
  isOpen,
  onClose,
  onPick,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPick: (format: ProjectFormat) => void;
}) {
  if (!isOpen) return null;
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      width={640}
      purpose="form"
      className="rounded-xl"
    >
      <Layout
        header={
          <DialogHeader
            title="Create a format"
            subtitle="Pick a shape. Quality, frame rate and bitrate are set when you export."
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent className="grid grid-cols-2 gap-3 p-5">
            {PROJECT_FORMATS.map((format) => (
              <ClickableCard
                key={format.id}
                label={`${format.label} ${format.ratio}`}
                onClick={() => onPick(format)}
                padding={4}
              >
                <div className="flex items-center gap-4">
                  <ShapePreview format={format} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-fg">{format.label}</p>
                    <p className="text-[12px] text-fg-muted">{format.ratio}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {format.apps.map((icon) => (
                        <AppIcon key={icon.slug} icon={icon} />
                      ))}
                    </div>
                  </div>
                </div>
              </ClickableCard>
            ))}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
