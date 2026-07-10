import QRCode from "qrcode";

// Generates a high-resolution QR code as a PNG data URL so it stays crisp when
// printed on the card. Transparent margin is kept minimal.
export async function generateQrDataUrl(
  data: string,
  fg = "#000000",
  bg = "#ffffff",
): Promise<string> {
  return QRCode.toDataURL(data || " ", {
    margin: 1,
    width: 512,
    errorCorrectionLevel: "M",
    color: { dark: fg, light: bg },
  });
}
