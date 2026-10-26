export interface DevicePreset {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly kind: "phone" | "tablet" | "desktop" | "fill";
}

/** PG-07 device presets (CSS pixels). */
export const DEVICES: readonly DevicePreset[] = [
  { id: "iphone-se", label: "iPhone SE", width: 375, height: 667, kind: "phone" },
  { id: "iphone-15", label: "iPhone 15", width: 393, height: 852, kind: "phone" },
  { id: "pixel-7", label: "Pixel 7", width: 412, height: 915, kind: "phone" },
  { id: "ipad", label: "iPad", width: 768, height: 1024, kind: "tablet" },
  { id: "ipad-landscape", label: "iPad landscape", width: 1024, height: 768, kind: "tablet" },
  { id: "laptop", label: "Laptop", width: 1280, height: 800, kind: "desktop" },
  { id: "desktop", label: "Desktop", width: 1440, height: 900, kind: "desktop" },
  { id: "fill", label: "Fill", width: 0, height: 0, kind: "fill" },
];

export const findDevice = (id: string): DevicePreset =>
  DEVICES.find((device) => device.id === id) ?? (DEVICES[1] as DevicePreset);
