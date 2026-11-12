import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

export interface StandGeneratorParams {
  shopName: string;
  shopSlug: string;
  shopCode: string;
  location?: string;
  format?: 'A5' | 'A4';
  orientation?: 'PORTRAIT' | 'LANDSCAPE';
  styleMode?: 'STANDARD' | 'MINIMAL' | 'DARK';
  shopUrl: string;
}

/**
 * Generates a vector, print-ready PDF for the EasyToPrint Counter Stand
 * (A5 Portrait: 148 x 210 mm = 419.53 x 595.28 pt)
 * Simple, minimal, and professional layout.
 */
export async function generateStandPdf(params: StandGeneratorParams): Promise<Uint8Array> {
  const {
    shopCode,
    format = 'A5',
    orientation = 'PORTRAIT',
    shopUrl
  } = params;

  // Page dimensions in points (72 points per inch)
  // A5: 148 x 210 mm = 419.53 x 595.28 pt | A4: 210 x 297 mm = 595.28 x 841.89 pt
  const isA4 = format === 'A4';
  const isLandscape = orientation === 'LANDSCAPE';

  const baseWidth = isA4 ? 595.28 : 419.53;
  const baseHeight = isA4 ? 841.89 : 595.28;

  const pageWidth = isLandscape ? baseHeight : baseWidth;
  const pageHeight = isLandscape ? baseWidth : baseHeight;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Clean Minimal Palette
  const whiteBg = rgb(1, 1, 1);
  const greenAccent = rgb(0, 0.702, 0.176); // #00B32D
  const textDark = rgb(0.067, 0.067, 0.067); // #111111
  const textSecondary = rgb(0.333, 0.333, 0.333); // #555555
  const borderLight = rgb(0.898, 0.906, 0.922); // #E5E7EB
  const dividerLight = rgb(0.925, 0.937, 0.925); // #ECEFEC
  const codeBoxBg = rgb(0.961, 0.984, 0.965); // #F5FBF6
  const codeBoxBorder = rgb(0.804, 0.933, 0.835); // #CDEED5

  // 1. Clean white background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: whiteBg
  });

  // Safe print margin (approx 10mm = 28.35pt on A5)
  const margin = isA4 ? 38 : 28;
  const contentWidth = pageWidth - margin * 2;
  const centerX = pageWidth / 2;

  // Generate High-Res QR Code PNG from actual shopUrl
  const qrDataUrl = await QRCode.toDataURL(shopUrl, {
    width: 800,
    margin: 2,
    color: {
      dark: '#111111',
      light: '#FFFFFF'
    }
  });
  const qrImage = await pdfDoc.embedPng(qrDataUrl);

  const cleanCode = `#${shopCode || '100001'}`;

  if (isLandscape) {
    // -------------------------------------------------------------
    // LANDSCAPE MINIMAL LAYOUT
    // -------------------------------------------------------------
    const leftX = margin + 8;
    const leftColWidth = contentWidth * 0.54;
    const rightCenterX = margin + contentWidth * 0.78;

    let leftY = pageHeight - margin - (isA4 ? 28 : 20);

    // 1. Top: Small EasyToPrint logo mark and brand name
    const logoSize = isA4 ? 14 : 11;
    page.drawRectangle({
      x: leftX,
      y: leftY - 1,
      width: logoSize,
      height: logoSize,
      color: greenAccent
    });
    page.drawText('EasyToPrint', {
      x: leftX + logoSize + 6,
      y: leftY,
      size: isA4 ? 13 : 10.5,
      font: fontBold,
      color: textDark
    });

    // 2. Main heading: "Printing Made Easy."
    leftY -= isA4 ? 46 : 34;
    page.drawText('Printing Made Easy.', {
      x: leftX,
      y: leftY,
      size: isA4 ? 28 : 21,
      font: fontBold,
      color: textDark
    });

    // 3. Subtitle: "Scan. Upload. Pay. Collect."
    leftY -= isA4 ? 22 : 16;
    page.drawText('Scan. Upload. Pay. Collect.', {
      x: leftX,
      y: leftY,
      size: isA4 ? 13 : 10,
      font: fontBold,
      color: greenAccent
    });

    // 7. Three simple steps in one horizontal row
    const stepsY = margin + (isA4 ? 95 : 70);
    page.drawLine({
      start: { x: leftX, y: stepsY + (isA4 ? 26 : 20) },
      end: { x: leftX + leftColWidth, y: stepsY + (isA4 ? 26 : 20) },
      thickness: 0.8,
      color: dividerLight
    });

    const steps = [
      { num: '01', title: 'Scan', desc: 'Scan the QR code.' },
      { num: '02', title: 'Upload', desc: 'Select your document.' },
      { num: '03', title: 'Collect', desc: 'Pick up your prints.' }
    ];
    const stepColW = leftColWidth / 3;

    steps.forEach((st, idx) => {
      const sx = leftX + idx * stepColW;
      const numSize = isA4 ? 10.5 : 8.5;
      const numW = fontBold.widthOfTextAtSize(st.num, numSize);

      page.drawText(st.num, {
        x: sx,
        y: stepsY + (isA4 ? 6 : 4),
        size: numSize,
        font: fontBold,
        color: greenAccent
      });
      page.drawText(` ${st.title}`, {
        x: sx + numW + 2,
        y: stepsY + (isA4 ? 6 : 4),
        size: numSize,
        font: fontBold,
        color: textDark
      });
      page.drawText(st.desc, {
        x: sx,
        y: stepsY - (isA4 ? 8 : 7),
        size: isA4 ? 9 : 7.2,
        font: fontRegular,
        color: textSecondary
      });
    });

    // 8. Bottom
    const bottomY = margin + (isA4 ? 24 : 18);
    page.drawLine({
      start: { x: leftX, y: bottomY + (isA4 ? 20 : 15) },
      end: { x: leftX + leftColWidth, y: bottomY + (isA4 ? 20 : 15) },
      thickness: 0.8,
      color: dividerLight
    });
    page.drawText('Your documents, printed with ease.', {
      x: leftX,
      y: bottomY,
      size: isA4 ? 9.5 : 7.8,
      font: fontBold,
      color: textDark
    });
    const poweredStr = 'Powered by EasyToPrint';
    const poweredSize = isA4 ? 9.5 : 7.8;
    const poweredW = fontBold.widthOfTextAtSize(poweredStr, poweredSize);
    page.drawText(poweredStr, {
      x: leftX + leftColWidth - poweredW,
      y: bottomY,
      size: poweredSize,
      font: fontBold,
      color: greenAccent
    });

    // Right Column: QR Code + Shop Code
    const qrSize = isA4 ? 185 : 138;
    const qrPad = isA4 ? 14 : 10;
    const qrBoxSize = qrSize + qrPad * 2;
    const qrBoxX = rightCenterX - qrBoxSize / 2;
    const qrBoxY = pageHeight / 2 - qrBoxSize / 2 + (isA4 ? 28 : 22);

    page.drawRectangle({
      x: qrBoxX,
      y: qrBoxY,
      width: qrBoxSize,
      height: qrBoxSize,
      color: whiteBg,
      borderColor: borderLight,
      borderWidth: 1
    });

    page.drawImage(qrImage, {
      x: qrBoxX + qrPad,
      y: qrBoxY + qrPad,
      width: qrSize,
      height: qrSize
    });

    const manualText = "Can't scan? Enter your shop code manually.";
    const manualSize = isA4 ? 9.5 : 7.5;
    const manualW = fontRegular.widthOfTextAtSize(manualText, manualSize);
    const manualY = qrBoxY - (isA4 ? 20 : 15);
    page.drawText(manualText, {
      x: rightCenterX - manualW / 2,
      y: manualY,
      size: manualSize,
      font: fontRegular,
      color: textSecondary
    });

    const codeFontSize = isA4 ? 18 : 14;
    const codeW = fontBold.widthOfTextAtSize(cleanCode, codeFontSize);
    const boxW = codeW + (isA4 ? 32 : 24);
    const boxH = codeFontSize + (isA4 ? 14 : 10);
    const boxY = manualY - boxH - (isA4 ? 10 : 8);

    page.drawRectangle({
      x: rightCenterX - boxW / 2,
      y: boxY,
      width: boxW,
      height: boxH,
      color: codeBoxBg,
      borderColor: codeBoxBorder,
      borderWidth: 1
    });
    page.drawText(cleanCode, {
      x: rightCenterX - codeW / 2,
      y: boxY + (isA4 ? 5 : 3.5),
      size: codeFontSize,
      font: fontBold,
      color: textDark
    });
  } else {
    // -------------------------------------------------------------
    // PORTRAIT MINIMAL LAYOUT (A5: 148 x 210 mm / A4: 210 x 297 mm)
    // -------------------------------------------------------------
    let curY = pageHeight - margin - (isA4 ? 22 : 16);

    // 1. Top: Small EasyToPrint logo mark and brand name
    const brandEasy = 'Easy';
    const brandTo = 'To';
    const brandPrint = 'Print';
    const brandSize = isA4 ? 14 : 11;
    const easyW = fontBold.widthOfTextAtSize(brandEasy, brandSize);
    const toW = fontBold.widthOfTextAtSize(brandTo, brandSize);
    const printW = fontBold.widthOfTextAtSize(brandPrint, brandSize);
    const logoSize = isA4 ? 13 : 10;
    const totalBrandW = logoSize + 6 + easyW + toW + printW;
    const brandStartX = centerX - totalBrandW / 2;

    // Small green square logo mark with inner white printer bar
    page.drawRectangle({
      x: brandStartX,
      y: curY - 1,
      width: logoSize,
      height: logoSize,
      color: greenAccent
    });
    page.drawRectangle({
      x: brandStartX + logoSize * 0.22,
      y: curY - 1 + logoSize * 0.25,
      width: logoSize * 0.56,
      height: logoSize * 0.5,
      color: whiteBg
    });

    const textStartX = brandStartX + logoSize + 6;
    page.drawText(brandEasy, {
      x: textStartX,
      y: curY,
      size: brandSize,
      font: fontBold,
      color: textDark
    });
    page.drawText(brandTo, {
      x: textStartX + easyW,
      y: curY,
      size: brandSize,
      font: fontBold,
      color: greenAccent
    });
    page.drawText(brandPrint, {
      x: textStartX + easyW + toW,
      y: curY,
      size: brandSize,
      font: fontBold,
      color: textDark
    });

    // 2. Main heading: "Printing Made Easy."
    curY -= isA4 ? 42 : 30;
    const headingText = 'Printing Made Easy.';
    const headingSize = isA4 ? 32 : 23;
    const headingW = fontBold.widthOfTextAtSize(headingText, headingSize);
    page.drawText(headingText, {
      x: centerX - headingW / 2,
      y: curY,
      size: headingSize,
      font: fontBold,
      color: textDark
    });

    // 3. Subtitle: "Scan. Upload. Pay. Collect."
    curY -= isA4 ? 22 : 16;
    const subText = 'Scan. Upload. Pay. Collect.';
    const subSize = isA4 ? 14 : 10.5;
    const subW = fontBold.widthOfTextAtSize(subText, subSize);
    page.drawText(subText, {
      x: centerX - subW / 2,
      y: curY,
      size: subSize,
      font: fontBold,
      color: greenAccent
    });

    // 4. Center: Large, clearly visible QR code with sufficient white space around it
    curY -= isA4 ? 28 : 20;
    const qrSize = isA4 ? 260 : 190;
    const qrPad = isA4 ? 18 : 14;
    const qrBoxSize = qrSize + qrPad * 2;
    const qrBoxX = centerX - qrBoxSize / 2;
    const qrBoxY = curY - qrBoxSize;

    page.drawRectangle({
      x: qrBoxX,
      y: qrBoxY,
      width: qrBoxSize,
      height: qrBoxSize,
      color: whiteBg,
      borderColor: borderLight,
      borderWidth: 1
    });

    page.drawImage(qrImage, {
      x: qrBoxX + qrPad,
      y: qrBoxY + qrPad,
      width: qrSize,
      height: qrSize
    });

    // 5. Below QR: "Can't scan? Enter your shop code manually."
    curY = qrBoxY - (isA4 ? 24 : 18);
    const manualPrompt = "Can't scan? Enter your shop code manually.";
    const manualSize = isA4 ? 11.5 : 9;
    const manualW = fontRegular.widthOfTextAtSize(manualPrompt, manualSize);
    page.drawText(manualPrompt, {
      x: centerX - manualW / 2,
      y: curY,
      size: manualSize,
      font: fontRegular,
      color: textSecondary
    });

    // 6. Shop code: Display #100001 in a clean, subtle highlighted section
    curY -= isA4 ? 38 : 28;
    const codeFontSize = isA4 ? 22 : 16.5;
    const codeStrW = fontBold.widthOfTextAtSize(cleanCode, codeFontSize);
    const codeBoxW = codeStrW + (isA4 ? 44 : 32);
    const codeBoxH = codeFontSize + (isA4 ? 16 : 12);

    page.drawRectangle({
      x: centerX - codeBoxW / 2,
      y: curY - 3,
      width: codeBoxW,
      height: codeBoxH,
      color: codeBoxBg,
      borderColor: codeBoxBorder,
      borderWidth: 1
    });

    page.drawText(cleanCode, {
      x: centerX - codeStrW / 2,
      y: curY + (isA4 ? 4 : 3),
      size: codeFontSize,
      font: fontBold,
      color: textDark
    });

    // 7. Three simple steps in one horizontal row (positioned with balanced spacing above bottom footer)
    const stepsTopDividerY = margin + (isA4 ? 108 : 80);
    page.drawLine({
      start: { x: margin, y: stepsTopDividerY },
      end: { x: pageWidth - margin, y: stepsTopDividerY },
      thickness: 0.8,
      color: dividerLight
    });

    const steps = [
      { num: '01', title: 'Scan', desc: 'Scan the QR code.' },
      { num: '02', title: 'Upload', desc: 'Select your document.' },
      { num: '03', title: 'Collect', desc: 'Pick up your prints.' }
    ];

    const colWidth = contentWidth / 3;
    const stepTitleY = stepsTopDividerY - (isA4 ? 22 : 16);
    const stepDescY = stepTitleY - (isA4 ? 15 : 11.5);

    steps.forEach((step, idx) => {
      const colStartX = margin + idx * colWidth + (idx > 0 ? 6 : 0);
      const numSize = isA4 ? 11.5 : 9;
      const numW = fontBold.widthOfTextAtSize(step.num, numSize);

      page.drawText(step.num, {
        x: colStartX,
        y: stepTitleY,
        size: numSize,
        font: fontBold,
        color: greenAccent
      });

      page.drawText(` ${step.title}`, {
        x: colStartX + numW + 2,
        y: stepTitleY,
        size: numSize,
        font: fontBold,
        color: textDark
      });

      page.drawText(step.desc, {
        x: colStartX,
        y: stepDescY,
        size: isA4 ? 10 : 8,
        font: fontRegular,
        color: textSecondary
      });
    });

    // 8. Bottom: "Your documents, printed with ease." and "Powered by EasyToPrint"
    const bottomDividerY = margin + (isA4 ? 46 : 34);
    page.drawLine({
      start: { x: margin, y: bottomDividerY },
      end: { x: pageWidth - margin, y: bottomDividerY },
      thickness: 0.8,
      color: dividerLight
    });

    const easeText = 'Your documents, printed with ease.';
    const easeSize = isA4 ? 11 : 8.5;
    const easeW = fontBold.widthOfTextAtSize(easeText, easeSize);
    page.drawText(easeText, {
      x: centerX - easeW / 2,
      y: bottomDividerY - (isA4 ? 18 : 13),
      size: easeSize,
      font: fontBold,
      color: textDark
    });

    const poweredText = 'Powered by EasyToPrint';
    const poweredSize = isA4 ? 10 : 7.8;
    const poweredW = fontBold.widthOfTextAtSize(poweredText, poweredSize);
    page.drawText(poweredText, {
      x: centerX - poweredW / 2,
      y: bottomDividerY - (isA4 ? 33 : 24),
      size: poweredSize,
      font: fontBold,
      color: greenAccent
    });
  }

  return await pdfDoc.save();
}

