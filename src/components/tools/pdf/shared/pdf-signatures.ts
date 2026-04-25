// Detects digital and BIR e-signatures embedded in a PDF.
// Used by the shared dropzone so every PDF tab can show signature info
// and warn before destructive operations.

export interface DetectedSignature {
  source: "digital" | "bir";
  signerName: string;
  signerEmail: string;
  signDate: string;
  signReason: string;
  location: string;
  tool: string;
  filter: string;
  subFilter: string;
  fieldName: string;
  hasCryptoData: boolean;
  storedHash: string;
}

const META_PREFIX = "BIR_ESIGN";
export const META_SIGNER_NAME = `${META_PREFIX}_SignerName`;
export const META_SIGNER_EMAIL = `${META_PREFIX}_SignerEmail`;
export const META_SIGN_DATE = `${META_PREFIX}_SignDate`;
export const META_SIGN_REASON = `${META_PREFIX}_SignReason`;
export const META_TOOL = `${META_PREFIX}_Tool`;
export const META_HASH = `${META_PREFIX}_IntegrityHash`;

function readDictStr(dict: any, key: string, PDFStringCls: any, PDFHexStringCls: any, PDFNameCls: any): string {
  try {
    const val = dict.lookupMaybe(PDFNameCls.of(key), PDFStringCls, PDFHexStringCls);
    if (val) return val.decodeText();
  } catch {
    // ignore
  }
  return "";
}

function readDictName(dict: any, key: string, PDFNameCls: any): string {
  try {
    const val = dict.lookupMaybe(PDFNameCls.of(key), PDFNameCls);
    if (val) return val.decodeText();
  } catch {
    // ignore
  }
  return "";
}

function parsePdfDate(pdfDate: string): string {
  if (!pdfDate) return "";
  const m = pdfDate.match(
    /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+-])?(\d{2})?'?(\d{2})?'?$/,
  );
  if (!m) return pdfDate;
  const [, yr, mo, dy, hh, mm, ss, tz, tzH, tzM] = m;
  const iso = `${yr}-${mo ?? "01"}-${dy ?? "01"}T${hh ?? "00"}:${mm ?? "00"}:${ss ?? "00"}`;
  if (tz === "Z" || !tz) return new Date(iso + "Z").toISOString();
  return new Date(`${iso}${tz}${tzH ?? "00"}:${tzM ?? "00"}`).toISOString();
}

function detectSigningTool(
  sigDict: any,
  PDFNameCls: any,
  PDFStringCls: any,
  PDFHexStringCls: any,
  PDFDictCls: any,
): string {
  try {
    const propBuild = sigDict.lookupMaybe(PDFNameCls.of("Prop_Build"), PDFDictCls);
    if (propBuild) {
      const app = propBuild.lookupMaybe(PDFNameCls.of("App"), PDFDictCls);
      if (app) {
        const appName =
          readDictStr(app, "Name", PDFStringCls, PDFHexStringCls, PDFNameCls) ||
          readDictName(app, "Name", PDFNameCls);
        if (appName) {
          if (/adobe|acrobat/i.test(appName)) return "Adobe Acrobat";
          if (/docusign/i.test(appName)) return "DocuSign";
          if (/hellosign|dropbox/i.test(appName)) return "HelloSign (Dropbox Sign)";
          if (/pandadoc/i.test(appName)) return "PandaDoc";
          if (/signow/i.test(appName)) return "signNow";
          return appName;
        }
      }
    }
  } catch {
    // ignore
  }

  const name = readDictStr(sigDict, "Name", PDFStringCls, PDFHexStringCls, PDFNameCls);
  const reason = readDictStr(sigDict, "Reason", PDFStringCls, PDFHexStringCls, PDFNameCls);
  const combined = `${name} ${reason}`;
  if (/docusign/i.test(combined)) return "DocuSign";
  if (/hellosign/i.test(combined)) return "HelloSign (Dropbox Sign)";
  if (/adobe/i.test(combined)) return "Adobe Acrobat";
  if (/pandadoc/i.test(combined)) return "PandaDoc";

  const filter = readDictName(sigDict, "Filter", PDFNameCls);
  if (filter === "Adobe.PPKLite") return "Adobe-compatible signer";
  if (filter === "Adobe.PPKMS") return "Adobe (Windows Certificate Store)";
  if (filter === "Entrust.PPKEF") return "Entrust";

  return "";
}

