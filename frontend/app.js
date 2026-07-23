(function () {
  'use strict';

  if (typeof AmazonConfig === 'undefined') {
    console.error("Critical Error: config.js is missing.");
    alert("Application Configuration Missing! Ensure config.js exists.");
    return; 
  }

  const API_CONFIG = {
    baseUrl: AmazonConfig.API_GATEWAY_URL,
    stage: 'prod'
  };

  function readStoredMode() {
    return sessionStorage.getItem('equiledger.mode') === 'group';
  }

  function writeStoredMode(isGroup) {
    sessionStorage.setItem('equiledger.mode', isGroup ? 'group' : 'personal');
  }

  let isGroupModeActive = readStoredMode();

  const state = {
    personal: { budget: 10842.45, spent: 2340, savingsGoal: 1842 },
    group: { budget: 18560, spent: 10320, savingsGoal: 3120 },
    documents: [
      ['Whole_Foods_Jun20.jpg', 'Whole Foods Market · Jun 20', 'Groceries', 'Parsed', 84.32],
      ['AWS_Invoice_Jun16.pdf', 'Amazon Web Services · Jun 16', 'Dev Tools', 'Parsed', 9.18],
      ['Barcelona_Airbnb.pdf', 'Airbnb · Jun 15', 'Travel', 'Processing...', 340.00],
      ['Restaurant_Goa.jpg', 'Shore Bistro, Goa · Jun 20', 'Dining · Group', 'Parsed', 1323.00],
      ['Chipotle_Jun17.jpg', 'Chipotle via Uber Eats · Jun 17', '', 'Error', 32.47]
    ],
    categories: [
      ['Groceries', 28, '#ead2d0'],
      ['Dining', 22, '#c8cec0'],
      ['Travel', 18, '#7eb382'],
      ['Software', 12, '#d8aaa2'],
      ['Health', 10, '#f5f1ea'],
      ['Other', 10, '#454341']
    ]
  };

  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const dollar = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  function token() {
  return (
    sessionStorage.getItem("equiledger.idToken") ||
    sessionStorage.getItem("idToken") ||
    ""
  );
}

  async function loadUserProfile() {
  try {
    const res = await apiFetch("/profile", {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error("Unable to load profile");
    }

    const profile = await res.json();

    const userName = profile.name || "User";
    const userEmail = profile.email || "";

    const initials = userName
      .split(" ")
      .map(word => word[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();

    document.querySelector("#profileButton").textContent = initials;

    const menu = document.querySelector("#profileMenu");

    menu.querySelector("strong").textContent = userName;
    menu.querySelector("span").textContent = userEmail;

  } catch (err) {
    console.error(err);
  }
}

  async function apiFetch(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const jwt = token();

  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  }

  return fetch(
    `${API_CONFIG.baseUrl.replace(/\/$/, "")}${path}`,
    {
      ...options,
      headers
    }
  );
}

  function currentMode() {
    const key = isGroupModeActive ? 'group' : 'personal';
    const values = state[key];
    return {
      key,
      budget: values.budget,
      spent: values.spent,
      savingsGoal: values.savingsGoal,
      leftPool: values.budget - values.spent - values.savingsGoal
    };
  }

  function renderMetrics() {
    const mode = currentMode();
    const prefix = isGroupModeActive ? 'Group' : 'Personal';
    const format = isGroupModeActive ? money.format : dollar.format;
    const cards = [
      [`Total ${prefix} Budget`, format(mode.budget), 'Monthly envelope'],
      [`${prefix} Spent Amount`, format(mode.spent), isGroupModeActive ? 'Combined expenses' : 'All accounts'],
      [`${prefix} Savings Goal`, format(mode.savingsGoal), 'June target'],
      [`${prefix} Savings Left Pool`, format(mode.leftPool), 'Budget - spent - goal']
    ];

    document.querySelector('#metricGrid').innerHTML = cards.map(([label, value, sub], index) => `
      <article class="metric-card">
        <span>${label}</span>
        <strong class="${index === 1 ? 'negative' : index === 3 ? 'positive' : ''}">${value}</strong>
        <p>${sub}</p>
      </article>
    `).join('');
  }

  function setupAIChat() {
    const chatInput = document.querySelector('#aiChatInput');
    const chatSubmit = document.querySelector('#aiChatSubmit');
    const chatHistory = document.querySelector('#aiChatHistory');

    if (!chatInput || !chatSubmit || !chatHistory) return;

    async function handleSendMessage() {
      const message = chatInput.value.trim();
      if (!message) return;

      chatInput.value = '';
      chatHistory.insertAdjacentHTML('beforeend', `<div class="ai-box" style="background: #1a1916; border: 1px solid var(--line);"><b>You:</b> ${message}</div>`);
      
      const thinkingId = 'think-' + Date.now();
      chatHistory.insertAdjacentHTML('beforeend', `<div id="${thinkingId}" class="ai-box" style="color: var(--muted);"><i>Gemini is analyzing...</i></div>`);
      
      chatHistory.scrollTop = chatHistory.scrollHeight;

      setTimeout(() => {
        const thinkingBubble = document.getElementById(thinkingId);
        if (thinkingBubble) {
          thinkingBubble.innerHTML = `<b>Gemini:</b> I see your query about "${message}". (Backend connection pending AWS access!)`;
          thinkingBubble.style.color = 'var(--text)';
          chatHistory.scrollTop = chatHistory.scrollHeight;
        }
      }, 1500);
    }

    // Clear existing listeners to prevent duplicates if re-rendered
    const newSubmit = chatSubmit.cloneNode(true);
    chatSubmit.parentNode.replaceChild(newSubmit, chatSubmit);
    const newInput = chatInput.cloneNode(true);
    chatInput.parentNode.replaceChild(newInput, chatInput);

    newSubmit.addEventListener('click', handleSendMessage);
    newInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSendMessage();
    });
  }

  function renderPersonalDashboard() {
    document.querySelector('#dashboardPanels').innerHTML = `
      <article class="panel">
        <div class="panel-kicker">Balance overview</div>
        <h2>$6,892<small>.45</small></h2>
        <p>Total balance · all accounts</p>
        <div class="split-stats">
          <div><span class="sub-label">Expenses</span><strong class="pink">$2,340</strong></div>
          <div><span class="sub-label">Left</span><strong class="positive">$2,710</strong></div>
          <div><span class="sub-label">Savings</span><strong>$1,842</strong></div>
        </div>
        <p class="sub-label">Savings Goal <b class="pink" style="float:right">30% / mo</b></p>
        <div class="progress"><span></span></div>
      </article>
      <article class="panel">
        <div class="panel-kicker">Monthly velocity</div>
        <h2>$2,340</h2>
        <p class="positive">↘ -8.4% vs last month</p>
        <svg class="sparkline" viewBox="0 0 520 132"><path d="M0 72 C80 62 110 62 160 74 S240 78 285 54 S390 68 520 88" fill="none" stroke="#ead2d0" stroke-width="3"/><path d="M0 72 C80 62 110 62 160 74 S240 78 285 54 S390 68 520 88 L520 132 L0 132 Z" fill="rgba(234,210,208,.10)"/></svg>
        <div class="split-stats"><div><span class="sub-label">Avg / Day</span><strong>$75.50</strong></div><div></div><div><span class="sub-label">Projected</span><strong>$2,265</strong></div></div>
      </article>
      <article class="panel" style="display: flex; flex-direction: column;">
        <div class="panel-kicker">Gemini Assistant <b class="positive" style="float:right">● live</b></div>
        <div id="aiChatHistory" style="flex: 1; overflow-y: auto; margin-bottom: 10px;">
          <div class="ai-box">about your spending.</div>
          <div class="ai-box">Can I afford a ₹1,800 pair of shoes this month?</div>
          <div class="ai-box"><b>Your June savings buffer is ₹12,710.</b> After fixed end-of-month bills, you'd clear ₹8,510. You can comfortably afford those shoes, though Dining is 12% above average this month.</div>
        </div>
        <div class="chat-row">
          <input id="aiChatInput" placeholder="Ask about your spending...">
          <button id="aiChatSubmit" aria-label="Send">➤</button>
        </div>
      </article>
    `;
    renderTopCategories();
    renderLedger();
  }

  function renderGroupDashboard() {
    document.querySelector('#dashboardPanels').innerHTML = `
      <article class="metric-card"><span>You owe</span><strong class="negative">₹1,580</strong><p>across 2 groups</p></article>
      <article class="metric-card"><span>Owed to you</span><strong class="positive">₹560</strong><p>Trip to Goa</p></article>
      <article class="metric-card"><span>Net balance</span><strong>-₹1,020</strong><p>Jun 2025</p></article>
    `;
    document.querySelector('#topCategories').innerHTML = `
      <div class="panel-kicker">Your active groups</div>
      <div class="group-cards">
        ${groupCard('⌂', 'Roommates', 'Aman, Priya, Dev', '-₹1,240', '14')}
        ${groupCard('✈', 'Trip to Goa', 'Aman, Gargi, Rohan', '+₹560', '8')}
        ${groupCard('▣', 'Work Lunches', 'Aman, Ankit, Sara', '-₹340', '6')}
      </div>
    `;
    document.querySelector('#ledgerPanel').innerHTML = `
      <div class="panel-kicker">Recent group activity</div>
      <div class="activity-list">
        ${activity('AM', 'Aman paid restaurant bill', 'Trip to Goa · Jun 20', '₹1,323', '')}
        ${activity('PS', 'Priya added electricity bill', 'Roommates · Jun 18', '₹2,400', 'positive')}
        ${activity('DV', 'Dev split grocery run', 'Roommates · Jun 16', '₹640', '')}
      </div>
    `;
  }

  function groupCard(icon, title, people, balance, tx) {
    const cls = balance.startsWith('+') ? 'positive' : 'negative';
    return `<article class="group-card" data-group-name="${title}"  tabindex="0"><div class="group-icon">${icon}</div><h2>${title}</h2><p>${people}</p><div class="group-meta"><div><span class="sub-label">Balance</span><strong class="${cls}">${balance}</strong></div><div><span class="sub-label">Transactions</span><strong>${tx}</strong></div></div></article>`;
  }

  function activity(initials, title, sub, amount, cls) {
    return `<div class="activity-row"><span class="initials">${initials}</span><div><strong>${title}</strong><p>${sub}</p></div><strong class="${cls}">${amount}</strong></div>`;
  }

  function renderTopCategories() {
    const items = state.categories.map(([name, pct, color]) => `<div class="legend-item"><span class="dot" style="background:${color}"></span><span>${name}</span><strong>${pct}%</strong></div>`).join('');
    document.querySelector('#topCategories').innerHTML = `<div class="panel-kicker">Top categories · Gemini <span style="float:right">↯</span></div><div class="category-layout"><div class="donut"></div><div class="category-legend">${items}</div></div>`;
  }

  function renderLedger() {
    document.querySelector('#ledgerPanel').innerHTML = `
      <h2>Personal Ledger <button class="record-button" style="float:right;width:208px;height:48px">⇩ This Month⌄</button></h2>
      <div class="ledger-head"><span>Date</span><span>Description</span><span>Category</span><span>Account</span><span>Status</span><span>Amount</span></div>
      ${ledgerRow('Jun 20', 'Whole Foods Market', 'Groceries', 'You', '$84.32', false)}
      ${ledgerRow('Jun 19', 'Netflix', 'Entertainment', 'You', '$15.99', false)}
      ${ledgerRow('Jun 18', 'Salary Deposit', 'Income', 'You', '+$4200.00', true)}
    `;
  }

  function ledgerRow(date, description, category, account, amount, positive) {
    return `<div class="ledger-row"><span>${date}</span><strong>${description}</strong><span class="badge">${category}</span><span><span class="initials" style="width:32px;height:32px;display:inline-grid;font-size:12px">YO</span> ${account}</span><span class="status">◎ Cleared</span><strong class="${positive ? 'positive' : ''}">${amount}</strong></div>`;
  }

  function renderDocuments() {
    document.querySelector('#documentList').innerHTML = state.documents.map(([name, meta, category, status, amount]) => `
      <div class="document-row">
        <span class="doc-icon">▣</span>
        <div><strong>${name}</strong><p>${meta}</p></div>
        <span class="badge">${category}</span>
        <span class="${status === 'Error' ? 'negative' : status === 'Processing...' ? '' : 'positive'}">${status === 'Error' ? '⊗' : '◎'} ${status}</span>
        <strong>${dollar.format(amount)}</strong>
      </div>
    `).join('');
  }

  function renderCategoryBars() {
    document.querySelector('#categoryBars').innerHTML = state.categories.map(([name, pct, color]) => `
      <div class="bar-item" style="color:${color}">
        <span class="dot" style="background:${color}"></span><span>${name}</span><div class="bar-track"><span style="width:${pct * 3}%"></span></div><strong>${pct}%</strong>
      </div>
    `).join('');
  }

  function updateMode() {

    writeStoredMode(isGroupModeActive);

    const title = document.querySelector("#dashboardTitle");
    const subtitle = document.querySelector("#dashboardSubtitle");

    document
        .querySelector("#modeToggle")
        .setAttribute("aria-pressed", String(isGroupModeActive));

    title.textContent = isGroupModeActive
        ? "Group Expense Tracker"
        : "Personal Expense Tracker";

    subtitle.textContent = isGroupModeActive
        ? "June 2025 · Group Workspace · Gemini"
        : "June 2025 · Personal View · Gemini";

    renderMetrics();

    if (isGroupModeActive) {
        renderGroupDashboard();

        document.querySelectorAll(".group-card").forEach(card => {

            card.onclick = () => {

                sessionStorage.setItem(
                    "equiledger.selectedGroup",
                    card.dataset.groupName
                );

                window.location.assign("./split.html");

            };

        });

    } else {

        renderPersonalDashboard();
        setupAIChat();

    }

}

  function showView(view) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('is-active'));
    document.querySelector(`#${view}View`).classList.add('is-active');
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.toggle('is-active', btn.dataset.view === view));
  }

  function consumeIncomingEntries() {
    const raw = sessionStorage.getItem('equiledger.newDocuments');
    if (!raw) return;
    sessionStorage.removeItem('equiledger.newDocuments');
    try {
      const incoming = JSON.parse(raw);
      incoming.forEach(doc => state.documents.unshift(doc));
    } catch (err) {
      console.error('Could not parse incoming documents', err);
    }
  }

  function handleFiles(files) {
    Array.from(files).forEach(file => {
      state.documents.unshift([file.name, `${Math.round(file.size / 1024)} KB · pending upload`, 'Unsorted', 'Processing...', 0]);
    });
    renderDocuments();
    if (!API_CONFIG.baseUrl.includes('YOUR_API')) {
      Array.from(files).forEach(file => requestUpload(file));
    }
  }

  async function requestUpload(file) {
    try {
      const res = await apiFetch('/receipts/upload-url', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream' })
      });
      const { uploadUrl, objectKey } = await res.json();
      await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      await apiFetch('/receipts', { method: 'POST', body: JSON.stringify({ objectKey, fileName: file.name }) });
    } catch (err) {
      console.error('Receipt upload failed', err);
    }
  }
