/** Install link for the Atlas Chrome extension (Web Store or GitHub fallback). */
export const CHROME_EXTENSION_INSTALL_URL =
  process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL?.trim() ||
  "https://github.com/kshamiyah/portfolioiq-extension";
