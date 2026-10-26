import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PhoneExportScreen, type PhoneExportStatus } from "./PhoneExportScreen";

const show = (status: PhoneExportStatus, progress = 0) =>
  render(
    <PhoneExportScreen
      status={status}
      progress={progress}
      label="2K"
      aspect={9 / 16}
      name="My video"
      onName={() => {}}
      onBack={() => {}}
      onDone={() => {}}
      onNewProject={() => {}}
      onExportOptions={() => {}}
    />,
  );

describe("PhoneExportScreen", () => {
  afterEach(cleanup);

  it("doesn't claim to be exporting while the video is being named", () => {
    show("naming");
    expect(screen.getByRole("heading", { name: "Ready to export in 2K" })).toBeInTheDocument();
    expect(screen.queryByText(/Exporting in/)).toBeNull();
    expect(screen.queryByText("0.0%")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Name your video" })).toBeInTheDocument();
  });

  it("counts up once the export starts", () => {
    show("exporting", 42);
    expect(screen.getByRole("heading", { name: "Exporting in 2K..." })).toBeInTheDocument();
    expect(screen.getByText("42.0%")).toBeInTheDocument();
  });
});
