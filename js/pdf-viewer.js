/**
 * pdf-viewer.js
 * Renders PDF pages using PDF.js and draws link-area overlays.
 */

const PdfViewer = (() => {
  let _pdfJsDoc = null;
  let _currentPage = 1;
  let _totalPages = 0;
  let _scale = 1.5;
  let _canvas = null;
  let _canvasWrapper = null;
  let _onPageChange = null;
  let _links = [];

  // Drawing state
  let _isDrawingMode = false;
  let _isDragging = false;
  let _startX = 0;
  let _startY = 0;
  let _rectElement = null;
  let _onNewLinkDrawn = null;
  let _drawingLayer = null;

  /**
   * Load a PDF into PDF.js from an ArrayBuffer.
   * @param {ArrayBuffer} arrayBuffer
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} canvasWrapper
   * @param {Function} onPageChange - called with (currentPage, totalPages)
   */
  async function loadPdf(arrayBuffer, canvas, canvasWrapper, onPageChange) {
    _canvas = canvas;
    _canvasWrapper = canvasWrapper;
    _onPageChange = onPageChange;

    // Clone buffer since PDF.js will consume it
    const dataCopy = arrayBuffer.slice(0);

    const loadingTask = pdfjsLib.getDocument({ data: dataCopy });
    _pdfJsDoc = await loadingTask.promise;

    _totalPages = _pdfJsDoc.numPages;
    _currentPage = 1;

    _drawingLayer = document.getElementById('drawing-layer');
    if (!_drawingLayer.dataset.initialized) {
      setupDrawingListeners();
      _drawingLayer.dataset.initialized = 'true';
    }

    await renderPage(_currentPage);
  }

  /**
   * Render a specific page number.
   * @param {number} pageNum
   */
  async function renderPage(pageNum) {
    if (!_pdfJsDoc) return;
    _currentPage = pageNum;

    const page = await _pdfJsDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: _scale });

    _canvas.height = viewport.height;
    _canvas.width = viewport.width;

    const ctx = _canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Update overlays for this page
    renderLinkOverlays(pageNum, viewport);

    if (_onPageChange) _onPageChange(_currentPage, _totalPages);
  }

  /**
   * Go to previous page.
   */
  async function prevPage() {
    if (_currentPage > 1) {
      await renderPage(_currentPage - 1);
    }
  }

  /**
   * Go to next page.
   */
  async function nextPage() {
    if (_currentPage < _totalPages) {
      await renderPage(_currentPage + 1);
    }
  }

  /**
   * Set the links array for overlay rendering.
   * @param {LinkAnnotation[]} links
   */
  function setLinks(links) {
    _links = links;
  }

  /**
   * Renders colored overlay divs on top of the canvas for each link on the current page.
   * @param {number} pageNum
   * @param {object} viewport - PDF.js viewport
   */
  function renderLinkOverlays(pageNum, viewport) {
    // Remove old overlays
    const old = _canvasWrapper.querySelectorAll('.link-overlay');
    old.forEach(el => el.remove());

    const pageLinks = _links.filter(l => l.page === pageNum);
    const canvasH = _canvas.height;

    pageLinks.forEach(link => {
      const [x1, y1, x2, y2] = link.rect;

      // PDF coordinate: origin at bottom-left; canvas: origin at top-left
      // Transform using viewport scale
      const left   = x1 * _scale;
      const bottom = y1 * _scale;
      const right  = x2 * _scale;
      const top    = y2 * _scale;

      const divLeft   = Math.min(left, right);
      const divTop    = canvasH - Math.max(top, bottom);
      const divWidth  = Math.abs(right - left);
      const divHeight = Math.abs(top - bottom);

      const overlay = document.createElement('div');
      overlay.classList.add('link-overlay');
      if (link.newUrl && link.newUrl !== link.originalUrl) {
        overlay.classList.add('modified');
      }
      overlay.style.left   = `${divLeft}px`;
      overlay.style.top    = `${divTop}px`;
      overlay.style.width  = `${divWidth}px`;
      overlay.style.height = `${divHeight}px`;

      overlay.title = link.newUrl || link.originalUrl;

      // Click: scroll to corresponding link card
      overlay.addEventListener('click', () => {
        const card = document.getElementById(`card-${link.id}`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.outline = `2px solid var(--accent)`;
          setTimeout(() => card.style.outline = '', 1500);
        }
      });

      if (link.isNew) {
        overlay.classList.add('new-link');
      }

      _canvasWrapper.appendChild(overlay);
    });
  }

  /**
   * Setup mouse listeners for the drawing layer
   */
  function setupDrawingListeners() {
    _drawingLayer.addEventListener('mousedown', (e) => {
      if (!_isDrawingMode) return;
      _isDragging = true;
      const rect = _drawingLayer.getBoundingClientRect();
      _startX = e.clientX - rect.left;
      _startY = e.clientY - rect.top;

      _rectElement = document.createElement('div');
      _rectElement.classList.add('drawing-rect');
      _rectElement.style.left = `${_startX}px`;
      _rectElement.style.top = `${_startY}px`;
      _rectElement.style.width = `0px`;
      _rectElement.style.height = `0px`;
      _drawingLayer.appendChild(_rectElement);
    });

    _drawingLayer.addEventListener('mousemove', (e) => {
      if (!_isDragging || !_rectElement) return;
      const rect = _drawingLayer.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      const width = Math.abs(currentX - _startX);
      const height = Math.abs(currentY - _startY);
      const left = Math.min(_startX, currentX);
      const top = Math.min(_startY, currentY);

      _rectElement.style.left = `${left}px`;
      _rectElement.style.top = `${top}px`;
      _rectElement.style.width = `${width}px`;
      _rectElement.style.height = `${height}px`;
    });

    _drawingLayer.addEventListener('mouseup', (e) => {
      if (!_isDragging) return;
      _isDragging = false;

      if (_rectElement) {
        const width = parseFloat(_rectElement.style.width);
        const height = parseFloat(_rectElement.style.height);
        const left = parseFloat(_rectElement.style.left);
        const top = parseFloat(_rectElement.style.top);
        
        _rectElement.remove();
        _rectElement = null;

        // Ignore tiny clicks
        if (width > 5 && height > 5 && _onNewLinkDrawn) {
          // Convert canvas coords back to PDF coords
          // PDF coords: Origin bottom-left
          // Canvas coords: Origin top-left
          const canvasH = _canvas.height;
          
          const pdfLeft = left / _scale;
          const pdfRight = (left + width) / _scale;
          const pdfBottom = (canvasH - (top + height)) / _scale;
          const pdfTop = (canvasH - top) / _scale;

          const pdfRect = [pdfLeft, pdfBottom, pdfRight, pdfTop];
          
          _onNewLinkDrawn(_currentPage, pdfRect);
        }
      }
    });

    _drawingLayer.addEventListener('mouseleave', () => {
      if (_isDragging && _rectElement) {
        _rectElement.remove();
        _rectElement = null;
        _isDragging = false;
      }
    });
  }

  /**
   * Toggle drawing mode
   */
  function toggleDrawingMode(callback) {
    _isDrawingMode = !_isDrawingMode;
    _onNewLinkDrawn = callback;
    
    if (_isDrawingMode) {
      _canvasWrapper.classList.add('is-drawing');
    } else {
      _canvasWrapper.classList.remove('is-drawing');
    }
    
    return _isDrawingMode;
  }

  /**
   * Re-render the current page (e.g., after link status changes).
   */
  async function refresh() {
    if (_pdfJsDoc) {
      const page = await _pdfJsDoc.getPage(_currentPage);
      const viewport = page.getViewport({ scale: _scale });
      renderLinkOverlays(_currentPage, viewport);
    }
  }

  /**
   * Get current state.
   */
  function getState() {
    return { currentPage: _currentPage, totalPages: _totalPages };
  }

  return { loadPdf, prevPage, nextPage, setLinks, refresh, getState, toggleDrawingMode };
})();
