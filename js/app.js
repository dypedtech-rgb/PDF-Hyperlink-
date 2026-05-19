/**
 * app.js
 * Main orchestrator for the PDF Hyperlink Editor.
 */

// ── State ──────────────────────────────────────────────────────────────────
const State = {
  arrayBuffer: null,     // Raw PDF bytes (kept for PDF.js)
  pdfDoc: null,          // pdf-lib PDFDocument
  links: [],             // Extracted LinkAnnotation[]
  filename: '',          // Original filename
  filter: 'all',         // 'all' | 'modified'
  searchQuery: '',       // Search filter string
};

// ── DOM References ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
  fileInput:        $('file-input'),
  dropZone:         $('drop-zone'),
  viewerWrapper:    $('viewer-wrapper'),
  canvas:           $('pdf-canvas'),
  canvasWrapper:    $('canvas-wrapper'),
  btnPrev:          $('btn-prev'),
  btnNext:          $('btn-next'),
  btnDraw:          $('btn-draw'),
  pageIndicator:    $('page-indicator'),
  viewerFilename:   $('viewer-filename'),
  btnChangeFile:    $('btn-change-file'),
  linksList:        $('links-list'),
  linksCount:       $('links-count'),
  searchInput:      $('search-input'),
  filterAll:        $('filter-all'),
  filterModified:   $('filter-modified'),
  btnDownload:      $('btn-download'),
  compressOption:   $('compress-option'),
  compressCheck:    $('compress-check'),
  compressInner:    $('compress-inner'),
  loadingOverlay:   $('loading-overlay'),
  loadingText:      $('loading-text'),
  loadingSub:       $('loading-sub'),
  toastContainer:   $('toast-container'),
};

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
  setupDropZone();
  setupFileInput();
  setupPageControls();
  setupSearch();
  setupFilterTabs();
  setupDownload();
  setupCompress();
  setupDrawing();
  setupKeyboardShortcuts();
}

// ── Drop Zone ──────────────────────────────────────────────────────────────
function setupDropZone() {
  const zone = DOM.dropZone;

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      loadFile(file);
    } else {
      showToast('Por favor sube un archivo PDF válido.', 'error');
    }
  });

  zone.addEventListener('click', () => DOM.fileInput.click());
}

function setupFileInput() {
  DOM.fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadFile(file);
    DOM.fileInput.value = ''; // reset so same file can be re-selected
  });

  DOM.btnChangeFile.addEventListener('click', () => DOM.fileInput.click());
}

// ── File Loading ───────────────────────────────────────────────────────────
async function loadFile(file) {
  showLoading('Cargando PDF...', 'Leyendo archivo');

  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    State.arrayBuffer = arrayBuffer;
    State.filename = file.name;

    // Update loading status
    setLoadingText('Analizando hipervínculos...', 'Escaneando anotaciones');

    // Parse links
    const { doc, links } = await parsePdfLinks(arrayBuffer);
    State.pdfDoc = doc;
    State.links = links;

    // Update loading status
    setLoadingText('Renderizando preview...', `${links.length} hipervínculo(s) encontrado(s)`);

    // Load PDF.js viewer
    PdfViewer.setLinks(links);
    await PdfViewer.loadPdf(
      arrayBuffer.slice(0),
      DOM.canvas,
      DOM.canvasWrapper,
      onPageChange
    );

    // Show viewer, hide dropzone
    DOM.dropZone.classList.add('hidden');
    DOM.viewerWrapper.classList.remove('hidden');

    // Update header filename
    const ext = State.filename.replace(/^.*\./, '.');
    const base = State.filename.replace(/\.[^.]+$/, '');
    DOM.viewerFilename.innerHTML = `${escapeHtml(base)}<span class="ext">${ext}</span>`;

    // Render link cards
    renderLinkCards();
    updateLinksCount();
    DOM.btnDownload.disabled = false;

    hideLoading();
    showToast(
      links.length > 0
        ? `✓ ${links.length} hipervínculo(s) detectado(s)`
        : 'PDF cargado. No se encontraron hipervínculos.',
      links.length > 0 ? 'success' : 'info'
    );

  } catch (err) {
    hideLoading();
    console.error('Error loading PDF:', err);
    showToast('Error al procesar el PDF. ¿Está protegido con contraseña?', 'error');
  }
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── Page Controls ──────────────────────────────────────────────────────────
function setupPageControls() {
  DOM.btnPrev.addEventListener('click', async () => {
    await PdfViewer.prevPage();
  });

  DOM.btnNext.addEventListener('click', async () => {
    await PdfViewer.nextPage();
  });
}

function onPageChange(current, total) {
  DOM.pageIndicator.textContent = `Página ${current} de ${total}`;
  DOM.btnPrev.disabled = current <= 1;
  DOM.btnNext.disabled = current >= total;
}

