import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import axios from 'axios';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import * as pkcs11js from 'pkcs11js'; // smart-card driver
import * as asn1js from 'asn1js';     // v2
import * as pkijs from 'pkijs';      // v2
import { createHash } from 'crypto';
import { Settings } from '../globals';

/* █████████████████ SETTINGS █████████████████ */
export function loadSettings(): Settings {
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(process.cwd(), 'src/renderer/assets');

  const settingsPath = path.join(baseDir, 'sign-settings.json');
  if (!fs.existsSync(settingsPath)) {
    throw new Error(`sign-settings.json non trovato in ${settingsPath}`);
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(raw) as Settings;
  } catch (err) {
    throw new Error(`Errore lettura/parsing sign-settings.json: ${err}`);
  }
}

/* █████████████████ LOG █████████████████ */
function log(msg: string) {
  const dir  = path.join(app.getPath('userData'), 'signlog');
  const file = path.join(dir, `${new Date().toISOString().slice(0,10)}.log`);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  try {
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

/* █████████████████ PUBLIC API █████████████████ */
export interface SignPdfRequest {
  pdfBase64 : string;
  companyId?: string;
  footerText?: string;
  pin?: string;             // se firma locale
  useRemote?: boolean;
  otpCode?: string;         // se firma remota
  userCN?: string; // opzionale, per filtrare per CN
}
export interface SignPdfResponse {
  signedPdfBase64: string; // PDF estetico (non firmato)
  p7mBase64      : string;  // CMS CAdES‑BES + TSA
}

/* ████████████████ MAIN SERVICE ████████████████ */
export async function signPdfService(req: SignPdfRequest): Promise<SignPdfResponse> {
  const currentSettings = loadSettings();

  try {
    log('start');

    // 1. Decora PDF con logo/footer (senza dicitura CN)
    let pdfBuf = Buffer.from(req.pdfBase64, 'base64');
    pdfBuf = await decoratePdf(pdfBuf, req, currentSettings);

    // 2. Firma digitale
    let signedBy = "";
    let cmsBuf: Buffer;
    if (req.useRemote) {
      cmsBuf = await signViaRemote(req, pdfBuf, currentSettings);
      signedBy = "Operatore autorizzato"; // O estrai dal payload della risposta remota se disponibile!
    } else {
        const result = await signViaPkcs11WithCN(pdfBuf, req.pin ?? '', currentSettings, req.userCN);
        cmsBuf = result.cmsBuf;
        signedBy = result.signedBy || "Operatore autorizzato";
      }

    // 3. Aggiungi dicitura del firmatario nell'ultima pagina del PDF
    pdfBuf = await addSignatureNotice(pdfBuf, signedBy, currentSettings);

    // 4. Marca temporale
    const tspBuf = await timestampCms(cmsBuf, currentSettings);

    log('success');
    return {
      signedPdfBase64: pdfBuf.toString('base64'),
      p7mBase64:       tspBuf.toString('base64')
    };
  }
  catch(e:any){
    log('ERROR '+e.stack || e.message || e);
    throw new Error(`Errore durante la firma del PDF: ${e.message || e}`);
  }
}

/* ██████ DECORATE PDF (logo, footer, ecc.) ██████ */
async function coverFooterWithWhite(doc: PDFDocument, footerHeight: number) {
  const pages = doc.getPages();
  for (const page of pages) {
    const { width } = page.getSize();
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: footerHeight,
      color: rgb(1, 1, 1),
      opacity: 1
    });
  }
}