function openGroupSelector(groups) {
    console.log("openGroupSelector called");


    const modal = document.querySelector("#groupModal");
    const list = document.querySelector("#groupList");

    if (!modal || !list) return;

    modal.hidden = true;          // keep hidden until we're ready
    list.innerHTML = "";

    if (!Array.isArray(groups)) {
        groups = [];
    }

    if (groups.length === 0) {

        list.innerHTML = `
            <div class="group-item">
                <strong>No groups found</strong>
                <small>Create your first expense group.</small>
            </div>
        `;

    } else {

        groups.forEach(group => {

            const item = document.createElement("div");
            item.className = "group-item";

            item.innerHTML = `
                <strong>${group.groupName}</strong><br>
                <small>${group.members.length} member${group.members.length === 1 ? "" : "s"}</small>
            `;

            item.onclick = () => {

                sessionStorage.setItem(
                    "equiledger.selectedGroupId",
                    group.groupId
                );

                sessionStorage.setItem(
                    "equiledger.selectedGroup",
                    group.groupName
                );

                modal.hidden = true;

                window.location.assign("./split.html");
            };

            list.appendChild(item);

        });

    }

    document.querySelector("#groupList").hidden = false;
    document.querySelector("#newGroupButton").hidden = false;
    document.querySelector("#createGroupForm").hidden = true;

    modal.hidden = false;      // ONLY opens when this function is called
}

