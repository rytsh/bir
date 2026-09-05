import afl3 from "spdx-license-list/licenses/AFL-3.0.json";
import agpl3Only from "spdx-license-list/licenses/AGPL-3.0-only.json";
import agpl3Later from "spdx-license-list/licenses/AGPL-3.0-or-later.json";
import apache11 from "spdx-license-list/licenses/Apache-1.1.json";
import artistic2 from "spdx-license-list/licenses/Artistic-2.0.json";
import bsd1 from "spdx-license-list/licenses/BSD-1-Clause.json";
import bsd2Patent from "spdx-license-list/licenses/BSD-2-Clause-Patent.json";
import bsd2Views from "spdx-license-list/licenses/BSD-2-Clause-Views.json";
import bsd3Clear from "spdx-license-list/licenses/BSD-3-Clause-Clear.json";
import bsd3Lbnl from "spdx-license-list/licenses/BSD-3-Clause-LBNL.json";
import bsd3OpenMpi from "spdx-license-list/licenses/BSD-3-Clause-Open-MPI.json";
import bsd4 from "spdx-license-list/licenses/BSD-4-Clause.json";
import bsd4Uc from "spdx-license-list/licenses/BSD-4-Clause-UC.json";
import blueOak from "spdx-license-list/licenses/BlueOak-1.0.0.json";
import ccBy3 from "spdx-license-list/licenses/CC-BY-3.0.json";
import ccBy4 from "spdx-license-list/licenses/CC-BY-4.0.json";
import ccBySa3 from "spdx-license-list/licenses/CC-BY-SA-3.0.json";
import ccBySa4 from "spdx-license-list/licenses/CC-BY-SA-4.0.json";
import cecill from "spdx-license-list/licenses/CECILL-2.1.json";
import epl1 from "spdx-license-list/licenses/EPL-1.0.json";
import epl2 from "spdx-license-list/licenses/EPL-2.0.json";
import eupl11 from "spdx-license-list/licenses/EUPL-1.1.json";
import eupl12 from "spdx-license-list/licenses/EUPL-1.2.json";
import gpl2 from "spdx-license-list/licenses/GPL-2.0.json";
import gpl2Only from "spdx-license-list/licenses/GPL-2.0-only.json";
import gpl2Later from "spdx-license-list/licenses/GPL-2.0-or-later.json";
import gpl3Only from "spdx-license-list/licenses/GPL-3.0-only.json";
import gpl3Later from "spdx-license-list/licenses/GPL-3.0-or-later.json";
import hpnd from "spdx-license-list/licenses/HPND.json";
import icu from "spdx-license-list/licenses/ICU.json";
import lgpl21 from "spdx-license-list/licenses/LGPL-2.1.json";
import lgpl21Later from "spdx-license-list/licenses/LGPL-2.1-or-later.json";
import lgpl3Later from "spdx-license-list/licenses/LGPL-3.0-or-later.json";
import mit0 from "spdx-license-list/licenses/MIT-0.json";
import mpl2NoException from "spdx-license-list/licenses/MPL-2.0-no-copyleft-exception.json";
import mulan from "spdx-license-list/licenses/MulanPSL-2.0.json";
import ncsa from "spdx-license-list/licenses/NCSA.json";
import nistPd from "spdx-license-list/licenses/NIST-PD.json";
import nistPdFallback from "spdx-license-list/licenses/NIST-PD-fallback.json";
import osl3 from "spdx-license-list/licenses/OSL-3.0.json";
import openssl from "spdx-license-list/licenses/OpenSSL.json";
import postgresql from "spdx-license-list/licenses/PostgreSQL.json";
import python2 from "spdx-license-list/licenses/Python-2.0.json";
import upl1 from "spdx-license-list/licenses/UPL-1.0.json";
import zlib from "spdx-license-list/licenses/Zlib.json";
import { gnuLicenseText } from "./full-license-templates.ts";

interface SpdxLicense {
  name: string;
  licenseText: string;
}

// Import only the requested additions, rather than bundling the entire SPDX list.
const texts: Record<string, SpdxLicense> = {
  "AFL-3.0": afl3,
  "AGPL-3.0-only": agpl3Only,
  "AGPL-3.0-or-later": agpl3Later,
  "Apache-1.1": apache11,
  "Artistic-2.0": artistic2,
  "BSD-1-Clause": bsd1,
  "BSD-2-Clause-Patent": bsd2Patent,
  "BSD-2-Clause-Views": bsd2Views,
  "BSD-3-Clause-Clear": bsd3Clear,
  "BSD-3-Clause-LBNL": bsd3Lbnl,
  "BSD-3-Clause-Open-MPI": bsd3OpenMpi,
  "BSD-4-Clause": bsd4,
  "BSD-4-Clause-UC": bsd4Uc,
  "BlueOak-1.0.0": blueOak,
  "CC-BY-3.0": ccBy3,
  "CC-BY-4.0": ccBy4,
  "CC-BY-SA-3.0": ccBySa3,
  "CC-BY-SA-4.0": ccBySa4,
  "CECILL-2.1": cecill,
  "EPL-1.0": epl1,
  "EPL-2.0": epl2,
  "EUPL-1.1": eupl11,
  "EUPL-1.2": eupl12,
  "GPL-2.0": gpl2,
  "GPL-2.0-only": gpl2Only,
  "GPL-2.0-or-later": gpl2Later,
  "GPL-3.0-only": gpl3Only,
  "GPL-3.0-or-later": gpl3Later,
  HPND: hpnd,
  ICU: icu,
  "LGPL-2.1": lgpl21,
  "LGPL-2.1-or-later": lgpl21Later,
  "LGPL-3.0-or-later": lgpl3Later,
  "MIT-0": mit0,
  "MPL-2.0-no-copyleft-exception": mpl2NoException,
  "MulanPSL-2.0": mulan,
  NCSA: ncsa,
  "NIST-PD": nistPd,
  "NIST-PD-fallback": nistPdFallback,
  "OSL-3.0": osl3,
  OpenSSL: openssl,
  PostgreSQL: postgresql,
  "Python-2.0": python2,
  "UPL-1.0": upl1,
  Zlib: zlib,
};

export const additionalLicenses = Object.entries(texts).map(([spdx, license]) => ({
  id: spdx.toLowerCase(),
  name: license.name,
  spdx,
  description: "Full SPDX license text. Year and holder replace explicit template placeholders where available; existing attribution is preserved. Review remaining placeholders and applicability before use. No permissions, conditions, or limitations summary is provided.",
  permissions: [],
  conditions: [],
  limitations: [],
  needsProject: spdx === "LGPL-3.0-or-later",
  hasSummary: false,
  template: (year: string, fullname: string, project: string = ""): string => {
    if (spdx === "LGPL-3.0-or-later") {
      return gnuLicenseText(spdx, license.licenseText, year, fullname, project);
    }
    // Never replace historical names/dates or the license publisher's copyright.
    const text = license.licenseText.replace(
      /<YEAR>|<year>|\[year\]|<COPYRIGHT HOLDER>|<copyright holders>|<copyright holder>|\[fullname\]|<name of author>/g,
      (placeholder) => /year/i.test(placeholder) ? year : fullname,
    );
    // GNU variants share license bodies; retain the precise licensing choice.
    return `SPDX-License-Identifier: ${spdx}\n\n${text}\n`;
  },
}));