// PROMISE-WRAP per fs.readFile
function readFileAsync(path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function decoratePdf(pdf: Buffer, req: SignPdfRequest, settings: Settings) {
  const doc = await PDFDocument.load(pdf);

  // Embedding font
  const font = await embedFont(doc, settings.footerTextFontFamily);

  const {
    logoPath, footerImgPath, footerTextDefault
  } = getCompanyAssets(req.companyId);

  const [logoBytes, footBytes] = await Promise.all([
    readFileAsync(logoPath),
    readFileAsync(footerImgPath)
  ]);
  const logoImg = await doc.embedPng(logoBytes);
  const footImg = await doc.embedPng(footBytes);

  const footerTxt = req.footerText ?? footerTextDefault;

  const {
    yPosLogo, logoWidth, logoHeight,
    yPosFooterImage, footerImageWidth, footerImageHeight, footerImageXPositionOffset,
    footerTextFontFamily, footerTextPointFromBottom, footerCompanyDataPointFromBottom,   footerCompanyDataMultiline, footerTextFontSize
  } = settings;

  const pages = doc.getPages();
  if (pages.length === 0) throw new Error("PDF senza pagine effettive!");

  // 1. Copertura bianca
  await coverFooterWithWhite(doc, 30);

  // 2. Manipolazioni pagine
  for (const p of pages) {
    const { width: pageWidth, height: pageHeight } = p.getSize();

    // Draw dati azienda (footerText)
    const textW = font.widthOfTextAtSize(footerTxt, footerTextFontSize);
    const textX = (pageWidth - textW) / 2;

    // Dati azienda: usa footerCompanyDataPointFromBottom
    const textY = footerCompanyDataPointFromBottom;
    p.drawText(footerTxt, {
      x: textX,
      y: textY,
      size: footerTextFontSize,
      font: font,
      color: rgb(0, 0, 0)
    });

    // Header logo
    const logoX = (pageWidth - logoWidth) / 2.0;
    const logoY = pageHeight - logoHeight - yPosLogo;
    p.drawImage(logoImg, {
      x: logoX,
      y: logoY,
      width: logoWidth,
      height: logoHeight
    });

    // Footer image
    let footerX = (pageWidth - footerImageWidth) / 2.0 + (footerImageXPositionOffset || 0);
    let footerY = yPosFooterImage;
    if (footerY > pageHeight) footerY = 10;
    p.drawImage(footImg, {
      x: footerX,
      y: footerY,
      width: footerImageWidth,
      height: footerImageHeight
    });
  }

  return Buffer.from(await doc.save());
}

/* ██████ AGGIUNGI DICITURA CN ULTIMA PAGINA ██████ */
async function addSignatureNotice(pdfBuf: Buffer, signedBy: string, settings: Settings): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBuf);
  const font = await embedFont(doc, settings.footerTextFontFamily);

  const pages = doc.getPages();
  if (!pages.length) return pdfBuf;
  const lastPage = pages[pages.length - 1];
  const { width } = lastPage.getSize();

  const now = new Date();

  // Esempio: settings.footerCompanyDataMultiline è booleano (true = multilinea, false = una riga)
  if (signedBy.includes('NZDMHL80H26H501J')) {
    signedBy = "Dr. Anzidei Michele";
  }
  const digitalNoteLines = [
    "Referto firmato digitalmente ai sensi degli art. 20, 21 n.2, 23 e 24 del d.Lgs. n.82 del 7.3.2015 e successive modifiche da: ",
    signedBy + " in data: " + now.toLocaleString()
  ];
  let lines;
  if (settings.footerCompanyDataMultiline) {
    lines = digitalNoteLines;      // 2 righe
  } else {
    lines = [digitalNoteLines.join(' ')]; // 1 riga
  }

  // — La stringa lines[0] è *una riga sola*!
  // Se la vedi spezzata nel PDF è solo un problema di spazio e font size.

  let baseY = settings.footerTextPointFromBottom;
  for (const line of lines.reverse()) {
    const w = font.widthOfTextAtSize(line, 8); // o 7, o 6
    const x = (width - w) / 2;
    lastPage.drawText(line, {
      x, y: baseY,
      size: 8, // diminuisci se serve
      font,
      color: rgb(0, 0, 0)
    });
    baseY += 10;
  }
  return Buffer.from(await doc.save());
}