async function createGroup() {

    const groupName = document
        .querySelector("#groupNameInput")
        .value
        .trim();

    const members = document
        .querySelector("#groupMembersInput")
        .value
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);

    if (!groupName) {
        alert("Please enter a group name.");
        return;
    }

    try {

        const response = await apiFetch("/groups", {
            method: "POST",
            body: JSON.stringify({
                groupName,
                members
            })
        });

        if (!response.ok) {
            alert("Failed to create group.");
            return;
        }

        document.querySelector("#groupNameInput").value = "";
        document.querySelector("#groupMembersInput").value = "";

        const groups = await loadGroups();

        openGroupSelector(groups);

    } catch (err) {

        console.error(err);
        alert("Unable to create group.");

    }

}













  async function loadGroups() {

  const response = await apiFetch("/groups");

  if (!response.ok) {
    return [];
  }

  return await response.json();
}
  function init() {
    if (!token()) {
      console.warn('No Cognito access token found. Keep this redirect in production; comment it during local UI work.');
      // window.location.replace('./index.html');
    }

    document.querySelectorAll('.tab-button').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
    document.querySelector('#modeToggle').addEventListener('click', () => { isGroupModeActive = !isGroupModeActive; updateMode(); });
    document.querySelector('#profileButton').addEventListener('click', () => {
      const menu = document.querySelector('#profileMenu');
      menu.hidden = !menu.hidden;
      document.querySelector("#profileButton")
      .setAttribute(
          "aria-expanded",
          String(!menu.hidden)
      );
    });

    document.querySelector('#logoutButton').addEventListener('click', () => { sessionStorage.clear(); window.location.assign('./index.html'); });
    document.querySelector("#closeGroupModal")?.addEventListener("click", () => {
    document.querySelector("#groupModal").hidden = true;
    document.querySelector("#createGroupForm").hidden = true;
    document.querySelector("#groupList").hidden = false;
    document.querySelector("#newGroupButton").hidden = false;
});
    
    document.querySelector("#newGroupButton")
    .addEventListener("click", () => {
    
        document.querySelector("#groupList").hidden = true;
        document.querySelector("#newGroupButton").hidden = true;
    
        document.querySelector("#createGroupForm").hidden = false;
    
    });
    document.querySelector('#settingsButton')?.addEventListener('click', () => {
      // Placeholder until settings page is implemented
      alert('Settings page will be available in the next update.');
    });

    document.querySelector('#recordButton').addEventListener('click', async () => {
        // Personal Expense Tracker
  if (!isGroupModeActive) {
    window.location.assign("./import.html");
    return;
 }
   try {
        const groups = await loadGroups();
        openGroupSelector(groups);
    } catch (err) {
        console.error(err);
        alert("Unable to load groups.");
    }

    });

    const fileInput = document.querySelector('#receiptFile');
    const dropZone = document.querySelector('#dropZone');
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleFiles(fileInput.files));
    ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('is-over'); }));
    dropZone.addEventListener('drop', event => handleFiles(event.dataTransfer.files));

    consumeIncomingEntries();
    renderDocuments();
    renderCategoryBars();
    loadUserProfile();
    updateMode();
  }

  init();
})();