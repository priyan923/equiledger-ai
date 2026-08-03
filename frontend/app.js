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

  function currentMode() {
    return { key: isGroupModeActive ? 'group' : 'personal' };
  }

  function renderMetrics() {
    if (isGroupModeActive) {
      const customGroups = JSON.parse(localStorage.getItem('userGroups')) || [];
      let totalOwed = 0;
      customGroups.forEach(g => {
        const numericVal = parseFloat((g.balance || '0').replace(/[^0-9.-]+/g, "")) || 0;
        if (numericVal < 0) totalOwed += Math.abs(numericVal);
      });

      const cards = [
        ['You owe', money.format(totalOwed), 'across your groups'],
        ['Owed to you', money.format(0), 'Active balances'],
        ['Net balance', `-${money.format(totalOwed)}`, 'Current Total'],
        ['Active Groups', String(customGroups.length), 'Total groups']
      ];
      document.querySelector('#metricGrid').innerHTML = cards.map(([label, value, sub], index) => `
        <article class="metric-card">
          <span>${label}</span>
          <strong class="${index === 0 || index === 2 ? 'negative' : index === 1 ? 'positive' : ''}">${value}</strong>
          <p>${sub}</p>
        </article>
      `).join('');
      return;
    }

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

      try {
        const res = await apiFetch('/chat', { 
          method: 'POST',
          body: JSON.stringify({ prompt: message }) 
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.reply || `API Gateway returned ${res.status}`);
        }
        
        const thinkingBubble = document.getElementById(thinkingId);
        if (thinkingBubble) {
          thinkingBubble.innerHTML = `<b>Gemini:</b> ${data.reply || "Done."}`; 
          thinkingBubble.style.color = 'var(--text)';
        }
      } catch (error) {
        console.error("Chat error:", error);
        const thinkingBubble = document.getElementById(thinkingId);
        if (thinkingBubble) {
          thinkingBubble.innerHTML = `<b>System:</b> ⚠️ ${error.message}`;
          thinkingBubble.style.color = '#ff4b4b'; 
        }
      } finally {
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }
    }

    chatSubmit.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keypress', (e) => {
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

  async function renderGroupDashboard() {
    const customGroups = JSON.parse(localStorage.getItem('userGroups')) || [];
    
    let totalOwed = 0;
    customGroups.forEach(g => {
      const numericVal = parseFloat((g.balance || '0').replace(/[^0-9.-]+/g, "")) || 0;
      if (numericVal < 0) totalOwed += Math.abs(numericVal);
    });

    document.querySelector('#dashboardPanels').innerHTML = `
      <article class="metric-card"><span>You owe</span><strong class="negative">₹${Math.round(totalOwed)}</strong><p>across your groups</p></article>
      <article class="metric-card"><span>Owed to you</span><strong class="positive">₹0</strong><p>Active balances</p></article>
      <article class="metric-card"><span>Net balance</span><strong>-₹${Math.round(totalOwed)}</strong><p>Current Total</p></article>
    `;

    const groupCardsHtml = customGroups.length > 0 
      ? customGroups.map(g => groupCard(
          '✈', 
          g.name, 
          (g.members || ['You']).join(', '), 
          g.balance || '₹0', 
          g.transactions || 0,
          g.id
        )).join('')
      : '<p style="color: var(--muted); padding: 10px;">No groups created yet. Click "+ Create Group" in the top header to start one!</p>';

    document.querySelector('#topCategories').innerHTML = `
      <div class="panel-kicker">Your active groups</div>
      <div class="group-cards">
        ${groupCardsHtml}
      </div>
    `;

    document.querySelector('#ledgerPanel').innerHTML = `
      <div class="panel-kicker">Recent group activity</div>
      <div class="activity-list" id="dynamicActivityList">
         <p style="color: var(--muted); padding: 10px;">No recent activity.</p>
      </div>
    `;

    try {
      const res = await apiFetch('/groups/trip-to-goa/splits'); 
      if (res.ok) {
        const data = await res.json();
        const activityList = document.querySelector('#dynamicActivityList');
        
        if (data.activity && data.activity.length > 0) {
          activityList.innerHTML = data.activity.map(item => {
            const dateStr = new Date(item.createdAt * 1000).toLocaleDateString();
            return activity('✓', item.message, `Trip to Goa · ${dateStr}`, '', 'positive');
          }).join('');
        }
      }
    } catch (err) {
      console.error("Could not fetch group activity:", err);
    }
  }

  function groupCard(icon, title, people, balance, tx, groupId) {
    const cls = balance.startsWith('+') ? 'positive' : 'negative';
    return `<article class="group-card" data-group-name="${title}" data-group-id="${groupId}" tabindex="0"><div class="group-icon">${icon}</div><h2>${title}</h2><p>${people}</p><div class="group-meta"><div><span class="sub-label">Balance</span><strong class="${cls}">${balance}</strong></div><div><span class="sub-label">Transactions</span><strong>${tx}</strong></div></div></article>`;
  }

  function activity(initials, title, sub, amount, cls) {
    return `<div class="activity-row"><span class="initials">${initials}</span><div><strong>${title}</strong><p>${sub}</p></div><strong class="${cls}">${amount}</strong></div>`;
  }

  function renderTopCategories() {
    const items = state.categories.map(([name, pct, color]) => `<div class="legend-item"><span class="dot" style="background:${color}"></span><span>${name}</span><strong>${pct}%</strong></div>`).join('');
    document.querySelector('#topCategories').innerHTML = `<div class="panel-kicker">Top categories · Gemini <span style="float:right">↯</span></div><div class="category-layout"><div class="donut"></div><div class="category-legend">${items}</div></div>`;
  }

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
        personalLedgerData = await fetchLedger();
        
        try {
            const actRes = await apiFetch('/activity');
            if (actRes.ok) {
                const actData = await actRes.json();
                personalActivityData = actData.items || [];
            }
        } catch (e) { 
            console.error(e); 
        }
    }

    renderMetrics();

    if (isGroupModeActive) {
        renderGroupDashboard();
        document.querySelectorAll(".group-card").forEach(card => {
            card.onclick = () => {
                sessionStorage.setItem("equiledger.activeGroupId", card.dataset.groupId || 'group_default');
                sessionStorage.setItem("equiledger.activeGroupName", card.dataset.groupName);
                sessionStorage.setItem(
                    "equiledger.activeGroup",
                    JSON.stringify({
                        groupId: card.dataset.groupId || 'group_default',
                        groupName: card.dataset.groupName,
                        members: ["You"]
                    })
                );
                window.location.assign("./import.html");
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
      console.warn('No Cognito access token found.');
    }

    document.querySelectorAll('.tab-button').forEach(btn => btn.addEventListener('click', () => {
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
      document.querySelector("#profileButton").setAttribute("aria-expanded", String(!menu.hidden));
    });

    document.querySelector('#logoutButton').addEventListener('click', () => { sessionStorage.clear(); window.location.assign('./index.html'); });
    
    document.querySelector('#settingsButton')?.addEventListener('click', () => {
      alert('Settings page will be available in the next update.');
    });

    document.querySelector('#recordButton').addEventListener('click', () => {
      window.location.assign("./import.html");
    });

    renderCategoryBars();
    loadUserProfile();
    updateMode();
  }

  init();
})();