/* ██████ GESTIONE ASSET E FONT ██████ */
function getCompanyAssets(companyId?: string) {
    const base = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'Images')
      : path.join(process.cwd(), 'src/renderer/assets/Images');
    switch ((companyId ?? '').trim().toUpperCase()) {
    case 'ASTER':
      return {
        logoPath: path.join(base, 'LogoAster.png'),
        footerImgPath: path.join(base, 'FooterAster.png'),
        footerTextDefault: 'Aster Diagnostica Srl - P.I. e C.F. 06191121000'
      };
    case 'RAD':
      return {
        logoPath: path.join(base, 'LogoAster.png'),
        footerImgPath: path.join(base, 'FooterAster.png'),
        footerTextDefault: 'Radiologia Mostacciano Srl - P.I. 01321781005 - C.F. 04891080584'
      };
    case 'HEALTHWAY':
      return {
        logoPath: path.join(base, 'LogoAster.png'),
        footerImgPath: path.join(base, 'FooterHW.png'),
        footerTextDefault: 'Aster Diagnostica Mezzocammino Srl - P. I. e C.F. 12622721004'
      };
    case 'CIN':
      return {
        logoPath: path.join(base, 'LogoAster.png'),
        footerImgPath: path.join(base, 'FooterCin.png'),
        footerTextDefault: 'Radiologia Mostacciano Srl - P.I. 01321781005 - C.F. 04891080584'
      };
    default:
      return {
        logoPath: path.join(base, 'LogoAster.png'),
        footerImgPath: path.join(base, 'FooterAster.png'),
        footerTextDefault: 'Aster Diagnostica Srl - P.I. 06191121000'
      };
  }
}

async function embedFont(doc: PDFDocument, fontFamily: string): Promise<PDFFont> {
  // Mappa nomi config → file
  const fontMap: Record<string, string> = {
    "Times New Roman": "Times New Roman.ttf",
    "Arial": "Arial.ttf"
  };
  const fontFile = fontMap[fontFamily] || fontMap["Times New Roman"];
  const ttfPath = path.join(process.resourcesPath, 'assets', 'Fonts', fontFile);
  try {
    const fontBytes = await readFileAsync(ttfPath);
    return await doc.embedFont(fontBytes);
  } catch (err) {
    return await doc.embedFont(StandardFonts.TimesRoman);
  }
}

  /* ██████ FIRMA LOCALE SMARTCARD + CN ██████ */