// ── Drawing Mode ───────────────────────────────────────────────────────────
function setupDrawing() {
  if (!DOM.btnDraw) return;
  
  DOM.btnDraw.addEventListener('click', () => {
    const isActive = PdfViewer.toggleDrawingMode(onNewLinkDrawn);
    DOM.btnDraw.classList.toggle('active', isActive);
  });
}

function onNewLinkDrawn(pageNum, pdfRect) {
  const newLink = {
    id: `new_link_${Date.now()}`,
    page: pageNum,
    originalUrl: 'Enlace personalizado',
    newUrl: '',
    rect: pdfRect,
    isNew: true
  };

  State.links.unshift(newLink); // Add to top of list
  
  // Turn off drawing mode after 1 draw
  PdfViewer.toggleDrawingMode(null);
  DOM.btnDraw.classList.remove('active');
  
  renderLinkCards();
  updateLinksCount();
  PdfViewer.refresh(); // Refresh to show new overlay
  
  showToast('Área de enlace creada. Asigna una URL.', 'info');
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // Ctrl+Z or Cmd+Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      
      // Find the most recently added custom link (it's at index 0 because we used unshift)
      const lastAddedLink = State.links.find(l => l.isNew);
      
      if (lastAddedLink) {
        State.links = State.links.filter(l => l.id !== lastAddedLink.id);
        renderLinkCards();
        updateLinksCount();
        PdfViewer.refresh();
        showToast('Último enlace dibujado deshecho.', 'info');
      }
    }
  });
}

// ── Link Cards ─────────────────────────────────────────────────────────────
function renderLinkCards() {
  const list = DOM.linksList;
  list.innerHTML = '';

  const filtered = getFilteredLinks();

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    if (State.links.length === 0) {
      empty.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"/>
          <path d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.1-1.1"/>
        </svg>
        <p>No se encontraron hipervínculos en este PDF.</p>
      `;
    } else {
      empty.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <p>No hay resultados para la búsqueda actual.</p>
      `;
    }

    list.appendChild(empty);
    return;
  }

  filtered.forEach((link, idx) => {
    const card = createLinkCard(link, idx);
    list.appendChild(card);
  });
}

function createLinkCard(link, idx) {
  const isModified = link.newUrl && link.newUrl.trim() !== '' && link.newUrl !== link.originalUrl;

  const card = document.createElement('div');
  card.className = `link-card ${isModified ? 'modified' : ''}`;
  card.id = `card-${link.id}`;

  card.innerHTML = `
    <div class="link-card-header">
      <span class="link-page-tag">Página ${link.page}</span>
      <span class="link-status ${isModified || link.isNew ? 'changed' : 'original'}">
        ${link.isNew ? '✨ Nuevo' : (isModified ? '✓ Modificado' : 'Sin cambios')}
      </span>
      ${link.isNew ? `
        <button class="btn-delete" title="Eliminar enlace" id="delete-${link.id}" style="margin-left:auto; background:transparent; border:none; color:var(--danger); cursor:pointer; padding:2px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      ` : ''}
    </div>

    <div class="link-label">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
        <path d="M8.75 3.75H12.25V7.25"/>
        <path d="M6.5 9.5L12 4"/>
        <path d="M10 10v3H3V6h3"/>
      </svg>
      URL original
    </div>
    <div class="link-original-url" title="${escapeHtml(link.originalUrl)}">${escapeHtml(truncateUrl(link.originalUrl, 80))}</div>

    <div class="link-label">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
        <path d="M11 5H14V2"/>
        <path d="M2 14L14 2"/>
        <path d="M5 11H2V14"/>
      </svg>
      Nueva URL
    </div>
    <div class="link-new-url-wrapper">
      <textarea
        class="link-new-url-input ${link.newUrl ? 'has-value' : ''}"
        id="input-${link.id}"
        placeholder="Escribe la nueva URL..."
        rows="1"
      >${escapeHtml(link.newUrl || '')}</textarea>
      <button class="btn-revert" title="Revertir cambio" id="revert-${link.id}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 6h8a4 4 0 010 8H6"/>
          <path d="M2 6l3-3M2 6l3 3"/>
        </svg>
      </button>
    </div>
  `;

  // Auto-resize textarea
  const textarea = card.querySelector(`#input-${link.id}`);
  autoResize(textarea);
  textarea.addEventListener('input', () => {
    autoResize(textarea);
    link.newUrl = textarea.value;
    onLinkChange(link, card, textarea);
  });

  // Revert button
  const revertBtn = card.querySelector(`#revert-${link.id}`);
  revertBtn.addEventListener('click', () => {
    link.newUrl = '';
    textarea.value = '';
    textarea.classList.remove('has-value');
    onLinkChange(link, card, textarea);
  });

  // Delete button (only for new links)
  if (link.isNew) {
    const deleteBtn = card.querySelector(`#delete-${link.id}`);
    deleteBtn.addEventListener('click', () => {
      State.links = State.links.filter(l => l.id !== link.id);
      renderLinkCards();
      updateLinksCount();
      PdfViewer.refresh();
      showToast('Enlace eliminado.', 'info');
    });
  }

  return card;
}

