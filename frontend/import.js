(function () {
  'use strict';
  
  if (typeof AmazonConfig === 'undefined') {
    console.error("Critical Error: config.js is missing.");
    alert("Application Configuration Missing! Ensure config.js exists.");
    return; 
  }

  const API_CONFIG = {
    baseUrl: AmazonConfig.API_GATEWAY_URL
  };

  const POLL_INTERVAL_MS = 2000;
  const POLL_MAX_ATTEMPTS = 30;

  
  const token = () => sessionStorage.getItem('equiledger.idToken') || '';

  function apiUrl(path) { return `${API_CONFIG.baseUrl.replace(/\/$/, '')}${path}`; }
  const POLL_INTERVAL_MS = 2000;
  const POLL_MAX_ATTEMPTS = 30;

  // FIXED: Changed accessToken to idToken so API Gateway accepts the request!
  const token = () => sessionStorage.getItem('equiledger.idToken') || '';

  function apiUrl(path) { return `${API_CONFIG.baseUrl.replace(/\/$/, '')}${path}`; }

  async function gatewayFetch(path, options = {}) {
    const headers = { 
        Authorization: `Bearer ${token()}`, 
        'Content-Type': 'application/json', 
        ...(options.headers || {}) 
    };
    return fetch(apiUrl(path), { ...options, headers });
  }

  // --- Core Functionality ---

  async function renderDocuments() {
    try {
      const res = await gatewayFetch('/receipts');
      if (!res.ok) return;
      const data = await res.json();
      
      const rows = document.querySelector('#documentRows');
      if (rows && data.receipts) {
        rows.innerHTML = data.receipts.map(r => `
          <div class="document-row">
            <span class="doc-icon">▣</span>
            <div><strong>${r.fileName}</strong><p>${r.meta || 'Uploaded to S3'}</p></div>
            <span class="badge">${r.category || 'Unsorted'}</span>
            <span class="${r.status === 'Error' ? 'negative' : 'positive'}">${r.status === 'Error' ? '⊗' : '◎'} ${r.status}</span>
            <strong>${r.amount ? '$' + r.amount : ''}</strong>
          </div>
        `).join('');
      }
    } catch (e) { console.error("Could not load documents", e); }
  }

  function setScanState(state, message) {
    document.querySelectorAll('.scan-state').forEach(el => el.classList.remove('is-active'));
    const target = document.querySelector(`#scan${state[0].toUpperCase()}${state.slice(1)}`);
    if (target) target.classList.add('is-active');
    
    const statusText = document.querySelector('#scanStatus');
    if (statusText) statusText.textContent = message;
  }

  async function handleScan(file, mode) {
    document.querySelector('#scanOverlay').hidden = false;
    document.querySelector('#recordChoice').hidden = true;
    
    // Updated text to match our new OpenAI architecture
    setScanState('busy', '⚙ Gemini analyzing...');

    try {
      // 1. Upload to S3
      const presign = await gatewayFetch('/receipts/upload-url', { 
        method: 'POST', 
        body: JSON.stringify({ fileName: file.name, contentType: file.type }) 
      }).then(r => r.json());

      await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });

      // Trigger the OCR pipeline
      await gatewayFetch('/receipts', { method: 'POST', body: JSON.stringify({ objectKey: presign.objectKey, fileName: file.name }) });

      // 2. Poll for final data from backend
      let parsed = null;
      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        const res = await gatewayFetch(`/receipts/status?objectKey=${encodeURIComponent(presign.objectKey)}`);
        const data = await res.json();
        
        if (data.status === 'PARSED') {
          parsed = data.parsed;
          break;
        } else if (data.status === 'ERROR') {
          throw new Error('Backend failed to parse the document.');
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      }

      if (!parsed) throw new Error('Parsing timed out');
      
      // Persist data for the Split team
      sessionStorage.setItem('activeBillData', JSON.stringify(parsed));

      // 3. UI Update
      const summary = document.querySelector('#scanDoneSummary');
      if (summary) summary.textContent = `${parsed.items?.length || 0} items extracted · $${parsed.total || '0.00'}`;
      
      setScanState('done', '✓ Parsing complete.');
      
      const assignBtn = document.querySelector('#assignFromScan');
      if (assignBtn) {
        assignBtn.disabled = false;
        assignBtn.onclick = () => { window.location.href = './split.html'; };
      }

    } catch (error) {
      sessionStorage.removeItem('activeBillData');
      setScanState('idle', '⊗ Parsing failed.');
      console.error(error);
      alert('Failed to process the receipt. Check the console for details.');
    }
  }

  // --- Initializers ---

  function initDropzone() {
    const dropZone = document.querySelector('#dropZone');
    const fileInput = document.querySelector('#fileInput');
    const uploadBtn = document.querySelector('#uploadBillPhoto');

    if (!dropZone || !fileInput) return;

    // Open file browser on click
    dropZone.addEventListener('click', () => fileInput.click());
    
    if (uploadBtn) {
      uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent duplicate clicks
        fileInput.click();
      });
    }

    // FIXED: Actually listen for the file selection to trigger the scan!
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleScan(e.target.files[0], 'scan');
      }
    });

    // Drag and Drop support
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    dropZone.addEventListener('dragover', () => dropZone.classList.add('is-over'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'));
    dropZone.addEventListener('drop', (e) => {
      dropZone.classList.remove('is-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleScan(e.dataTransfer.files[0], 'scan');
      }
    });
  }

  function initModals() {
    const recordBtn = document.querySelector('#openRecord');
    const choiceMenu = document.querySelector('#recordChoice');
    const scanOverlay = document.querySelector('#scanOverlay');
    
    if (recordBtn && choiceMenu) {
      recordBtn.addEventListener('click', () => {
        choiceMenu.hidden = !choiceMenu.hidden;
      });
    }

    const chooseScan = document.querySelector('#chooseScan');
    if (chooseScan && scanOverlay) {
      chooseScan.addEventListener('click', () => {
        choiceMenu.hidden = true;
        scanOverlay.hidden = false;
        setScanState('idle', '⚙ Gemini OCR ready · S3 upload on scan');
      });
    }

    const closeScan = document.querySelector('#closeScan');
    const cancelScan = document.querySelector('#cancelScan');
    
    const closeModal = () => {
      if (scanOverlay) scanOverlay.hidden = true;
    };

    if (closeScan) closeScan.addEventListener('click', closeModal);
    if (cancelScan) cancelScan.addEventListener('click', closeModal);
  }

  // Bootstrap
  renderDocuments();
  initDropzone();
  initModals();
})();