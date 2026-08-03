document.addEventListener('DOMContentLoaded', () => {
    const memberList = document.getElementById('memberList');
    const addMemberBtn = document.getElementById('addMember');
    const continueBtn = document.getElementById('continueButton');
    const groupNameInput = document.getElementById('groupName');

    // Function to add a member input row
    function addMemberRow(name = '') {
        const row = document.createElement('div');
        row.className = 'member-row';
        row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px;';
        
        row.innerHTML = `
            <input type="text" class="group-input member-name-input" placeholder="Member name" value="${name}" style="flex: 1; padding: 10px; background: #111; border: 1px solid #444; color: #fff; border-radius: 4px;">
            <button type="button" class="group-btn remove-member-btn" style="background: #e74c3c; color: #fff; border: none; padding: 0 15px; border-radius: 4px; cursor: pointer;">X</button>
        `;

        row.querySelector('.remove-member-btn').addEventListener('click', () => {
            row.remove();
        });

        memberList.appendChild(row);
    }

    // Add initial default member row if empty
    if (memberList && memberList.children.length === 0) {
        addMemberRow('You');
    }

    addMemberBtn?.addEventListener('click', () => {
        addMemberRow();
    });

    // Save group, members, and route straight to import page
    continueBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();

        const groupName = groupNameInput.value.trim();
        if (!groupName) {
            alert('Please enter a group name.');
            return;
        }

        const members = Array.from(document.querySelectorAll('.member-name-input'))
            .map(input => input.value.trim())
            .filter(name => name.length > 0);

        if (members.length === 0) {
            alert('Please add at least one member.');
            return;
        }

        const groupId = 'group_' + Date.now();
        const groupData = {
            id: groupId,
            name: groupName,
            members: members,
            balance: '₹0',
            transactions: 0
        };

        // 1. Save active group identifiers for the scanner & dropdowns
        sessionStorage.setItem('equiledger.activeGroupId', groupId);
        sessionStorage.setItem('equiledger.activeGroupName', groupName);
        sessionStorage.setItem('equiledger.mode', 'group');
        localStorage.setItem('activeGroup', JSON.stringify(groupData));
        
        // 2. Push into your userGroups array so it persists on the dashboard
        let savedGroups = JSON.parse(localStorage.getItem('userGroups')) || [];
        savedGroups.push(groupData);
        localStorage.setItem('userGroups', JSON.stringify(savedGroups));
        
        alert(`Group "${groupName}" created successfully!`);
        
        // 3. Force direct navigation to import page
        window.location.replace('./import.html');
    }, true);
});