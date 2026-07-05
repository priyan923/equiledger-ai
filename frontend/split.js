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

  const fallbackBill = {
    groupId: 'trip-to-goa',
    receiptId: 'restaurant-goa-jun20',
    subtotal: 1260,
    taxes: 63,
    total: 1323,
    items: [
      { id: 'pizza', emoji: '🍕', name: 'Margherita Pizza', amount: 350 },
      { id: 'garlic', emoji: '🥖', name: 'Garlic Bread', amount: 120 },
      { id: 'pasta', emoji: '🍝', name: 'Pasta Arrabbiata', amount: 300 },
      { id: 'drink', emoji: '🥤', name: 'Cold Drink', amount: 120 },
      { id: 'burger', emoji: '🍔', name: 'Chicken Burger', amount: 220 },
      { id: 'fries', emoji: '🍟', name: 'Cheese Fries', amount: 150 }
    ]
  };

  const friends = [
    { id: 'aman', name: 'Aman', initials: 'AM', color: 'pink' },
    { id: 'gargi', name: 'Gargi', initials: 'GA', color: 'green' },
    { id: 'rohan', name: 'Rohan', initials: 'RO', color: 'blue' }
  ];

  const payerId = 'aman';
  const bill = JSON.parse(sessionStorage.getItem('equiledger.parsedBill') || 'null') || fallbackBill;
  const assignments = bill.items.map(item => ({ itemId: item.id, friendIds: [] }));
  let activeFriendId = 'aman';
  let finalPayload = null;

  const rupee = value => `₹${Math.round(value)}`;
  const token = () => sessionStorage.getItem('equiledger.accessToken') || '';

  function getItem(id) {
    return bill.items.find(item => item.id === id);
  }

  function getAssignment(itemId) {
    return assignments.find(entry => entry.itemId === itemId);
  }

  function assignedItemsFor(friendId) {
    return assignments.filter(entry => entry.friendIds.includes(friendId)).map(entry => getItem(entry.itemId));
  }

  function baseShareFor(friendId) {
    return assignments.reduce((sum, entry) => {
      if (!entry.friendIds.includes(friendId) || entry.friendIds.length === 0) return sum;
      return sum + (getItem(entry.itemId).amount / entry.friendIds.length);
    }, 0);
  }

  function finalBalanceFor(friendId) {
    const taxRatio = bill.taxes / bill.subtotal;
    return baseShareFor(friendId) * (1 + taxRatio);
  }

  function claimedBaseTotal() {
    return assignments.reduce((sum, entry) => {
      if (!entry.friendIds.length) return sum;
      return sum + getItem(entry.itemId).amount;
    }, 0);
  }

  function claimedCount() {
    return assignments.filter(entry => entry.friendIds.length).length;
  }

  function renderFriends() {
    document.querySelector('#friendCards').innerHTML = friends.map(friend => {
      const base = baseShareFor(friend.id);
      const selected = activeFriendId === friend.id;
      const subtitle = base > 0 ? rupee(base) : 'Nothing selected';
      return `
        <button class="friend-card ${selected ? 'is-active' : ''}" data-id="${friend.id}" data-color="${friend.color}" type="button">
          <span class="avatar">${friend.initials}</span>
          <span><strong>${friend.name}</strong>${selected ? '<b class="active-pill">Active</b>' : ''}<br><small>${subtitle}</small></span>
        </button>
      `;
    }).join('');

    document.querySelectorAll('.friend-card').forEach(card => {
      card.addEventListener('click', () => {
        activeFriendId = card.dataset.id;
        render();
      });
    });
  }

  function renderItems() {
    const activeFriend = friends.find(friend => friend.id === activeFriendId);
    document.querySelector('#activePrompt').textContent = `${activeFriend.name}, tap your items below`;
    document.querySelector('#itemGrid').innerHTML = bill.items.map(item => {
      const assignment = getAssignment(item.id);
      const primaryOwner = assignment.friendIds[assignment.friendIds.length - 1] || '';
      const chips = assignment.friendIds.length
        ? assignment.friendIds.map(id => `<span class="owner-chip">${friends.find(friend => friend.id === id).name}</span>`).join(' ')
        : '<span class="owner-chip"></span>';
      return `
        <button class="item-row" data-id="${item.id}" ${primaryOwner ? `data-owner="${primaryOwner}"` : ''} type="button">
          <span class="item-emoji">${item.emoji}</span>
          <span><h2>${item.name}</h2><strong>${rupee(item.amount)}</strong><br>${chips}</span>
          <small>${rupee(item.amount)}</small>
          <span class="check">✓</span>
        </button>
      `;
    }).join('');

    document.querySelectorAll('.item-row').forEach(row => {
      row.addEventListener('click', () => toggleItem(row.dataset.id));
    });
  }

  function toggleItem(itemId) {
    const assignment = getAssignment(itemId);
    const existingIndex = assignment.friendIds.indexOf(activeFriendId);
    if (existingIndex >= 0) {
      assignment.friendIds.splice(existingIndex, 1);
    } else {
      assignment.friendIds.push(activeFriendId);
    }
    render();
  }

  function renderFooter() {
    const count = claimedCount();
    const totalItems = bill.items.length;
    document.querySelector('#claimedCount').textContent = `${count}/${totalItems} items claimed`;
    document.querySelector('#progressBar').style.width = `${(count / totalItems) * 100}%`;
    document.querySelector('#claimedTotal').textContent = rupee(claimedBaseTotal());
    document.querySelector('#unclaimedText').textContent = `${totalItems - count} items unclaimed`;
    document.querySelector('#finalizeSplit').classList.toggle('is-ready', count === totalItems);
  }

  function render() {
    renderFriends();
    renderItems();
    renderFooter();
  }

  function buildSettlementPayload() {
    const taxRatio = bill.taxes / bill.subtotal;
    const balances = friends.map(friend => {
      const items = assignedItemsFor(friend.id).map(item => {
        const assignment = getAssignment(item.id);
        return {
          id: item.id,
          name: item.name,
          emoji: item.emoji,
          baseAmount: item.amount,
          sharedBy: assignment.friendIds,
          claimedShare: item.amount / assignment.friendIds.length
        };
      });
      const baseSubtotal = baseShareFor(friend.id);
      const taxShare = baseSubtotal * taxRatio;
      const finalBalance = baseSubtotal + taxShare;
      return {
        friendId: friend.id,
        name: friend.name,
        initials: friend.initials,
        color: friend.color,
        items,
        baseSubtotal,
        taxShare,
        finalBalance,
        payer: friend.id === payerId
      };
    });

    return {
      groupId: bill.groupId,
      receiptId: bill.receiptId,
      payerId,
      subtotal: bill.subtotal,
      taxes: bill.taxes,
      total: bill.total,
      assignments: assignments.map(entry => ({
        itemId: entry.itemId,
        friendIds: [...entry.friendIds]
      })),
      balances,
      createdAt: new Date().toISOString()
    };
  }

  function renderSettlement() {
    finalPayload = buildSettlementPayload();
    document.querySelector('#splitScreen').hidden = true;
    document.querySelector('#settlementScreen').hidden = false;
    document.querySelector('#settlementGrand').textContent = rupee(finalPayload.total);
    document.querySelector('#settlementSubtotal').textContent = rupee(finalPayload.subtotal);
    document.querySelector('#settlementTax').textContent = rupee(finalPayload.taxes);

    document.querySelector('#settlementRows').innerHTML = finalPayload.balances.map(balance => `
      <article class="settlement-row" data-person="${balance.friendId}">
        <span class="avatar">${balance.initials}</span>
        <div>
          <h2>${balance.name}</h2>
          <div>${balance.items.map(item => `<span class="item-pill">${item.emoji} ${item.name}</span>`).join('')}</div>
          <p class="settlement-note">Items: ${rupee(balance.baseSubtotal)} + GST share: ${rupee(balance.taxShare)}</p>
        </div>
        <div class="amount">${rupee(balance.finalBalance)}<p>${balance.payer ? 'paid full bill' : `owes Aman ${rupee(balance.finalBalance)}`}</p></div>
      </article>
    `).join('');

    const settlementLines = finalPayload.balances
      .filter(balance => balance.friendId !== payerId && balance.finalBalance > 0)
      .map(balance => `<div class="summary-line"><span>${balance.name} <b>→</b> Aman</span><strong>${rupee(balance.finalBalance)}</strong></div>`);

    document.querySelector('#settlementSummary').innerHTML = settlementLines.join('');
  }

  function buildDashboardDocumentRow() {
    const payerName = friends.find(friend => friend.id === payerId).name;
    return [
      `${(finalPayload.receiptId || 'group-receipt').replace(/\s+/g, '_')}.jpg`,
      `Shore Bistro, Goa · Paid by ${payerName}`,
      'Dining · Group',
      'Parsed',
      `$${finalPayload.total}`
    ];
  }

  async function commitLedger() {
    if (!finalPayload) finalPayload = buildSettlementPayload();

    const isLiveApi = !API_CONFIG.baseUrl.includes('YOUR_API');
    if (isLiveApi) {
      const response = await fetch(`${API_CONFIG.baseUrl.replace(/\/$/, '')}/groups/${finalPayload.groupId}/splits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(finalPayload)
      });
      if (!response.ok) throw new Error(`Ledger commit failed with ${response.status}`);
    }

    document.querySelector('#settlementScreen').hidden = true;
    document.querySelector('#savedScreen').hidden = false;
  }

  function init() {
    document.querySelector('#finalizeSplit').addEventListener('click', renderSettlement);
    document.querySelector('#discardSettlement').addEventListener('click', () => {
      document.querySelector('#settlementScreen').hidden = true;
      document.querySelector('#splitScreen').hidden = false;
    });
    document.querySelector('#saveLedger').addEventListener('click', () => {
      commitLedger().catch(error => {
        console.error(error);
        alert('Unable to save ledger. Check API Gateway, Cognito token, and DynamoDB permissions.');
      });
    });
    document.querySelector('#backToDashboard').addEventListener('click', () => {
      // Group mode stays active so the dashboard reopens on the Group view,
      // and the freshly-finalized split appears immediately in Imports/Ledger.
      sessionStorage.setItem('equiledger.mode', 'group');
      if (finalPayload) {
        sessionStorage.setItem('equiledger.newDocuments', JSON.stringify([buildDashboardDocumentRow()]));
      }
      window.location.assign('./dashboard.html');
    });
    render();
  }

  init();
})();