function onLinkChange(link, card, textarea) {
  const isModified = link.newUrl && link.newUrl.trim() !== '' && link.newUrl !== link.originalUrl;

  // Update card classes
  card.classList.toggle('modified', isModified || link.isNew);

  // Update status badge
  const statusEl = card.querySelector('.link-status');
  statusEl.className = `link-status ${isModified || link.isNew ? 'changed' : 'original'}`;
  statusEl.textContent = link.isNew ? '✨ Nuevo' : (isModified ? '✓ Modificado' : 'Sin cambios');

  // Update textarea style
  textarea.classList.toggle('has-value', !!link.newUrl);

  // Refresh overlay on viewer
  PdfViewer.refresh();
  updateLinksCount();
}

// ── Search & Filter ────────────────────────────────────────────────────────
function setupSearch() {
  DOM.searchInput.addEventListener('input', e => {
    State.searchQuery = e.target.value.toLowerCase();
    renderLinkCards();
  });
}

function setupFilterTabs() {
  DOM.filterAll.addEventListener('click', () => {
    State.filter = 'all';
    DOM.filterAll.classList.add('active');
    DOM.filterModified.classList.remove('active');
    renderLinkCards();
  });

  DOM.filterModified.addEventListener('click', () => {
    State.filter = 'modified';
    DOM.filterModified.classList.add('active');
    DOM.filterAll.classList.remove('active');
    renderLinkCards();
  });
}

function getFilteredLinks() {
  return State.links.filter(link => {
    const matchesFilter =
      State.filter === 'all' ||
      (State.filter === 'modified' && link.newUrl && link.newUrl !== link.originalUrl);

    const q = State.searchQuery;
    const matchesSearch = !q ||
      link.originalUrl.toLowerCase().includes(q) ||
      (link.newUrl || '').toLowerCase().includes(q);

    return matchesFilter && matchesSearch;
  });
}

function updateLinksCount() {
  const total = State.links.length;
  const modified = State.links.filter(l => l.newUrl && l.newUrl !== l.originalUrl).length;
  DOM.linksCount.textContent = modified > 0 ? `${modified}/${total}` : total;
}

// ── Download ───────────────────────────────────────────────────────────────
function setupDownload() {
  DOM.btnDownload.addEventListener('click', async () => {
    if (!State.pdfDoc) return;

    showLoading('Generando PDF...', 'Aplicando cambios');

    try {
      const compress = DOM.compressCheck.checked;
      const pdfBytes = await applyChangesAndSave(State.pdfDoc, State.links, compress);

      hideLoading();
      downloadPdf(pdfBytes, State.filename, compress);

      const modCount = State.links.filter(l => l.newUrl && l.newUrl !== l.originalUrl).length;
      showToast(`PDF descargado con ${modCount} cambio(s) aplicado(s).`, 'success');

    } catch (err) {
      hideLoading();
      console.error('Error saving PDF:', err);
      showToast('Error al generar el PDF. Intenta de nuevo.', 'error');
    }
  });
}

// ── Compress Checkbox ──────────────────────────────────────────────────────
function setupCompress() {
  DOM.compressOption.addEventListener('click', () => {
    DOM.compressCheck.checked = !DOM.compressCheck.checked;
    DOM.compressOption.classList.toggle('checked', DOM.compressCheck.checked);
    const icon = DOM.compressInner.querySelector('svg');
    if (icon) icon.style.opacity = DOM.compressCheck.checked ? '1' : '0';
  });
}

// ── Loading Overlay ────────────────────────────────────────────────────────
function showLoading(text, sub = '') {
  DOM.loadingText.textContent = text;
  DOM.loadingSub.textContent = sub;
  DOM.loadingOverlay.classList.add('active');
}

function setLoadingText(text, sub = '') {
  DOM.loadingText.textContent = text;
  DOM.loadingSub.textContent = sub;
}

function hideLoading() {
  DOM.loadingOverlay.classList.remove('active');
}

// ── Toast Notifications ────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const iconMap = {
    success: `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`,
    error:   `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`,
    info:    `<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`,
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${iconMap[type] || iconMap.info} <span>${escapeHtml(message)}</span>`;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease both';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Utilities ──────────────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function truncateUrl(url, maxLen) {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen) + '…';
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