export async function detectSignatures(pdfBytes: Uint8Array): Promise<DetectedSignature[]> {
  const detected: DetectedSignature[] = [];
  try {
    const { PDFDocument, PDFName, PDFString, PDFHexString, PDFDict } = await import("pdf-lib");
    const doc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });

    // Digital signatures (/Sig form fields)
    try {
      const form = doc.getForm();
      const fields = form.getFields();
      for (const field of fields) {
        const ftRaw =
          field.acroField.dict.get(PDFName.of("FT")) ??
          (field.acroField as any).getInheritableAttribute?.(PDFName.of("FT"));
        const ft = doc.context.lookupMaybe(ftRaw, PDFName);
        if (ft?.decodeText() !== "Sig") continue;

        const vObj = field.acroField.V();
        if (!(vObj instanceof PDFDict)) continue;

        const sigDict = vObj;
        const signerName = readDictStr(sigDict, "Name", PDFString, PDFHexString, PDFName);
        const reason = readDictStr(sigDict, "Reason", PDFString, PDFHexString, PDFName);
        const location = readDictStr(sigDict, "Location", PDFString, PDFHexString, PDFName);
        const contactInfo = readDictStr(sigDict, "ContactInfo", PDFString, PDFHexString, PDFName);
        const dateRaw = readDictStr(sigDict, "M", PDFString, PDFHexString, PDFName);
        const filter = readDictName(sigDict, "Filter", PDFName);
        const subFilter = readDictName(sigDict, "SubFilter", PDFName);
        const contentsRaw = sigDict.get(PDFName.of("Contents"));
        const hasCryptoData = contentsRaw instanceof PDFHexString && contentsRaw.asBytes().length > 0;
        const tool = detectSigningTool(sigDict, PDFName, PDFString, PDFHexString, PDFDict);

        detected.push({
          source: "digital",
          signerName,
          signerEmail: contactInfo,
          signDate: parsePdfDate(dateRaw),
          signReason: reason,
          location,
          tool,
          filter,
          subFilter,
          fieldName: field.getName(),
          hasCryptoData,
          storedHash: "",
        });
      }
    } catch {
      // PDF may not have forms
    }

    // BIR e-signature metadata
    try {
      const infoRef = doc.context.trailerInfo.Info;
      if (infoRef) {
        const infoDict = doc.context.lookup(infoRef);
        if (infoDict instanceof PDFDict) {
          const birName = readDictStr(infoDict, META_SIGNER_NAME, PDFString, PDFHexString, PDFName);
          const birTool = readDictStr(infoDict, META_TOOL, PDFString, PDFHexString, PDFName);
          if (birName || birTool) {
            detected.push({
              source: "bir",
              signerName: birName,
              signerEmail: readDictStr(infoDict, META_SIGNER_EMAIL, PDFString, PDFHexString, PDFName),
              signDate: readDictStr(infoDict, META_SIGN_DATE, PDFString, PDFHexString, PDFName),
              signReason: readDictStr(infoDict, META_SIGN_REASON, PDFString, PDFHexString, PDFName),
              location: "",
              tool: birTool || "BIR PDF Sign Tool",
              filter: "",
              subFilter: "",
              fieldName: "",
              hasCryptoData: false,
              storedHash: readDictStr(infoDict, META_HASH, PDFString, PDFHexString, PDFName),
            });
          }
        }
      }
    } catch {
      // ignore
    }
  } catch {
    return [];
  }
  return detected;
}