export async function signViaPkcs11WithCN(
  data: Buffer,
  pin: string,
  settings: any,
  userCN?: string
): Promise<{ cmsBuf: Buffer, signedBy: string }> {
  const pkcs11 = new pkcs11js.PKCS11();
  pkcs11.load(settings.pkcs11Lib);
  pkcs11.C_Initialize();

  let result: { cmsBuf: Buffer, signedBy: string } | null = null;

  try {
    // Cicla su tutti gli slot con token inserito
    for (const slot of pkcs11.C_GetSlotList(true)) {
      let sess: pkcs11js.Handle | null = null;
      try {
        sess = pkcs11.C_OpenSession(
          slot,
          pkcs11js.CKF_SERIAL_SESSION | pkcs11js.CKF_RW_SESSION
        );
        pkcs11.C_Login(sess, pkcs11js.CKU_USER, pin);

        // Cerca il certificato X.509
        pkcs11.C_FindObjectsInit(sess, [
          { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_CERTIFICATE },
          { type: pkcs11js.CKA_CERTIFICATE_TYPE, value: pkcs11js.CKC_X_509 }
        ]);
        const certHandles = pkcs11.C_FindObjects(sess, 20) as pkcs11js.Handle[]; // Fino a 20 cert

        pkcs11.C_FindObjectsFinal(sess);

        for (const hCert of certHandles) {
          // Ottieni ID del certificato
          const [{ value: certId }] = pkcs11.C_GetAttributeValue(sess, hCert, [
            { type: pkcs11js.CKA_ID }
          ]);

          // Cerca la chiave privata corrispondente
          pkcs11.C_FindObjectsInit(sess, [
            { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY },
            { type: pkcs11js.CKA_ID, value: certId }
          ]);
          const [privKey] = pkcs11.C_FindObjects(sess, 1) as pkcs11js.Handle[];
          pkcs11.C_FindObjectsFinal(sess);

          if (!privKey) continue;

          // Estrai il certificato in formato DER
          const [{ value: certRaw }] = pkcs11.C_GetAttributeValue(sess, hCert, [
            { type: pkcs11js.CKA_VALUE }
          ]);
          const certRawBuf = Buffer.isBuffer(certRaw) ? certRaw : Buffer.from(certRaw);
          const asn1Cert = asn1js.fromBER(certRawBuf.buffer);
          const cert = new (pkijs as any).Certificate({ schema: asn1Cert.result });
          const certCN = getCNfromPkijsCertificate(cert);

          // Confronta col CN richiesto
          if (userCN && certCN && !certCN.toLowerCase().includes(userCN.toLowerCase())) {
            continue;
          }

          // Attributi firmati
          const hash = createHash("sha256").update(data).digest();
          const messageDigestAttr = new pkijs.Attribute({
            type: "1.2.840.113549.1.9.4",
            values: [new asn1js.OctetString({ valueHex: hash.buffer })]
          });
          const signingTimeAttr = new pkijs.Attribute({
            type: "1.2.840.113549.1.9.5",
            values: [new asn1js.UTCTime({ valueDate: new Date() })]
          });
          const signedAttrs = new pkijs.SignedAndUnsignedAttributes({
            type: 0,
            attributes: [messageDigestAttr, signingTimeAttr]
          });

          const signedAttrsSchema = signedAttrs.toSchema();
          const signedAttrsDER = signedAttrsSchema.toBER(false);

          let signedAttrsBuffer: Buffer;
          if (Buffer.isBuffer(signedAttrsDER)) {
            signedAttrsBuffer = signedAttrsDER;
          } else if (signedAttrsDER instanceof Uint8Array) {
            signedAttrsBuffer = Buffer.from(signedAttrsDER);
          } else if (signedAttrsDER instanceof ArrayBuffer) {
            signedAttrsBuffer = Buffer.from(new Uint8Array(signedAttrsDER));
          } else {
            throw new Error("Tipo non supportato per signedAttrsDER");
          }

          // Firma
          pkcs11.C_SignInit(sess, { mechanism: pkcs11js.CKM_SHA256_RSA_PKCS }, privKey);
          const signature = pkcs11.C_Sign(sess, signedAttrsBuffer, Buffer.alloc(256));

          // SignedData CMS
          const sd = new pkijs.SignedData({
            version: 1,
            digestAlgorithms: [new pkijs.AlgorithmIdentifier({ algorithmId: "2.16.840.1.101.3.4.2.1" })],
            encapContentInfo: new pkijs.EncapsulatedContentInfo({
              eContentType: "1.2.840.113549.1.7.1",
              eContent    : new asn1js.OctetString({})
            }),
            certificates: [cert],
            signerInfos: []
          });

          sd.signerInfos.push(new pkijs.SignerInfo({
            version: 1,
            sid: new pkijs.IssuerAndSerialNumber({
              issuer: cert.issuer,
              serialNumber: cert.serialNumber
            }),
            digestAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: "2.16.840.1.101.3.4.2.1" }),
            signedAttrs: signedAttrs,
            signatureAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: "1.2.840.113549.1.1.11" }),
            signature: new asn1js.OctetString({ valueHex: signature.buffer })
          }));

          const cmsDer = new pkijs.ContentInfo({
            contentType: "1.2.840.113549.1.7.2",
            content    : sd.toSchema(true)
          }).toSchema().toBER(false);

          // Clean-up sessione
          pkcs11.C_Logout(sess);
          pkcs11.C_CloseSession(sess);

          result = {
            cmsBuf: Buffer.from(cmsDer),
            signedBy: certCN || "Operatore autorizzato"
          };
          break;
        }

        if (result) break;
        // Se non trovato, chiudi la sessione su questo slot
        pkcs11.C_Logout(sess);
        pkcs11.C_CloseSession(sess);
      } catch (e) {
        // Se errore, tenta clean-up su sessione
        if (sess) {
          try { pkcs11.C_Logout(sess); } catch {}
          try { pkcs11.C_CloseSession(sess); } catch {}
        }
        // Prova slot successivo
        continue;
      }
    }
  } finally {
    try { pkcs11.C_Finalize(); } catch {}
  }

  if (!result) throw new Error("Nessun certificato compatibile trovato sulla smartcard!");
  return result;
}


