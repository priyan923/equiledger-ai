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
  
  // FIX: Added the missing currentMode helper function
  function currentMode() {
    return sessionStorage.getItem('equiledger.mode') === 'group' ? 'group' : 'personal';
  }
  
  function apiUrl(path) { return `${API_CONFIG.baseUrl.replace(/\/$/, '')}${path}`; }

  async function gatewayFetch(path, options = {}) {
    const headers = { 
        Authorization: token(), 
        'Content-Type': 'application/json', 
        ...(options.headers || {}) 
    };
    return fetch(apiUrl(path), { ...options, headers });
  }

  async function postLedgerEntry({ description, amount, category, account, mode }) {
    try {
      const res = await gatewayFetch('/ledger', {
        method: 'POST',
        body: JSON.stringify({
          description: description || 'Untitled transaction',
          amount: Number(amount) || 0,
          category: category || 'Uncategorized',
          account: account || 'You',
          mode: mode || currentMode()
        })
      });
      if (!res.ok) throw new Error(`Ledger post failed (HTTP ${res.status})`);
      return await res.json();
    } catch (e) {
      console.error('Could not record ledger transaction', e);
      return null;
    }
  }

  // --- Core Functionality ---

  async function renderDocuments() {
    try {
      let url = '/receipts';

      if (currentMode() === 'group') {
          const groupId = sessionStorage.getItem('equiledger.activeGroupId');
          url += `?mode=group&groupId=${encodeURIComponent(groupId)}`;
      } else {
          url += '?mode=personal';
      }

      const res = await gatewayFetch(url);
      if (!res.ok) return;
      
      const data = await res.json();
      
      document.querySelector('#documentRows').innerHTML = (data.items || []).map(r => {
        const meta = [r.createdAt ? new Date(r.createdAt * 1000).toLocaleDateString() : null, r.groupId]
          .filter(Boolean).join(' · ');
        return `
        <div class="document-row">
          <span class="doc-icon">▣</span>
          <div><strong>${r.fileName}</strong><p>${meta}</p></div>
          <span class="badge">${r.category}</span>
          <span class="positive">◎ ${r.status}</span>
          <strong>${r.amount != null ? '₹' + r.amount : ''}</strong>
        </div>
      `;
      }).join('');
    } catch (e) { console.error("Could not load documents", e); }
  }

  function setScanState(state, message) {
    document.querySelectorAll('.scan-state').forEach(el => el.classList.remove('is-active'));
    const target = document.querySelector(`#scan${state[0].toUpperCase()}${state.slice(1)}`);
    if (target) target.classList.add('is-active');
    document.querySelector('#scanStatus').textContent = message;
  }

  function toSplitBillShape(parsed, file) {
    const slugify = (text, index) => (text || `item-${index}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `item-${index}`;

    const items = (parsed.items || []).map((item, index) => ({
      id: slugify(item.name, index),
      emoji: '🧾',
      name: item.name,
      amount: Number(item.amount) || 0
    }));

    return {
      groupId: sessionStorage.getItem('equiledger.activeGroupId'),
      receiptId: (file && file.name ? file.name.replace(/\.[^.]+$/, '') : `receipt-${Date.now()}`),
      subtotal: Number(parsed.subtotal) || 0,
      taxes: Number(parsed.tax) || 0,
      total: Number(parsed.total) || 0,
      items
    };
  }

  async function handleScan(file, mode) {
    document.querySelector('#scanOverlay').hidden = false;
    setScanState('busy', 'Processing receipt...');

    try {
      // 1. Upload to S3
      const presignRes = await gatewayFetch('/receipts/upload-url', { 
        method: 'POST', 
        body: JSON.stringify({ fileName: file.name, contentType: file.type }) 
      });
      if (!presignRes.ok) throw new Error(`Could not get an upload URL (HTTP ${presignRes.status})`);
      const presign = await presignRes.json();

      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      });
      if (!putRes.ok) throw new Error(`S3 upload failed (HTTP ${putRes.status})`);

      await gatewayFetch('/receipts', {
        method: 'POST',
        body: JSON.stringify({
            objectKey: presign.objectKey,
            fileName: file.name,
            mode,
            groupId: mode === 'group' ? sessionStorage.getItem('equiledger.activeGroupId') : null
        })
      });

      // 2. Poll for final data from backend
      let parsed = null;
      let failed = false;
      
      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        const res = await gatewayFetch(`/receipts/status?objectKey=${encodeURIComponent(presign.objectKey)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'PARSED') {
            parsed = data.parsed;
            break;
          }
          if (data.status === 'FAILED') {
            failed = true;
            console.error('OCR failed:', data.error);
            break;
          }
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      }

      if (failed) throw new Error('Textract/Gemini could not parse this receipt');
      if (!parsed) throw new Error('Parsing timed out');

      // --- Persist data for the Split team ---
      const splitBill = toSplitBillShape(parsed, file);

      if (mode === 'group') {
          const activeGroup = sessionStorage.getItem('equiledger.activeGroupId');
          if (!activeGroup) {
              document.querySelector('#scanOverlay').hidden = true;
              alert("Please create or select a group first.");
              return;
          }
          splitBill.groupId = activeGroup;
      }

      sessionStorage.setItem('equiledger.parsedBill', JSON.stringify(splitBill));
      sessionStorage.setItem('activeBillData', JSON.stringify(parsed));

      if (mode !== 'group') {
        await postLedgerEntry({
          description: file.name.replace(/\.[^.]+$/, '') || 'Scanned receipt',
          amount: parsed.total,
          category: 'Unsorted',
          account: 'You',
          mode
        });
      }

      // 3. UI Update
      document.querySelector('#scanDoneSummary').textContent = 
        `${parsed.items?.length || 0} items extracted · ₹${parsed.total}`;
      setScanState('done', '✓ Parsing complete.');
      document.querySelector('#assignFromScan').disabled = false;
      
      // --- Enable navigation to split.html ---
      const assignBtn = document.querySelector('#assignFromScan');
      assignBtn.onclick = () => {
          window.location.href = './split.html';
      };

      renderDocuments();

    } catch (error) {
      sessionStorage.removeItem('activeBillData');
      sessionStorage.removeItem('equiledger.parsedBill');
      setScanState('idle', '⊗ Parsing failed.');
      console.error(error);
    }
  }

  // --- Initializers ---

  function handleFiles(fileList, mode) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    files.reduce(
      (chain, file) => chain.then(() => handleScan(file, mode)),
      Promise.resolve()
    );
  }

  function initDropzone() {
    const dropZone = document.querySelector('#dropZone');
    const fileInput = document.querySelector('#fileInput');

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files, currentMode());
      fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add('is-dragover');
      });
    });
    
    ['dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.remove('is-dragover');
      });
    });
    
    dropZone.addEventListener('drop', (e) => {
      handleFiles(e.dataTransfer?.files, currentMode());
    });

    const uploadBtn = document.querySelector('#uploadBillPhoto');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }
  }

  function initManualDateDefault() {
    const dateInput = document.querySelector('#manualDate');
    if (!dateInput) return;
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    dateInput.value = iso;
  }

  function initModals() {
    const recordChoice = document.querySelector('#recordChoice');
    const manualOverlay = document.querySelector('#manualOverlay');
    const scanOverlay = document.querySelector('#scanOverlay');
    const fileInput = document.querySelector('#fileInput');

    document.querySelector('#openRecord').addEventListener('click', () => {
      recordChoice.hidden = false;
    });

    document.querySelector('#chooseManual').addEventListener('click', () => {
      recordChoice.hidden = true;
      initManualDateDefault();
      manualOverlay.hidden = false;
    });

    document.querySelector('#chooseScan').addEventListener('click', () => {
      recordChoice.hidden = true;
      scanOverlay.hidden = false;
    });

    document.querySelector('#closeManual').addEventListener('click', () => { manualOverlay.hidden = true; });
    document.querySelector('#cancelManual').addEventListener('click', () => { manualOverlay.hidden = true; });

    document.querySelector('#closeScan').addEventListener('click', () => { scanOverlay.hidden = true; });
    document.querySelector('#cancelScan').addEventListener('click', () => { scanOverlay.hidden = true; });

    document.querySelector('#saveManualRecord').addEventListener('click', async () => {
      const description = document.querySelector('#manualDescription').value || 'Manual entry';
      const category = document.querySelector('#manualCategory').value || 'Other';
      const amount = Number(document.querySelector('#manualAmount').value) || 0;
      const date = document.querySelector('#manualDate').value || new Date().toISOString().slice(0, 10);
      const mode = currentMode();
      const groupId = mode === 'group' ? sessionStorage.getItem('equiledger.activeGroupId') : null;

      const payload = {
        objectKey: `manual/${Date.now()}`,
        fileName: description,
        category,
        amount,
        date,
        mode,
        groupId
      };
      
      try {
        const res = await gatewayFetch('/receipts', { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`);

        await postLedgerEntry({ description, amount, category, account: 'You', mode });

        manualOverlay.hidden = true;
        renderDocuments();
      } catch (e) {
        console.error('Could not save manual record', e);
        alert('Could not save this record. Check API Gateway/DynamoDB connectivity.');
      }
    });
  }

  renderDocuments();
  initDropzone();
  initModals();
  initManualDateDefault();
})();