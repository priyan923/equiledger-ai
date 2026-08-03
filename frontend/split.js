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
  
  let friends = [];
  let payerId = '';
  let activeFriendId = 'aman';

  async function loadGroupMembers() {
    try {
      const res = await fetch(`${API_CONFIG.baseUrl.replace(/\/$/, '')}/profile`, {
        headers: { Authorization: token() }
      });
      
      if (res.ok) {
        const profile = await res.json();
        payerId = profile.userId || profile.email || 'aman'; 
        
        friends = [
          { id: payerId, name: profile.name || 'You', initials: 'ME', color: 'pink' },
          { id: 'gargi', name: 'Gargi', initials: 'GA', color: 'green' },
          { id: 'rohan', name: 'Rohan', initials: 'RO', color: 'blue' }
        ];
        
        activeFriendId = payerId;
        render(); 
      } else {
          throw new Error("Profile API failed");
      }
    } catch (err) {
      console.error("Failed to load members, falling back to defaults", err);
      payerId = 'aman';
      friends = [
        { id: 'aman', name: 'You', initials: 'ME', color: 'pink' },
        { id: 'gargi', name: 'Gargi', initials: 'GA', color: 'green' }
      ];
      activeFriendId = 'aman';
      render();
    }
  }

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
      activeFriendId = payerId;
    }
    
    render();
  }

  function renderFriends() {
    const friendsHtml = friends.map(friend => {
      const base = baseShareFor(friend.id);
      const selected = activeFriendId === friend.id;
      const subtitle = base > 0 ? rupee(base) : 'Nothing selected';
      const isMe = friend.id === payerId; 
      
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

    document.querySelector('#friendCards').innerHTML = friendsHtml + addFriendHtml;

    document.querySelectorAll('.friend-card[data-id]').forEach(card => {
      card.addEventListener('click', () => {
        activeFriendId = card.dataset.id;
        render();
      });
    });

    document.querySelectorAll('.delete-friend').forEach(btn => {
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

    document.querySelector('#addFriendSubmit').addEventListener('click', submitNewFriend);
    document.querySelector('#newFriendInput').addEventListener('keypress', (event) => {
      if (event.key === 'Enter') submitNewFriend();
    });
  }

  function renderItems() {
    const activeFriend = friends.find(friend => friend.id === activeFriendId) || friends[0];
    if (!activeFriend) return; 

    document.querySelector('#activePrompt').textContent = `${activeFriend.name}, tap your items below`;
    
    document.querySelector('#itemGrid').innerHTML = bill.items.map(item => {
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
    
    const finalizeBtn = document.querySelector('#finalizeSplit');
    if (finalizeBtn) {
        finalizeBtn.classList.toggle('is-ready', count === totalItems);
    }
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

  async function handleFinalize() {
    if (claimedCount() < bill.items.length) {
        alert("Please claim all items before finalizing the split!");
        return;
    }

    const payload = buildSettlementPayload();
    const isLiveApi = !API_CONFIG.baseUrl.includes('YOUR_API');

    if (isLiveApi) {
        try {
            const btn = document.querySelector('#finalizeSplit');
            btn.textContent = "Processing...";
            btn.disabled = true;

            const response = await fetch(`${API_CONFIG.baseUrl.replace(/\/$/, '')}/groups/${payload.groupId}/splits`, {
                method: 'POST',
                headers: {
                    Authorization: token(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`Ledger commit failed with ${response.status}`);
        } catch (err) {
            console.error("Failed to submit split:", err);
            alert("Could not save the ledger. Check your network or API Gateway.");
            const btn = document.querySelector('#finalizeSplit');
            btn.textContent = "Finalize Split";
            btn.disabled = false;
            return;
        }
    }

    // --- Persist calculated balance and transaction count back to localStorage for the Dashboard ---
    const activeGroupId = sessionStorage.getItem('equiledger.activeGroupId');
    let savedGroups = JSON.parse(localStorage.getItem('userGroups')) || [];
    const groupIndex = savedGroups.findIndex(g => g.id === activeGroupId);

    if (groupIndex !== -1) {
        const currentSpent = parseFloat((savedGroups[groupIndex].balance || '0').replace(/[^0-9.-]+/g, "")) || 0;
        const newTotal = currentSpent + Number(bill.total);
        
        savedGroups[groupIndex].balance = `-₹${Math.round(newTotal)}`;
        savedGroups[groupIndex].transactions = (savedGroups[groupIndex].transactions || 0) + 1;
        
        localStorage.setItem('userGroups', JSON.stringify(savedGroups));
    }

    // Force the dashboard to open in Group Mode so they can see their new balances
    sessionStorage.setItem('equiledger.mode', 'group');
    window.location.assign('./dashboard.html');
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

    loadGroupMembers();
  }

  init();
})();