/**
 * Generates a high-resolution 300-DPI PNG Data URL for the EasyToPrint Counter Stand
 * (A5 Portrait: 148 x 210 mm = 1748 x 2480 px at 300 DPI)
 */
export async function generateStandPngDataUrl(params: StandGeneratorParams): Promise<string> {
  const {
    shopCode,
    format = 'A5',
    orientation = 'PORTRAIT',
    shopUrl
  } = params;

  const isA4 = format === 'A4';
  const isLandscape = orientation === 'LANDSCAPE';

  // Exact 300 DPI pixel dimensions: A5 (148x210mm) = 1748x2480, A4 (210x297mm) = 2480x3508
  const baseW = isA4 ? 2480 : 1748;
  const baseH = isA4 ? 3508 : 2480;

  const width = isLandscape ? baseH : baseW;
  const height = isLandscape ? baseW : baseH;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // 1. Clean White Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Safe print margin
  const pad = isA4 ? 140 : 108;
  const contentWidth = width - pad * 2;
  const centerX = width / 2;

  // Render QR code to an offscreen canvas using the actual shopUrl
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, shopUrl, {
    width: isA4 ? 1040 : 780,
    margin: 2,
    color: {
      dark: '#111111',
      light: '#FFFFFF'
    }
  });

  const cleanCode = `#${shopCode || '100001'}`;

  if (isLandscape) {
    const leftX = pad;
    const leftColW = contentWidth * 0.54;
    const rightCenterX = pad + contentWidth * 0.78;

    let curY = pad + (isA4 ? 80 : 60);

    // 1. Top: Small EasyToPrint logo and brand name
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00B32D';
    roundRect(ctx, leftX, curY - (isA4 ? 38 : 28), isA4 ? 44 : 34, isA4 ? 44 : 34, 8);
    ctx.fill();

    ctx.font = `700 ${isA4 ? 44 : 34}px Manrope, sans-serif`;
    ctx.fillStyle = '#111111';
    ctx.fillText('EasyToPrint', leftX + (isA4 ? 60 : 46), curY);

    // 2. Main heading
    curY += isA4 ? 140 : 105;
    ctx.font = `800 ${isA4 ? 96 : 70}px Manrope, sans-serif`;
    ctx.fillStyle = '#111111';
    ctx.fillText('Printing Made Easy.', leftX, curY);

    // 3. Subtitle
    curY += isA4 ? 72 : 54;
    ctx.font = `600 ${isA4 ? 46 : 34}px Manrope, sans-serif`;
    ctx.fillStyle = '#00B32D';
    ctx.fillText('Scan. Upload. Pay. Collect.', leftX, curY);

    // 7. Three simple steps in one horizontal row
    const stepsDividerY = height - pad - (isA4 ? 360 : 260);
    ctx.strokeStyle = '#ECEFEC';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(leftX, stepsDividerY);
    ctx.lineTo(leftX + leftColW, stepsDividerY);
    ctx.stroke();

    const steps = [
      { num: '01', title: 'Scan', desc: 'Scan the QR code.' },
      { num: '02', title: 'Upload', desc: 'Select your document.' },
      { num: '03', title: 'Collect', desc: 'Pick up your prints.' }
    ];
    const stepW = leftColW / 3;
    steps.forEach((st, idx) => {
      const sx = leftX + idx * stepW;
      ctx.font = `800 ${isA4 ? 38 : 28}px Manrope, sans-serif`;
      ctx.fillStyle = '#00B32D';
      ctx.fillText(st.num, sx, stepsDividerY + (isA4 ? 64 : 48));
      const numW = ctx.measureText(st.num).width;
      ctx.fillStyle = '#111111';
      ctx.fillText(` ${st.title}`, sx + numW + 6, stepsDividerY + (isA4 ? 64 : 48));

      ctx.font = `500 ${isA4 ? 32 : 24}px Manrope, sans-serif`;
      ctx.fillStyle = '#555555';
      ctx.fillText(st.desc, sx, stepsDividerY + (isA4 ? 112 : 84));
    });

    // 8. Bottom
    const bottomDividerY = height - pad - (isA4 ? 110 : 80);
    ctx.strokeStyle = '#ECEFEC';
    ctx.beginPath();
    ctx.moveTo(leftX, bottomDividerY);
    ctx.lineTo(leftX + leftColW, bottomDividerY);
    ctx.stroke();

    ctx.font = `600 ${isA4 ? 34 : 25}px Manrope, sans-serif`;
    ctx.fillStyle = '#111111';
    ctx.fillText('Your documents, printed with ease.', leftX, bottomDividerY + (isA4 ? 62 : 46));

    ctx.textAlign = 'right';
    ctx.fillStyle = '#00B32D';
    ctx.fillText('Powered by EasyToPrint', leftX + leftColW, bottomDividerY + (isA4 ? 62 : 46));

    // Right Column: QR + Shop Code
    const qrSize = isA4 ? 680 : 490;
    const qrPad = isA4 ? 44 : 32;
    const qrBoxSize = qrSize + qrPad * 2;
    const qrBoxX = rightCenterX - qrBoxSize / 2;
    const qrBoxY = pad + (isA4 ? 60 : 40);

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 4;
    roundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 32);
    ctx.fill();
    ctx.stroke();

    ctx.drawImage(qrCanvas, qrBoxX + qrPad, qrBoxY + qrPad, qrSize, qrSize);

    ctx.textAlign = 'center';
    ctx.font = `500 ${isA4 ? 34 : 25}px Manrope, sans-serif`;
    ctx.fillStyle = '#555555';
    ctx.fillText("Can't scan? Enter your shop code manually.", rightCenterX, qrBoxY + qrBoxSize + (isA4 ? 66 : 48));

    ctx.font = `800 ${isA4 ? 64 : 46}px Manrope, sans-serif`;
    const codeW = ctx.measureText(cleanCode).width;
    const boxW = codeW + (isA4 ? 110 : 80);
    const boxH = isA4 ? 104 : 78;
    const boxY = qrBoxY + qrBoxSize + (isA4 ? 96 : 70);

    ctx.fillStyle = '#F5FBF6';
    ctx.strokeStyle = '#CDEED5';
    ctx.lineWidth = 3;
    roundRect(ctx, rightCenterX - boxW / 2, boxY, boxW, boxH, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#111111';
    ctx.fillText(cleanCode, rightCenterX, boxY + (isA4 ? 72 : 54));
  } else {
    // -------------------------------------------------------------
    // PORTRAIT MINIMAL LAYOUT (A5: 148 x 210 mm / A4: 210 x 297 mm)
    // -------------------------------------------------------------
    let curY = pad + (isA4 ? 60 : 44);

    // 1. Top: Small EasyToPrint logo and brand name
    ctx.font = `700 ${isA4 ? 50 : 38}px Manrope, sans-serif`;
    const easyW = ctx.measureText('Easy').width;
    const toW = ctx.measureText('To').width;
    const printW = ctx.measureText('Print').width;
    const logoSize = isA4 ? 48 : 36;
    const totalBrandW = logoSize + 20 + easyW + toW + printW;
    const startBrandX = centerX - totalBrandW / 2;

    ctx.fillStyle = '#00B32D';
    roundRect(ctx, startBrandX, curY - (isA4 ? 38 : 28), logoSize, logoSize, 8);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(
      startBrandX + logoSize * 0.22,
      curY - (isA4 ? 38 : 28) + logoSize * 0.26,
      logoSize * 0.56,
      logoSize * 0.48
    );

    ctx.textAlign = 'left';
    const textX = startBrandX + logoSize + 20;
    ctx.fillStyle = '#111111';
    ctx.fillText('Easy', textX, curY);
    ctx.fillStyle = '#00B32D';
    ctx.fillText('To', textX + easyW, curY);
    ctx.fillStyle = '#111111';
    ctx.fillText('Print', textX + easyW + toW, curY);

    // 2. Main heading: "Printing Made Easy."
    ctx.textAlign = 'center';
    curY += isA4 ? 140 : 104;
    ctx.font = `800 ${isA4 ? 112 : 82}px Manrope, sans-serif`;
    ctx.fillStyle = '#111111';
    ctx.fillText('Printing Made Easy.', centerX, curY);

    // 3. Subtitle: "Scan. Upload. Pay. Collect."
    curY += isA4 ? 76 : 56;
    ctx.font = `600 ${isA4 ? 52 : 38}px Manrope, sans-serif`;
    ctx.fillStyle = '#00B32D';
    ctx.fillText('Scan. Upload. Pay. Collect.', centerX, curY);

    // 4. Center: Large, clearly visible QR code with sufficient white space around it
    curY += isA4 ? 95 : 70;
    const qrSize = isA4 ? 1020 : 740;
    const qrPad = isA4 ? 68 : 50;
    const qrBoxSize = qrSize + qrPad * 2;
    const qrBoxX = centerX - qrBoxSize / 2;
    const qrBoxY = curY;

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 4;
    roundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 40);
    ctx.fill();
    ctx.stroke();

    ctx.drawImage(qrCanvas, qrBoxX + qrPad, qrBoxY + qrPad, qrSize, qrSize);

    // 5. Below QR: "Can't scan? Enter your shop code manually."
    curY = qrBoxY + qrBoxSize + (isA4 ? 90 : 66);
    ctx.font = `500 ${isA4 ? 44 : 32}px Manrope, sans-serif`;
    ctx.fillStyle = '#555555';
    ctx.fillText("Can't scan? Enter your shop code manually.", centerX, curY);

    // 6. Shop code: Display #100001 in a clean, subtle highlighted section
    curY += isA4 ? 46 : 34;
    ctx.font = `800 ${isA4 ? 80 : 58}px Manrope, sans-serif`;
    const codeW = ctx.measureText(cleanCode).width;
    const boxW = codeW + (isA4 ? 150 : 110);
    const boxH = isA4 ? 132 : 96;

    ctx.fillStyle = '#F5FBF6';
    ctx.strokeStyle = '#CDEED5';
    ctx.lineWidth = 4;
    roundRect(ctx, centerX - boxW / 2, curY, boxW, boxH, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#111111';
    ctx.fillText(cleanCode, centerX, curY + (isA4 ? 92 : 67));

    // 7. Three simple steps in one horizontal row
    const stepsTopY = height - pad - (isA4 ? 420 : 310);
    ctx.strokeStyle = '#ECEFEC';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pad, stepsTopY);
    ctx.lineTo(width - pad, stepsTopY);
    ctx.stroke();

    const steps = [
      { num: '01', title: 'Scan', desc: 'Scan the QR code.' },
      { num: '02', title: 'Upload', desc: 'Select your document.' },
      { num: '03', title: 'Collect', desc: 'Pick up your prints.' }
    ];

    const colW = contentWidth / 3;
    ctx.textAlign = 'left';
    steps.forEach((st, idx) => {
      const sx = pad + idx * colW + (idx > 0 ? 20 : 0);
      const titleY = stepsTopY + (isA4 ? 86 : 64);
      ctx.font = `800 ${isA4 ? 44 : 32}px Manrope, sans-serif`;
      ctx.fillStyle = '#00B32D';
      ctx.fillText(st.num, sx, titleY);
      const numW = ctx.measureText(st.num).width;

      ctx.fillStyle = '#111111';
      ctx.fillText(` ${st.title}`, sx + numW + 8, titleY);

      ctx.font = `500 ${isA4 ? 38 : 28}px Manrope, sans-serif`;
      ctx.fillStyle = '#555555';
      ctx.fillText(st.desc, sx, titleY + (isA4 ? 56 : 42));
    });

    // 8. Bottom: "Your documents, printed with ease." and "Powered by EasyToPrint"
    const bottomDividerY = height - pad - (isA4 ? 170 : 126);
    ctx.strokeStyle = '#ECEFEC';
    ctx.beginPath();
    ctx.moveTo(pad, bottomDividerY);
    ctx.lineTo(width - pad, bottomDividerY);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = `600 ${isA4 ? 42 : 31}px Manrope, sans-serif`;
    ctx.fillStyle = '#111111';
    ctx.fillText('Your documents, printed with ease.', centerX, bottomDividerY + (isA4 ? 72 : 54));

    ctx.font = `700 ${isA4 ? 38 : 28}px Manrope, sans-serif`;
    ctx.fillStyle = '#00B32D';
    ctx.fillText('Powered by EasyToPrint', centerX, bottomDividerY + (isA4 ? 132 : 98));
  }

  return canvas.toDataURL('image/png');
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
