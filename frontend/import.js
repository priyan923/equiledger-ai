(function () {
  'use strict';
  const API_CONFIG = {
  baseUrl: 'https://cx0vxq44ic.execute-api.ap-south-1.amazonaws.com/prod'
};

  const POLL_INTERVAL_MS = 2000;
  const POLL_MAX_ATTEMPTS = 30;

  const token = () => sessionStorage.getItem('equiledger.idToken') || '';
  function currentMode() {
  return sessionStorage.getItem('equiledger.mode') || 'personal';
   }
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
      let url = '/receipts';

if (currentMode() === 'group') {

    const groupId =
        sessionStorage.getItem('equiledger.activeGroupId');

    url += `?mode=group&groupId=${encodeURIComponent(groupId)}`;

} else {

    url += '?mode=personal';

}

const res = await gatewayFetch(url);
      if (!res.ok) return;
      const data = await res.json();
      // GET /receipts (backend/functions/receipts/app.py) returns { items: [...] },
      // not { receipts: [...] } - reading the wrong key here meant this list never
      // rendered (silently swallowed by the catch below).
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

  // The OCR lambda (Textract + Gemini) writes { items: [{name, amount}], subtotal, tax, total }
  // to DynamoDB. split.js expects sessionStorage key 'equiledger.parsedBill' shaped like
  // { groupId, receiptId, subtotal, taxes, items: [{id, emoji, name, amount}], total }.
  // This adapter bridges the two without needing to touch the backend payload shape or
  // rename any of the already-provisioned AWS resources/env vars.
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
      groupId:
      sessionStorage.getItem('equiledger.activeGroupId'),
      receiptId: (file && file.name ? file.name.replace(/\.[^.]+$/, '') : `receipt-${Date.now()}`),
      subtotal: Number(parsed.subtotal) || 0,
      taxes: Number(parsed.tax) || 0,
      total: Number(parsed.total) || 0,
      items
    };
  }

  async function handleScan(file, mode) {
    document.querySelector('#scanOverlay').hidden = false;
    setScanState(
    'busy',
    'Processing receipt...'
    );

    try {
      // 1. Upload to S3[cite: 3]
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

      // Record the receipt so it shows up in the documents list / DynamoDB right away.
      await gatewayFetch('/receipts', {
    method: 'POST',
    body: JSON.stringify({
        objectKey: presign.objectKey,
        fileName: file.name,
        mode,
        groupId:
            mode === 'group'
                ? sessionStorage.getItem('equiledger.activeGroupId')
                : null
    })
});

      // 2. Poll for final data from backend[cite: 3]
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

      // --- Persist data for the Split team, in the shape split.js expects ---
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

sessionStorage.setItem(
    'equiledger.parsedBill',
    JSON.stringify(splitBill)
);


sessionStorage.setItem(
    'activeBillData',
    JSON.stringify(parsed)
);
    
}
     
      // 3. UI Update[cite: 3]
      document.querySelector('#scanDoneSummary').textContent = 
        `${parsed.items?.length || 0} items extracted · ₹${parsed.total}`;
      setScanState('done', '✓ Parsing complete.');
      document.querySelector('#assignFromScan').disabled = false;
      
      // --- Enable navigation to split.html ---
      const assignBtn = document.querySelector('#assignFromScan');
      assignBtn.onclick = () => {

    if (mode === 'group') {

        window.location.href = './split.html';

    } else {

        window.location.href = './dashboard.html';

    }

};
      // -------------------------------------------

      renderDocuments();

    } catch (error) {
      // --- Clear stale data if scan fails ---
      sessionStorage.removeItem('activeBillData');
      sessionStorage.removeItem('equiledger.parsedBill');
      // ------------------------------------------
      setScanState('idle', '⊗ Parsing failed.');
      console.error(error);
    }
  }

  // --- Initializers ---

  function handleFiles(fileList, mode) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    // Scan modal shows one bill at a time; process sequentially so the
    // scan overlay/status reflects each upload in turn.
    files.reduce(
      (chain, file) => chain.then(() => handleScan(file, mode)),
      Promise.resolve()
    );
  }

  // --- Updated Upload Handlers ---
  function initDropzone() {
    const dropZone = document.querySelector('#dropZone');
    const fileInput = document.querySelector('#fileInput');

    // Ensure the drag-and-drop works
    dropZone.addEventListener('click', () => fileInput.click());

    // Actually react to file selection - this was previously missing, which
    // is why nothing happened after picking a file in the OS file dialog.
    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files, currentMode());
      fileInput.value = '';
    });

    // Real drag-and-drop support for the drop zone.
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

    // Explicitly link the upload button (inside the Scan Bill modal) to the file input
    const uploadBtn = document.querySelector('#uploadBillPhoto');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent modal closing
        fileInput.click();
      });
    }
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
      const payload = {
        objectKey: `manual/${Date.now()}`,
        fileName: document.querySelector('#manualDescription').value || 'Manual entry',
        category: document.querySelector('#manualCategory').value || 'Other',
        amount: Number(document.querySelector('#manualAmount').value) || 0,
        mode: currentMode(),
         groupId:
        currentMode() === 'group'
            ? sessionStorage.getItem('equiledger.activeGroupId')
            : null
      };
      try {
        const res = await gatewayFetch('/receipts', { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`);
        manualOverlay.hidden = true;
        renderDocuments();
      } catch (e) {
        console.error('Could not save manual record', e);
        alert('Could not save this record. Check API Gateway/DynamoDB connectivity.');
      }
    });

    // If the user opens the Scan Bill modal directly and clicks "Upload Bill
    // Photo" before ever going through #openRecord, fileInput must already be
    // wired (done in initDropzone), so nothing extra is needed here.
    void fileInput;
  }

  renderDocuments();
  initDropzone();
  initModals();
})();
