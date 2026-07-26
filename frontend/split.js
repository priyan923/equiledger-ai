(function () {
  'use strict';

  if (typeof AmazonConfig === 'undefined') {
    console.error("Critical Error: config.js is missing.");
    alert("Application Configuration Missing! Ensure config.js exists.");
    return;
  }

  const API_CONFIG = { baseUrl: AmazonConfig.API_GATEWAY_URL };
  const token = () => sessionStorage.getItem('equiledger.idToken') || '';

  function apiUrl(path) {
    return `${API_CONFIG.baseUrl.replace(/\/$/, '')}${path}`;
  }

  async function apiFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {})
    };
    return fetch(apiUrl(path), { ...options, headers });
  }

  const rupee = value => `₹${Math.round(Number(value) || 0)}`;

  const groupId = sessionStorage.getItem('equiledger.activeGroupId');

  let group = null;
  let expenses = [];

  if (!groupId) {
    alert('No group selected. Returning to dashboard.');
    window.location.assign('./dashboard.html');
    return;
  }

  async function loadGroup() {
    const res = await apiFetch(`/groups/${encodeURIComponent(groupId)}`);
    if (!res.ok) throw new Error(`Could not load group (HTTP ${res.status})`);
    group = await res.json();
  }

  async function loadExpenses() {
    const res = await apiFetch(`/expenses?groupId=${encodeURIComponent(groupId)}`);
    if (!res.ok) throw new Error(`Could not load expenses (HTTP ${res.status})`);
    const data = await res.json();
    expenses = data.items || [];
  }

  function computeBalances() {
    const members = group.members || [];
    const net = {};
    members.forEach(m => { net[m] = 0; });

    expenses.forEach(expense => {
      const amount = Number(expense.amount) || 0;
      const share = members.length ? amount / members.length : 0;
      members.forEach(m => {
        net[m] = (net[m] || 0) - share;
      });
      if (expense.paidBy in net) {
        net[expense.paidBy] += amount;
      } else {
        net[expense.paidBy] = amount;
      }
    });

    return net;
  }

  function renderGroupHeader() {
    document.querySelector('#groupTitle').textContent = group.groupName;
    document.querySelector('#groupSubtitle').textContent =
      `${(group.members || []).length} member(s) · ${expenses.length} expense(s)`;
  }

  function renderMembers() {
    document.querySelector('#memberCards').innerHTML = (group.members || []).map(name => `
      <div class="friend-card">
        <span class="avatar">${name.substring(0, 2).toUpperCase()}</span>
        <span><strong>${name}</strong></span>
      </div>
    `).join('');
  }

  function renderBalances() {
    const net = computeBalances();
    document.querySelector('#balanceList').innerHTML = Object.entries(net).map(([name, value]) => {
      const cls = value > 0 ? 'positive' : value < 0 ? 'negative' : '';
      const label = value > 0 ? 'is owed' : value < 0 ? 'owes' : 'is settled';
      return `
        <div class="item-row">
          <span class="item-emoji">👤</span>
          <span><h2>${name}</h2><small>${label}</small></span>
          <strong class="${cls}">${rupee(Math.abs(value))}</strong>
        </div>
      `;
    }).join('');
  }

  function renderExpenses() {
    document.querySelector('#expenseList').innerHTML = expenses.map(expense => `
      <div class="activity-row">
        <span class="initials">${(expense.paidBy || '?').substring(0, 2).toUpperCase()}</span>
        <div>
          <strong>${expense.description}</strong>
          <p>Paid by ${expense.paidBy} · split equally</p>
        </div>
        <strong>${rupee(expense.amount)}</strong>
        <button type="button" data-sk="${expense.sk}" class="delete-expense">✕</button>
      </div>
    `).join('');

    document.querySelectorAll('.delete-expense').forEach(btn => {
      btn.addEventListener('click', () => deleteExpense(btn.dataset.sk));
    });
  }

  function populatePaidBySelect() {
    document.querySelector('#expensePaidBy').innerHTML = (group.members || [])
      .map(name => `<option value="${name}">${name}</option>`)
      .join('');
  }

  function renderAll() {
    renderGroupHeader();
    renderMembers();
    renderBalances();
    renderExpenses();
    populatePaidBySelect();
  }

  async function refresh() {
    await loadExpenses();
    renderAll();
  }

  async function saveExpense() {
    const description = document.querySelector('#expenseDescription').value.trim();
    const amount = Number(document.querySelector('#expenseAmount').value);
    const paidBy = document.querySelector('#expensePaidBy').value;
    const splitType = document.querySelector('#expenseSplitType').value;

    if (!description || !amount || !paidBy) {
      alert('Please fill in description, amount, and who paid.');
      return;
    }

    try {
      const res = await apiFetch('/expenses', {
        method: 'POST',
        body: JSON.stringify({ groupId, description, amount, paidBy, splitType })
      });
      if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`);

      document.querySelector('#expenseDescription').value = '';
      document.querySelector('#expenseAmount').value = '';
      document.querySelector('#addExpenseOverlay').hidden = true;

      await refresh();
    } catch (err) {
      console.error(err);
      alert('Could not save expense. Check API Gateway/DynamoDB connectivity.');
    }
  }

  async function deleteExpense(sk) {
    if (!sk) return;
    if (!confirm('Delete this expense?')) return;
    try {
      const res = await apiFetch('/expenses', {
        method: 'DELETE',
        body: JSON.stringify({ groupId, sk })
      });
      if (!res.ok) throw new Error(`Delete failed (HTTP ${res.status})`);
      await refresh();
    } catch (err) {
      console.error(err);
      alert('Could not delete expense.');
    }
  }

  function initModal() {
    document.querySelector('#addExpenseBtn').addEventListener('click', () => {
      document.querySelector('#addExpenseOverlay').hidden = false;
    });
    document.querySelector('#closeAddExpense').addEventListener('click', () => {
      document.querySelector('#addExpenseOverlay').hidden = true;
    });
    document.querySelector('#cancelAddExpense').addEventListener('click', () => {
      document.querySelector('#addExpenseOverlay').hidden = true;
    });
    document.querySelector('#saveExpense').addEventListener('click', saveExpense);
  }

  function initNav() {
    document.querySelector('#backToDashboard').addEventListener('click', () => {
      sessionStorage.setItem('equiledger.mode', 'group');
      window.location.assign('./dashboard.html');
    });
  }

  async function init() {
    try {
      await loadGroup();
      await loadExpenses();
      renderAll();
    } catch (err) {
      console.error(err);
      alert('Could not load this group. Returning to dashboard.');
      window.location.assign('./dashboard.html');
      return;
    }
    initModal();
    initNav();
  }

  init();
})();