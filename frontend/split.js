(function () {
  'use strict';

  if (typeof AmazonConfig === 'undefined') {
    console.error("Critical Error: config.js is missing.");
    alert("Application Configuration Missing! Ensure config.js exists.");
    return;
  }

  const API_CONFIG = { baseUrl: AmazonConfig.API_GATEWAY_URL };
  const token = () => sessionStorage.getItem('equiledger.idToken') || '';
  const rupee = value => `₹${Math.round(Number(value) || 0)}`;

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

  const bill = JSON.parse(sessionStorage.getItem('equiledger.parsedBill') || 'null') || fallbackBill;
  const assignments = bill.items.map(item => ({ itemId: item.id, friendIds: [] }));
  
  let payerId = 'akansha';
  let activeFriendId = payerId;

  function getInitialFriends() {
    const activeGroupId = sessionStorage.getItem('equiledger.activeGroupId');
    const savedGroups = JSON.parse(localStorage.getItem('userGroups')) || [];
    const currentGroup = savedGroups.find(g => g.id === activeGroupId);

    if (currentGroup && currentGroup.members && currentGroup.members.length > 0) {
      return currentGroup.members.map((memberName, idx) => ({
        id: memberName.toLowerCase().replace(/[^a-z0-9]/g, '') + '-' + idx,
        name: memberName,
        initials: memberName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase(),
        color: idx === 0 ? 'pink' : (idx % 2 === 0 ? 'blue' : 'green')
      }));
    }

    return [
      { id: 'akansha', name: 'Akansha', initials: 'AK', color: 'pink' },
      { id: 'gargi', name: 'Gargi', initials: 'GA', color: 'green' },
      { id: 'rohan', name: 'Rohan', initials: 'RO', color: 'blue' }
    ];
  }

  let friends = getInitialFriends();

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

  function claimedBaseTotal() {
    return assignments.reduce((sum, entry) => {
      if (!entry.friendIds.length) return sum;
      return sum + getItem(entry.itemId).amount;
    }, 0);
  }

  function claimedCount() {
    return assignments.filter(entry => entry.friendIds.length).length;
  }

  function removeFriend(friendId) {
    friends = friends.filter(friend => friend.id !== friendId);
    assignments.forEach(assignment => {
      assignment.friendIds = assignment.friendIds.filter(id => id !== friendId);
    });
    if (activeFriendId === friendId) {
      activeFriendId = friends[0] ? friends[0].id : '';
    }
    render();
  }

  function renderFriends() {
    const container = document.querySelector('#friendCards');
    if (!container) return;

    const friendsHtml = friends.map(friend => {
      const base = baseShareFor(friend.id);
      const selected = activeFriendId === friend.id;
      const subtitle = base > 0 ? rupee(base) : 'Nothing selected';
      const isMe = friend.name.toLowerCase() === 'you' || friend.name.toLowerCase() === 'akansha'; 
      
      const deleteBtn = !isMe ? `<span class="delete-friend" data-id="${friend.id}" style="position: absolute; top: 8px; right: 8px; background: rgba(255, 75, 75, 0.15); color: #ff4b4b; border-radius: 50%; width: 22px; height: 22px; font-size: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-weight: bold;">✕</span>` : '';

      return `
        <button class="friend-card ${selected ? 'is-active' : ''}" data-id="${friend.id}" data-color="${friend.color}" type="button" style="position: relative;">
          <span class="avatar">${friend.initials}</span>
          <span><strong>${friend.name}</strong>${selected ? '<b class="active-pill">Active</b>' : ''}<br><small>${subtitle}</small></span>
          ${deleteBtn}
        </button>
      `;
    }).join('');

    const addFriendHtml = `
      <div class="add-friend-box" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px; border: 1px dashed var(--line); border-radius: 8px;">
        <input type="text" id="newFriendInput" placeholder="Name..." style="background: var(--bg); border: 1px solid var(--line); color: var(--text); border-radius: 4px; padding: 8px; width: 100px; font-size: 14px;">
        <button id="addFriendSubmit" style="background: var(--primary); color: var(--bg); border: none; border-radius: 4px; padding: 8px 12px; font-weight: bold; cursor: pointer;">Add</button>
      </div>
    `;

    container.innerHTML = friendsHtml + addFriendHtml;

    container.querySelectorAll('.friend-card[data-id]').forEach(card => {
      card.addEventListener('click', () => {
        activeFriendId = card.dataset.id;
        render();
      });
    });

    container.querySelectorAll('.delete-friend').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        removeFriend(btn.dataset.id);
      });
    });

    const submitNewFriend = () => {
      const inputEl = document.querySelector('#newFriendInput');
      const name = inputEl.value.trim();
      if (name) {
        const dynamicId = name.toLowerCase().replace(/[^a-z0-9]/g, '') + '-' + Math.floor(Math.random() * 10000);
        friends.push({
          id: dynamicId,
          name: name,
          initials: name.substring(0, 2).toUpperCase(),
          color: 'gray'
        });
        activeFriendId = dynamicId;
        render();
      }
    };

    const submitBtn = document.querySelector('#addFriendSubmit');
    const inputField = document.querySelector('#newFriendInput');
    if (submitBtn) submitBtn.addEventListener('click', submitNewFriend);
    if (inputField) inputField.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') submitNewFriend();
    });
  }

  function renderItems() {
    const activeFriend = friends.find(friend => friend.id === activeFriendId) || friends[0];
    if (!activeFriend) return; 

    const promptEl = document.querySelector('#activePrompt');
    const gridEl = document.querySelector('#itemGrid');
    if (promptEl) promptEl.textContent = `${activeFriend.name}, tap your items below`;
    
    if (gridEl) {
      gridEl.innerHTML = bill.items.map(item => {
        const assignment = getAssignment(item.id);
        const primaryOwner = assignment.friendIds[assignment.friendIds.length - 1] || '';
        const chips = assignment.friendIds.length
          ? assignment.friendIds.map(id => {
              const f = friends.find(friend => friend.id === id);
              return f ? `<span class="owner-chip">${f.name}</span>` : '';
            }).join(' ')
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

      gridEl.querySelectorAll('.item-row').forEach(row => {
        row.addEventListener('click', () => toggleItem(row.dataset.id));
      });
    }
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
    
    const countEl = document.querySelector('#claimedCount');
    const barEl = document.querySelector('#progressBar');
    const totalEl = document.querySelector('#claimedTotal');
    const unclaimedEl = document.querySelector('#unclaimedText');
    const finalizeBtn = document.querySelector('#finalizeSplit');

    if (countEl) countEl.textContent = `${count}/${totalItems} items claimed`;
    if (barEl) barEl.style.width = `${(count / totalItems) * 100}%`;
    if (totalEl) totalEl.textContent = rupee(claimedBaseTotal());
    if (unclaimedEl) unclaimedEl.textContent = `${totalItems - count} items unclaimed`;
    if (finalizeBtn) finalizeBtn.classList.toggle('is-ready', count === totalItems);
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
        payer: friend.id === payerId || friend.name.toLowerCase() === 'akansha' || friend.name.toLowerCase() === 'you'
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

  function handleFinalize() {
    if (claimedCount() < bill.items.length) {
        alert("Please claim all items before finalizing the split!");
        return;
    }

    const payload = buildSettlementPayload();

    let modalOverlay = document.querySelector('#splitSummaryModal');
    if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.id = 'splitSummaryModal';
      modalOverlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 2000;";
      document.body.appendChild(modalOverlay);
    }

    const balancesListHtml = payload.balances.map(b => `
      <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #333;">
        <span><strong>${b.name}</strong></span>
        <span style="color: ${b.finalBalance > 0 ? '#ff4b4b' : '#22c55e'};">₹${Math.round(b.finalBalance)}</span>
      </div>
    `).join('');

    modalOverlay.innerHTML = `
      <div style="background: #161616; border: 1px solid #333; padding: 24px; border-radius: 8px; width: 420px; max-width: 90%; color: #fff; font-family: inherit;">
        <h2 style="margin-top: 0; font-size: 18px;">📊 Bill Settlement Summary</h2>
        <p style="font-size: 13px; color: #888; margin-bottom: 16px;">Here is what each member owes for this bill:</p>
        <div style="max-height: 200px; overflow-y: auto; margin-bottom: 20px;">
          ${balancesListHtml}
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 20px; padding-top: 10px; border-top: 1px solid #444;">
          <span>Total Bill (incl. taxes):</span>
          <span>₹${Math.round(bill.total)}</span>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button id="closeSummaryModal" style="padding: 8px 16px; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button id="confirmAndSaveSplit" style="padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Save to Group Ledger</button>
        </div>
      </div>
    `;

    document.querySelector('#closeSummaryModal').onclick = () => {
      modalOverlay.remove();
    };

    document.querySelector('#confirmAndSaveSplit').onclick = () => {
      const myBalanceObj = payload.balances.find(b => b.payer || b.name.toLowerCase() === 'akansha' || b.name.toLowerCase() === 'you');
      const myShare = myBalanceObj ? myBalanceObj.finalBalance : bill.total;

      const activeGroupId = sessionStorage.getItem('equiledger.activeGroupId');
      let savedGroups = JSON.parse(localStorage.getItem('userGroups')) || [];
      const groupIndex = savedGroups.findIndex(g => g.id === activeGroupId);

      if (groupIndex !== -1) {
          const currentSpent = parseFloat((savedGroups[groupIndex].balance || '0').replace(/[^0-9.-]+/g, "")) || 0;
          const newTotal = currentSpent + Number(myShare);
          
          savedGroups[groupIndex].balance = `-₹${Math.round(newTotal)}`;
          savedGroups[groupIndex].transactions = (savedGroups[groupIndex].transactions || 0) + 1;
          savedGroups[groupIndex].members = payload.balances.map(b => b.name);
          savedGroups[groupIndex].lastBill = payload;
          
          localStorage.setItem('userGroups', JSON.stringify(savedGroups));
      }

      sessionStorage.setItem('equiledger.mode', 'group');
      window.location.assign('./dashboard.html');
    };
  }

  function init() {
    const backBtn = document.querySelector('.close-btn, #backToDashboard');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            sessionStorage.setItem('equiledger.mode', 'group');
            window.location.assign('./dashboard.html');
        });
    }

    const finalizeBtn = document.querySelector('#finalizeSplit');
    if (finalizeBtn) {
        finalizeBtn.addEventListener('click', handleFinalize);
    }

    render();
  }

  init();
})();