/**
 * pdf-editor.js
 * Applies URL changes to a pdf-lib PDFDocument and saves it.
 */

/**
 * Applies the user's URL changes to the loaded PDF document.
 * @param {PDFDocument} pdfDoc - The pdf-lib document instance
 * @param {LinkAnnotation[]} links - Array of links (with newUrl set by user)
 * @param {boolean} compress - Whether to apply basic compression
 * @returns {Promise<Uint8Array>} - The modified PDF as bytes
 */
async function applyChangesAndSave(pdfDoc, links, compress = false) {
  const { PDFName, PDFString } = PDFLib;

  let changeCount = 0;

  for (const link of links) {
    const newUrl = link.newUrl.trim();
    if (!newUrl || newUrl === link.originalUrl) continue;

    try {
      if (link.isNew) {
        // Create new annotation
        const page = pdfDoc.getPage(link.page - 1); // pages are 0-indexed in pdf-lib
        
        const linkAnnotation = pdfDoc.context.register(
          pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: link.rect, // [x1, y1, x2, y2]
            Border: [0, 0, 0], // Invisible border
            A: {
              Type: 'Action',
              S: 'URI',
              URI: PDFString.of(newUrl),
            },
          })
        );
        
        let annots = page.node.get(PDFName.of('Annots'));
        if (!annots) {
          annots = pdfDoc.context.obj([]);
          page.node.set(PDFName.of('Annots'), annots);
        }
        
        // In case it's a reference to an array instead of direct array
        if (annots.push) {
          annots.push(linkAnnotation);
        } else {
          const annotsArray = pdfDoc.context.lookup(annots);
          if (annotsArray && annotsArray.push) {
            annotsArray.push(linkAnnotation);
          }
        }
        changeCount++;
      } else {
        // Update existing annotation
        link._actionDict.set(PDFName.of('URI'), PDFString.of(newUrl));
        changeCount++;
      }
    } catch (err) {
      console.warn(`Failed to update link "${link.id}":`, err);
    }
  }

  console.log(`Applied ${changeCount} URL changes.`);

  // Save options
  const saveOptions = {};

  if (compress) {
    // Basic optimization: minimize object cross-references
    // pdf-lib doesn't have true image compression, but we can
    // remove unnecessary metadata to reduce size somewhat.
    try {
      // Remove XMP metadata if present
      const catalog = pdfDoc.catalog;
      const metadataKey = PDFName.of('Metadata');
      if (catalog.has(metadataKey)) {
        catalog.delete(metadataKey);
      }
    } catch (e) {
      // ignore if not possible
    }

    // Use object streams for better compression
    saveOptions.useObjectStreams = true;
  } else {
    saveOptions.useObjectStreams = false;
  }

  const pdfBytes = await pdfDoc.save(saveOptions);
  return pdfBytes;
}

/**
 * Triggers a browser download of the given bytes as a PDF file.
 * @param {Uint8Array} pdfBytes
 * @param {string} originalFilename
 * @param {boolean} compress
 */
function downloadPdf(pdfBytes, originalFilename, compress) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const baseName = originalFilename.replace(/\.pdf$/i, '');
  const suffix = compress ? '_compressed_editado' : '_editado';
  const downloadName = `${baseName}${suffix}.pdf`;

  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
