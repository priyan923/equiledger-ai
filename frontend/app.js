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

  // NOTE: state.documents, renderDocuments(), handleFiles(), and requestUpload()
  // used to live here, rendering a second, fake, hardcoded "Imports" list that
  // only partially POSTed to /receipts and never actually read the real list
  // back. That whole embedded #importsView UI + its dead JS has been removed.
  // frontend/import.html + import.js is the one real Imports implementation
  // (full drag/drop, S3 presigned upload, Textract+Gemini polling, manual
  // entry, group vs personal mode) - the Imports nav tab below now just
  // navigates there.
  //
  // Group-mode budget/savingsGoal figures below are still illustrative/demo
  // values - there's no backend concept of a "group budget" yet (that's a
  // Person 1/3 concern for group balances, not part of the Ledger/Imports
  // wiring owned here). Personal-mode numbers are wired to the real
  // GET /ledger and GET /activity endpoints instead of being hardcoded.
  const state = {
    group: { budget: 18560, spent: 10320, savingsGoal: 3120 },
    categories: [
      ['Groceries', 28, '#ead2d0'],
      ['Dining', 22, '#c8cec0'],
      ['Travel', 18, '#7eb382'],
      ['Software', 12, '#d8aaa2'],
      ['Health', 10, '#f5f1ea'],
      ['Other', 10, '#454341']
    ]
  };

  // Cache of the most recent real ledger data so renderMetrics()/renderLedger()
  // can be called independently of the async fetch that populates them.
  let personalLedgerData = { items: [], totals: { spent: 0, income: 0 } };
  let personalActivityData = [];

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

  // --- Real Ledger + Activity data (backend/functions/ledger/app.py) ---

  async function fetchLedger() {
    try {
      const res = await apiFetch('/ledger');
      if (!res.ok) throw new Error(`GET /ledger failed (HTTP ${res.status})`);
      const data = await res.json();
      const totals = data.totals || {};
      return {
        items: data.items || [],
        totals: {
          spent: Number(totals.spent) || 0,
          income: Number(totals.income) || 0
        }
      };
    } catch (err) {
      console.error('Could not load ledger', err);
      return { items: [], totals: { spent: 0, income: 0 } };
    }
  }

  async function fetchActivity() {
    try {
      const res = await apiFetch('/activity');
      if (!res.ok) throw new Error(`GET /activity failed (HTTP ${res.status})`);
      const data = await res.json();
      return data.items || [];
    } catch (err) {
      console.error('Could not load activity feed', err);
      return [];
    }
  }

  async function loadPersonalLedgerData() {
    const [ledger, activity] = await Promise.all([fetchLedger(), fetchActivity()]);
    personalLedgerData = ledger;
    personalActivityData = activity;
  }

  function currentMode() {
    return { key: isGroupModeActive ? 'group' : 'personal' };
  }

  function renderMetrics() {
    if (isGroupModeActive) {
      // Group budget tracking isn't backed by a real endpoint yet - left as
      // illustrative demo numbers, out of scope for the Ledger/Imports wiring.
      const g = state.group;
      const cards = [
        ['Total Group Budget', money.format(g.budget), 'Monthly envelope'],
        ['Group Spent Amount', money.format(g.spent), 'Combined expenses'],
        ['Group Savings Goal', money.format(g.savingsGoal), 'June target'],
        ['Group Savings Left Pool', money.format(g.budget - g.spent - g.savingsGoal), 'Budget - spent - goal']
      ];
      document.querySelector('#metricGrid').innerHTML = cards.map(([label, value, sub], index) => `
        <article class="metric-card">
          <span>${label}</span>
          <strong class="${index === 1 ? 'negative' : index === 3 ? 'positive' : ''}">${value}</strong>
          <p>${sub}</p>
        </article>
      `).join('');
      return;
    }

    // Personal mode: real numbers from GET /ledger's totals.
    const { spent, income } = personalLedgerData.totals;
    const net = income - spent;
    const cards = [
      ['Total Spent', dollar.format(spent), 'From your ledger'],
      ['Total Income', dollar.format(income), 'From your ledger'],
      ['Net Balance', dollar.format(net), 'Income − spent'],
      ['Logged Transactions', String(personalLedgerData.items.length), 'Most recent 50']
    ];
    document.querySelector('#metricGrid').innerHTML = cards.map(([label, value, sub], index) => `
      <article class="metric-card">
        <span>${label}</span>
        <strong class="${index === 0 ? 'negative' : index === 2 ? (net >= 0 ? 'positive' : 'negative') : ''}">${value}</strong>
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
        <h2>${dollar.format(personalLedgerData.totals.income - personalLedgerData.totals.spent)}</h2>
        <p>Net balance · from your ledger</p>
        <div class="split-stats">
          <div><span class="sub-label">Expenses</span><strong class="pink">${dollar.format(personalLedgerData.totals.spent)}</strong></div>
          <div><span class="sub-label">Income</span><strong class="positive">${dollar.format(personalLedgerData.totals.income)}</strong></div>
          <div><span class="sub-label">Transactions</span><strong>${personalLedgerData.items.length}</strong></div>
        </div>
      </article>
      <article class="panel">
        <div class="panel-kicker">Recent activity</div>
        ${
          personalActivityData.length
            ? personalActivityData.slice(0, 5).map(entry => `
              <div class="ai-box">
                <strong>${entry.title || 'Untitled'}</strong> · ${entry.category || 'Uncategorized'}
                <br><span class="sub-label">${entry.createdAt ? new Date(entry.createdAt * 1000).toLocaleDateString() : ''}</span>
                <strong style="float:right">${dollar.format(Number(entry.amount) || 0)}</strong>
              </div>
            `).join('')
            : '<p>No recent activity yet. Log a transaction to see it here.</p>'
        }
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

  // Personal Ledger panel - now backed by real GET /ledger items instead of
  // three hardcoded rows.
  function renderLedger() {
    const rows = personalLedgerData.items.slice(0, 25).map(item => ledgerRow(
      item.createdAt ? new Date(item.createdAt * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
      item.description || 'Untitled',
      item.category || 'Uncategorized',
      item.account || 'You',
      dollar.format(Number(item.amount) || 0),
      (Number(item.amount) || 0) < 0
    )).join('');

    document.querySelector('#ledgerPanel').innerHTML = `
      <h2>Personal Ledger <button class="record-button" style="float:right;width:208px;height:48px">⇩ This Month⌄</button></h2>
      <div class="ledger-head"><span>Date</span><span>Description</span><span>Category</span><span>Account</span><span>Status</span><span>Amount</span></div>
      ${rows || '<p>No transactions logged yet.</p>'}
    `;
  }

  function ledgerRow(date, description, category, account, amount, positive) {
    return `<div class="ledger-row"><span>${date}</span><strong>${description}</strong><span class="badge">${category}</span><span><span class="initials" style="width:32px;height:32px;display:inline-grid;font-size:12px">YO</span> ${account}</span><span class="status">◎ Cleared</span><strong class="${positive ? 'positive' : ''}">${amount}</strong></div>`;
  }

  function renderCategoryBars() {
    document.querySelector('#categoryBars').innerHTML = state.categories.map(([name, pct, color]) => `
      <div class="bar-item" style="color:${color}">
        <span class="dot" style="background:${color}"></span><span>${name}</span><div class="bar-track"><span style="width:${pct * 3}%"></span></div><strong>${pct}%</strong>
      </div>
    `).join('');
  }

  async function updateMode() {

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

    if (!isGroupModeActive) {
        await loadPersonalLedgerData();
    }

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

  function init() {
    if (!token()) {
      console.warn('No Cognito access token found. Keep this redirect in production; comment it during local UI work.');
      // window.location.replace('./index.html');
    }

    document.querySelectorAll('.tab-button').forEach(btn => btn.addEventListener('click', () => {
      // Imports no longer has an embedded view on the dashboard - it always
      // navigates to the real Imports page (frontend/import.html).
      if (btn.dataset.view === 'imports') {
        window.location.assign('./import.html');
        return;
      }
      showView(btn.dataset.view);
    }));
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

    renderCategoryBars();
    loadUserProfile();
    updateMode();
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

  async function loadGroups() {

  const response = await apiFetch("/groups");

  if (!response.ok) {
    return [];
  }

  return await response.json();
}

  init();
})();