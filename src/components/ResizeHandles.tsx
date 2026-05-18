import { getCurrentWindow } from "@tauri-apps/api/window";

type ResizeDirection = "North" | "South" | "East" | "West" | "NorthWest" | "NorthEast" | "SouthWest" | "SouthEast";

const appWindow = getCurrentWindow();

type Props = {
  sidebarOpen: boolean;
  sidebarWidth: number;
};

export default function ResizeHandles(props: Props) {
  const handle = (dir: ResizeDirection) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    appWindow.startResizeDragging(dir);
  };

  const westLeft = props.sidebarOpen ? props.sidebarWidth : 0;

  return (
    <>
      <div
        onMouseDown={handle("North")}
        class="absolute top-0 left-24 right-28 h-2 cursor-n-resize z-40"
      />
      <div onMouseDown={handle("South")} class="absolute bottom-0 left-3 right-3 h-2 cursor-s-resize z-40" />
      <div
        onMouseDown={handle("West")}
        class="absolute top-12 bottom-3 w-2 cursor-w-resize z-40"
        style={{ left: `${westLeft}px` }}
      />
      <div onMouseDown={handle("East")} class="absolute right-0 top-3 bottom-3 w-2 cursor-e-resize z-40" />
      <div onMouseDown={handle("NorthWest")} class="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-40" />
      <div onMouseDown={handle("NorthEast")} class="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-40" />
      <div
        onMouseDown={handle("SouthWest")}
        class="absolute bottom-0 w-3 h-3 cursor-sw-resize z-40"
        style={{ left: `${westLeft}px` }}
      />
      <div onMouseDown={handle("SouthEast")} class="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-40" />
    </>
  );
}