function getCNfromPkijsCertificate(cert: any): string {
  const cnAttr = cert.subject.typesAndValues.find(
    (attr: any) => attr.type === "2.5.4.3"
  );
  return cnAttr ? cnAttr.value.valueBlock.value : "";
}

/* ██████ FIRMA REMOTA ██████ */
async function signViaRemote(req:SignPdfRequest, data:Buffer, settings: Settings){
  const digest=createHash('sha256').update(data).digest('base64');
  const r=await axios.post(settings.remoteSignUrl,{digestBase64:digest,otp:req.otpCode},{timeout:15000});
  if(!r.data?.cms) throw new Error('remoteSign – CMS mancante');
  // TODO: Se il payload contiene il CN, estrailo!
  return Buffer.from(r.data.cms,'base64');
}

/* ██████ TIMESTAMP (con fallback) ██████ */
export async function timestampCms(
  cmsDer: Buffer,
  settings: Settings
): Promise<Buffer> {
  if (!settings.tsaUrl) {
    log("⚠️   tsaUrl mancante → salto timestamp");
    return cmsDer;
  }
  try {
    const cmsHash = createHash("sha256").update(cmsDer).digest();
    const tsReq = new pkijs.TimeStampReq({
      version: 1,
      messageImprint: new pkijs.MessageImprint({
        hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: "2.16.840.1.101.3.4.2.1" }),
        hashedMessage: new asn1js.OctetString({ valueHex: cmsHash.buffer })
      }),
      certReq: true
    });
    const reqDer = tsReq.toSchema().toBER(false);

    const r = await axios.post(
      settings.tsaUrl,
      Buffer.from(reqDer),
      { headers: { "Content-Type": "application/timestamp-query" },
        responseType: "arraybuffer", timeout: 10000 }
    );
    const tokenDer = Buffer.from(r.data);

    const asn1 = asn1js.fromBER(cmsDer.buffer);
    if (asn1.offset < 0) {
      log("⚠️   BER parse fallito – ritorno CMS originale");
      return cmsDer;
    }
    const ci         = new (pkijs as any).ContentInfo({ schema: asn1.result });
    const signedData = new (pkijs as any).SignedData({ schema: ci.content });

    const tstAttr = new (pkijs as any).Attribute({
      type  : "1.2.840.113549.1.9.16.2.14",
      values: [ new asn1js.OctetString({ valueHex: tokenDer.buffer }) ]
    });
    signedData.signerInfos[0].unsignedAttrs = new (pkijs as any)
        .SignedAndUnsignedAttributes({ attributes: [tstAttr] });

    const newCi = new (pkijs as any).ContentInfo({
      contentType: "1.2.840.1.7.2",
      content    : signedData.toSchema(true)
    });
    const newDer = newCi.toSchema().toBER(false);
    log(`Nuovo CMS timbrato (${newDer.byteLength} byte)`);
    return Buffer.from(newDer);
  } catch (e: any) {
    log(`⚠️   TSA FAIL (${e.message}) – ritorno CMS senza timestamp`);
    return cmsDer;
  }
}
