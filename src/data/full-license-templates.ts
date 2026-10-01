import agpl3 from "spdx-license-list/licenses/AGPL-3.0-only.json";
import gpl3 from "spdx-license-list/licenses/GPL-3.0-only.json";
import lgpl3 from "spdx-license-list/licenses/LGPL-3.0-only.json";
import mpl2 from "spdx-license-list/licenses/MPL-2.0.json";
import cc0 from "spdx-license-list/licenses/CC0-1.0.json";

import apache2Text from "./apache-2.0.txt?raw";

// GitHub choosealicense.com: _licenses/apache-2.0.txt (license body only).
export function apacheLicenseText(
  year: string,
  fullname: string,
  includeSpdx: boolean = false,
): string {
  const text = apache2Text.replace(
    "Copyright [yyyy] [name of copyright owner]",
    () => `Copyright ${year} ${fullname}`,
  );
  return includeSpdx ? `SPDX-License-Identifier: Apache-2.0\n\n${text}` : text;
}

export function gnuLicenseText(
  spdx: string,
  text: string,
  year: string,
  fullname: string,
  project: string,
): string {
  const scope = spdx.endsWith("-or-later") ? "version 3 or any later version" : "version 3 only";
  const companion = spdx.startsWith("LGPL-3.0")
    ? `\n\nAccompanying GNU General Public License version 3 (incorporated by LGPL):\n\n${gpl3.licenseText}`
    : "";
  // Keep the official bodies (including instructional examples) verbatim.
  return `SPDX-License-Identifier: ${spdx}\n\n${project || "This work"}\nCopyright (C) ${year} ${fullname}\n\nThis work is licensed under ${spdx} (${scope}).\nThe how-to-apply appendices below are instructional examples, not an additional\nlicensing grant for this work; their later-version examples do not change the\nSPDX choice above.\n\n${text}${companion}\n`;
}

export const fullLicenseTemplates = {
  "Apache-2.0": (year: string, fullname: string): string =>
    apacheLicenseText(year, fullname),
  "GPL-3.0": (year: string, fullname: string, project: string): string =>
    gnuLicenseText("GPL-3.0-only", gpl3.licenseText, year, fullname, project),
  "AGPL-3.0": (year: string, fullname: string, project: string): string =>
    gnuLicenseText("AGPL-3.0-only", agpl3.licenseText, year, fullname, project),
  "LGPL-3.0": (year: string, fullname: string, project: string): string =>
    gnuLicenseText("LGPL-3.0-only", lgpl3.licenseText, year, fullname, project),
  "MPL-2.0": (): string => `${mpl2.licenseText}\n`,
  "CC0-1.0": (): string => `${cc0.licenseText}\n`,
};
