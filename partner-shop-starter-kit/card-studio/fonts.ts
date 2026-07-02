// Web-safe font families. These render reliably on the canvas without needing to
// load external font files (which would otherwise cause blank/late text on export).
export const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Arial", value: "Arial" },
  { label: "Helvetica", value: "Helvetica" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times", value: "Times New Roman" },
  { label: "Courier", value: "Courier New" },
  { label: "Verdana", value: "Verdana" },
  { label: "Trebuchet", value: "Trebuchet MS" },
  { label: "Tahoma", value: "Tahoma" },
  { label: "Impact", value: "Impact" },
  { label: "Comic Sans", value: "Comic Sans MS" },
  { label: "Brush Script", value: "Brush Script MT" },
];
