/**
 * pdf-parser.js
 * Extracts hyperlink annotations from a PDF using pdf-lib.
 */

/**
 * Parses a PDF ArrayBuffer and returns all URI hyperlinks found.
 * @param {ArrayBuffer} arrayBuffer - Raw PDF bytes
 * @returns {Promise<{doc: PDFDocument, links: LinkAnnotation[]}>}
 *
 * LinkAnnotation: {
 *   id: string,          // unique id
 *   page: number,        // 1-based page number
 *   originalUrl: string, // original URI
 *   rect: number[],      // [x1, y1, x2, y2] in PDF user units
 *   annotRef: any,       // internal pdf-lib ref for editing
 *   actionDict: any,     // internal action dict for editing
 * }
 */
async function parsePdfLinks(arrayBuffer) {
  const { PDFDocument, PDFDict, PDFName, PDFString, PDFArray } = PDFLib;

  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const pages = pdfDoc.getPages();
  const links = [];
  let idCounter = 0;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const pageNum = pageIndex + 1;

    // Get the Annots array for this page
    let annotsRef;
    try {
      annotsRef = page.node.get(PDFName.of('Annots'));
    } catch (e) {
      continue;
    }

    if (!annotsRef) continue;

    let annotsArray;
    try {
      annotsArray = pdfDoc.context.lookupMaybe(annotsRef, PDFArray);
    } catch (e) {
      // Try direct array
      annotsArray = annotsRef instanceof PDFArray ? annotsRef : null;
    }

    if (!annotsArray) continue;

    const annotCount = annotsArray.size();

    for (let i = 0; i < annotCount; i++) {
      try {
        const annotRef = annotsArray.get(i);
        const annotDict = pdfDoc.context.lookupMaybe(annotRef, PDFDict);
        if (!annotDict) continue;

        // Check Subtype === /Link
        const subtype = annotDict.get(PDFName.of('Subtype'));
        if (!subtype || subtype.toString() !== '/Link') continue;

        // Get Action dict
        const actionRef = annotDict.get(PDFName.of('A'));
        if (!actionRef) continue;

        const actionDict = pdfDoc.context.lookupMaybe(actionRef, PDFDict);
        if (!actionDict) continue;

        // Check Action type === /URI
        const actionType = actionDict.get(PDFName.of('S'));
        if (!actionType || actionType.toString() !== '/URI') continue;

        // Get URI string
        const uriObj = actionDict.get(PDFName.of('URI'));
        if (!uriObj) continue;

        let uri = '';
        try {
          // PDFString or PDFHexString
          if (typeof uriObj.decodeText === 'function') {
            uri = uriObj.decodeText();
          } else if (typeof uriObj.asString === 'function') {
            uri = uriObj.asString();
          } else {
            uri = uriObj.toString().replace(/^[(<]|[>)]$/g, '');
          }
        } catch (e) {
          uri = uriObj.toString().replace(/^[(<]|[>)]$/g, '');
        }

        if (!uri) continue;

        // Get Rect
        let rect = [0, 0, 0, 0];
        try {
          const rectObj = annotDict.get(PDFName.of('Rect'));
          if (rectObj) {
            const rectArr = pdfDoc.context.lookupMaybe(rectObj, PDFArray) || rectObj;
            if (rectArr && typeof rectArr.size === 'function') {
              rect = [
                rectArr.get(0).asNumber(),
                rectArr.get(1).asNumber(),
                rectArr.get(2).asNumber(),
                rectArr.get(3).asNumber(),
              ];
            }
          }
        } catch (e) {
          // keep default rect
        }

        links.push({
          id: `link_${idCounter++}`,
          page: pageNum,
          originalUrl: uri,
          newUrl: '',   // filled by user
          rect,
          _annotRef: annotRef,
          _actionDict: actionDict,
        });

      } catch (err) {
        console.warn(`Error parsing annotation on page ${pageNum}:`, err);
      }
    }
  }

  return { doc: pdfDoc, links };
}
