// Data Storage Keys
const STORAGE_KEY_MEMBERS = 'club_members';
const STORAGE_KEY_ATTENDANCE = 'club_attendance';
const STORAGE_KEY_RECEIPT_INDEX = 'club_receipt_index';
const STORAGE_KEY_GAS_URL = 'club_gas_url';

// State Variables
let members = JSON.parse(localStorage.getItem(STORAGE_KEY_MEMBERS)) || [];
let attendance = JSON.parse(localStorage.getItem(STORAGE_KEY_ATTENDANCE)) || {};
let receiptIndex = parseInt(localStorage.getItem(STORAGE_KEY_RECEIPT_INDEX)) || 1;
let gasUrl = localStorage.getItem(STORAGE_KEY_GAS_URL) || '';

// DOM Elements
const dateInput = document.getElementById('class-date');
const statAttendance = document.getElementById('stat-attendance');
const statReceived = document.getElementById('stat-received');
const statPending = document.getElementById('stat-pending');
const unpaidBadgeCount = document.getElementById('unpaid-badge-count');
const unpaidList = document.getElementById('unpaid-list');
const memberSearch = document.getElementById('member-search');
const attendanceTableBody = document.getElementById('attendance-table-body');
const addMemberForm = document.getElementById('add-member-form');
const newMemberName = document.getElementById('new-member-name');
const newMemberPhone = document.getElementById('new-member-phone'); // mapped to Student ID in UI
const newMemberPlan = document.getElementById('new-member-plan');
const totalMembersCount = document.getElementById('total-members-count');
const memberList = document.getElementById('member-list');
const btnCheckAll = document.getElementById('btn-check-all');
const syncStatusIndicator = document.getElementById('sync-status-indicator');

// Cloud Config Elements
const inputGasUrl = document.getElementById('input-gas-url');
const btnSaveGas = document.getElementById('btn-save-gas');

// Self Check-in Portal Elements
const btnShowQr = document.getElementById('btn-show-qr');
const qrModal = document.getElementById('qr-modal');
const btnCloseQrModal = document.getElementById('btn-close-qr-modal');
const qrImage = document.getElementById('qr-image');
const qrLinkText = document.getElementById('qr-link-text');

// Backup Buttons
const btnExportCsv = document.getElementById('btn-export-csv');
const btnExportBackup = document.getElementById('btn-export-backup');
const importBackupFile = document.getElementById('import-backup-file');
const btnClearData = document.getElementById('btn-clear-data');

// Modal Elements
const receiptModal = document.getElementById('receipt-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnShareReceipt = document.getElementById('btn-share-receipt');
const btnDownloadReceipt = document.getElementById('btn-download-receipt');
const btnPrintReceipt = document.getElementById('btn-print-receipt');
const receiptCanvas = document.getElementById('receipt-canvas');

// Class Fee Settings
const SINGLE_FEE_AMOUNT = 50;
const UNLIMITED_FEE_AMOUNT = 1000;

// Default Receipt Settings
const DEFAULT_TAX_ID = '03395880';
const DEFAULT_ADDRESS = '花蓮縣壽豐鄉志學村大學路二段1號C122';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  // Set default date to today (local timezone YYYY-MM-DD)
  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  dateInput.value = today;

  // Load cloud configurations
  if (inputGasUrl) {
    inputGasUrl.value = gasUrl;
  }

  // Listeners
  dateInput.addEventListener('change', render);
  memberSearch.addEventListener('input', renderAttendanceTable);
  addMemberForm.addEventListener('submit', handleAddMember);
  btnCheckAll.addEventListener('click', handleCheckAll);
  
  if (btnSaveGas) {
    btnSaveGas.addEventListener('click', handleSaveGas);
  }

  // QR Code Modal listeners
  if (btnShowQr) {
    btnShowQr.addEventListener('click', openQrModal);
  }
  if (btnCloseQrModal) {
    btnCloseQrModal.addEventListener('click', () => qrModal.classList.add('hidden'));
  }
  if (qrModal) {
    qrModal.addEventListener('click', (e) => {
      if (e.target === qrModal) qrModal.classList.add('hidden');
    });
  }

  // Backup events
  btnExportCsv.addEventListener('click', exportToCSV);
  btnExportBackup.addEventListener('click', exportBackupJSON);
  importBackupFile.addEventListener('change', importBackupJSON);
  btnClearData.addEventListener('click', clearAllData);

  // Modal events
  btnCloseModal.addEventListener('click', () => receiptModal.classList.add('hidden'));
  receiptModal.addEventListener('click', (e) => {
    if (e.target === receiptModal) receiptModal.classList.add('hidden');
  });

  // Load Initial Data
  render();
  lucide.createIcons();

  // Try to sync with cloud on startup
  if (gasUrl) {
    fetchCloudData();
  }

  // Set up periodic cloud synchronization (every 10 seconds)
  setInterval(() => {
    if (gasUrl) {
      fetchCloudData(true); // silent background fetch
    }
  }, 10000);
});

// Helper: Save data to localStorage
function saveState() {
  localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(members));
  localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(attendance));
  localStorage.setItem(STORAGE_KEY_RECEIPT_INDEX, receiptIndex.toString());
}

// Render everything based on selected date
function render() {
  renderStats();
  renderAttendanceTable();
  renderUnpaidList();
  renderMemberList();
  
  // Update counts
  totalMembersCount.textContent = members.length;
  lucide.createIcons();
}

// Get Attendance Data for Selected Date
function getSelectedDate() {
  return dateInput.value;
}

// Get attendance record list for a specific date
function getAttendanceData(date) {
  if (!attendance[date]) {
    attendance[date] = {};
  }
  return attendance[date];
}

// Helper: Get chronological order index of a member's check-in for a given date (1-indexed)
function getAttendanceOrderIndex(memberId, date) {
  const dates = Object.keys(attendance).filter(d => {
    return attendance[d] && attendance[d][memberId] && attendance[d][memberId].present;
  });
  dates.sort();
  const index = dates.indexOf(date);
  return index !== -1 ? index + 1 : 1;
}

// Helper: Get total attendance count of a member across all dates
function getTotalAttendanceCount(memberId) {
  let count = 0;
  Object.keys(attendance).forEach(d => {
    if (attendance[d] && attendance[d][memberId] && attendance[d][memberId].present) {
      count++;
    }
  });
  return count;
}

// Save GAS cloud configuration
function handleSaveGas() {
  const urlVal = inputGasUrl.value.trim();
  gasUrl = urlVal;
  localStorage.setItem(STORAGE_KEY_GAS_URL, gasUrl);
  alert('雲端串接網址已儲存！確認收款或簽到時將自動進行同步。');
  fetchCloudData();
}

// Fetch member and checkin lists from Google Sheet
async function fetchCloudData(silent = false) {
  if (!gasUrl) return;

  if (!silent) {
    updateSyncIndicator('loading', '同步中...');
  }

  try {
    const response = await fetch(`${gasUrl}?action=getData`);
    const result = await response.json();
    
    if (result.status === 'success') {
      members = result.members || [];
      attendance = result.attendance || {};
      saveState();
      render();
      updateSyncIndicator('connected', '雲端同步中 (已連線)');
    } else {
      updateSyncIndicator('error', '失敗: ' + result.message);
    }
  } catch (err) {
    console.error("Cloud fetch failed:", err);
    updateSyncIndicator('error', '連線失敗: ' + err.message);
  }
}

// Update the sync status indicator in header
function updateSyncIndicator(status, text) {
  if (!syncStatusIndicator) return;
  
  let icon = 'cloud-off';
  let badgeClass = 'badge-outline';
  
  if (status === 'loading') {
    icon = 'loader';
    badgeClass = 'badge-warning';
  } else if (status === 'connected') {
    icon = 'cloud-lightning';
    badgeClass = 'badge-success';
  } else if (status === 'error') {
    icon = 'alert-circle';
    badgeClass = 'badge-danger';
  }

  syncStatusIndicator.className = `badge ${badgeClass}`;
  syncStatusIndicator.style.marginLeft = '10px';
  syncStatusIndicator.innerHTML = `<i data-lucide="${icon}" style="width: 14px; height: 14px; margin-right: 4px;"></i> ${text}`;
  lucide.createIcons();
}

// Open QR Code Modal for Mobile Self Check-in
function openQrModal() {
  if (!gasUrl) {
    alert('請先在設定中輸入並儲存「Google Apps Script Web App URL」！');
    return;
  }

  qrModal.classList.remove('hidden');

  // Compute checkin URL
  const currentUrl = window.location.href;
  let baseFolder = currentUrl.substring(0, currentUrl.lastIndexOf('/'));
  
  // Handle local file testing folder fallback
  if (baseFolder.startsWith('file:///')) {
    baseFolder = 'https://411432043-spec.github.io/club-fee-app'; // production URL
  }
  
  const checkinUrl = `${baseFolder}/checkin.html?gas=${encodeURIComponent(gasUrl)}&mode=mobile`;
  
  qrLinkText.href = checkinUrl;
  qrLinkText.textContent = checkinUrl;
  
  // Load QR image from API
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(checkinUrl)}`;
}

// Post action to Apps Script Webapp in background
async function postToCloud(action, payload) {
  if (!gasUrl) return;
  payload.action = action;

  try {
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    console.log(`Cloud sync success for action: ${action}`);
  } catch (err) {
    console.error(`Cloud sync failed for action: ${action}`, err);
  }
}

// Render Dashboard Statistics
function renderStats() {
  const date = getSelectedDate();
  const dateData = getAttendanceData(date);
  
  let checkedInCount = 0;
  let receivedAmount = 0;
  let pendingAmount = 0;

  // 1. Calculate received amount from all payments made on this specific date
  // A: Class fee receipts on this date
  members.forEach(member => {
    const record = dateData[member.id];
    if (record && record.present) {
      checkedInCount++;
      if (member.plan === 'single' && record.paid) {
        const orderIdx = getAttendanceOrderIndex(member.id, date);
        if (orderIdx >= 4) {
          receivedAmount += SINGLE_FEE_AMOUNT;
        }
      }
    }
    // B: Unlimited plan subscription payments made on this date
    if (member.plan === 'unlimited' && member.unlimitedPaid && member.unlimitedPaidDate === date) {
      receivedAmount += UNLIMITED_FEE_AMOUNT;
    }
  });

  // 2. Calculate pending amount
  // A: Unpaid class fees for single-plan checked-in members today (exclude trial class)
  members.forEach(member => {
    const record = dateData[member.id];
    if (record && record.present && member.plan === 'single' && !record.paid) {
      const orderIdx = getAttendanceOrderIndex(member.id, date);
      if (orderIdx >= 4) {
        pendingAmount += SINGLE_FEE_AMOUNT;
      }
    }
  });

  // B: Unpaid subscription fees for unlimited plan members (only if they have completed their 3 trial classes!)
  members.forEach(member => {
    if (member.plan === 'unlimited' && !member.unlimitedPaid) {
      const totalAttCount = getTotalAttendanceCount(member.id);
      if (totalAttCount >= 4) {
        pendingAmount += UNLIMITED_FEE_AMOUNT;
      }
    }
  });

  statAttendance.textContent = `${checkedInCount} 人`;
  statReceived.textContent = `$${receivedAmount} TWD`;
  statPending.textContent = `$${pendingAmount} TWD`;
  
  if (pendingAmount > 0) {
    statPending.parentElement.parentElement.classList.add('warning');
  } else {
    statPending.parentElement.parentElement.classList.remove('warning');
  }
}

// Render Unpaid/Outstanding list (single classes + unpaid subscription plans)
function renderUnpaidList() {
  unpaidList.innerHTML = '';
  let unpaidRecords = [];

  // 1. Find all unpaid subscription plans ($1000) - only for those who completed their 3 trial classes!
  members.forEach(member => {
    if (member.plan === 'unlimited' && !member.unlimitedPaid) {
      const totalAttCount = getTotalAttendanceCount(member.id);
      if (totalAttCount >= 4) {
        unpaidRecords.push({
          type: 'unlimited',
          memberId: member.id,
          memberName: member.name,
          memberPhone: member.phone || '無資料',
          amount: UNLIMITED_FEE_AMOUNT,
          desc: `已試上 ${totalAttCount} 次，需繳方案費`
        });
      }
    }
  });

  // 2. Scan all dates in history for unpaid class check-ins ($50) for single plan members - excluding trials!
  Object.keys(attendance).forEach(date => {
    const dateData = attendance[date];
    Object.keys(dateData).forEach(memberId => {
      const record = dateData[memberId];
      if (record.present && !record.paid) {
        const member = members.find(m => m.id === memberId);
        if (member && member.plan === 'single') {
          const orderIdx = getAttendanceOrderIndex(member.id, date);
          if (orderIdx >= 4) {
            unpaidRecords.push({
              type: 'single',
              date: date,
              memberId: member.id,
              memberName: member.name,
              memberPhone: member.phone || '無資料',
              amount: SINGLE_FEE_AMOUNT,
              desc: `第 ${orderIdx} 堂課 (試上已滿)`
            });
          }
        }
      }
    });
  });

  unpaidBadgeCount.textContent = `${unpaidRecords.length} 筆待繳`;

  if (unpaidRecords.length === 0) {
    unpaidList.innerHTML = '<li class="empty-state">目前無未繳費社員，太棒了！</li>';
    return;
  }

  unpaidRecords.forEach(rec => {
    const li = document.createElement('li');
    li.className = 'unpaid-item';
    
    if (rec.type === 'unlimited') {
      li.innerHTML = `
        <div class="unpaid-item-info">
          <span class="unpaid-item-name">${rec.memberName} <span class="badge badge-purple">上到飽</span></span>
          <span class="unpaid-item-date" style="color:var(--danger-color); font-weight:500;">${rec.desc} $${rec.amount} 元</span>
        </div>
        <button class="btn btn-success btn-sm" onclick="confirmUnlimitedPayment('${rec.memberId}')">
          <i data-lucide="check"></i> 收款 1000 元
        </button>
      `;
    } else {
      li.innerHTML = `
        <div class="unpaid-item-info">
          <span class="unpaid-item-name">${rec.memberName} <span class="badge badge-indigo">單堂</span></span>
          <span class="unpaid-item-date">${rec.desc} (未繳 $${rec.amount} 元)</span>
        </div>
        <button class="btn btn-success btn-sm" onclick="confirmPayment('${rec.date}', '${rec.memberId}')">
          <i data-lucide="check"></i> 收款 50 元
        </button>
      `;
    }
    unpaidList.appendChild(li);
  });
  lucide.createIcons();
}

// Render Attendance Checklist Table
function renderAttendanceTable() {
  attendanceTableBody.innerHTML = '';
  const date = getSelectedDate();
  const dateData = getAttendanceData(date);
  const searchQ = memberSearch.value.toLowerCase().trim();

  const filteredMembers = members.filter(m => m.name.toLowerCase().includes(searchQ));

  if (filteredMembers.length === 0) {
    attendanceTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">沒有找到符合搜尋條件 of 社員。</td>
      </tr>
    `;
    return;
  }

  filteredMembers.forEach(member => {
    const record = dateData[member.id] || { present: false, paid: false };
    const tr = document.createElement('tr');
    
    const planBadge = member.plan === 'unlimited' 
      ? '<span class="badge badge-purple" style="margin-left: 5px;">上到飽</span>' 
      : '<span class="badge badge-indigo" style="margin-left: 5px;">單堂</span>';

    let presentBadge = record.present 
      ? '<span class="badge badge-success">已簽到</span>' 
      : '<span class="badge badge-outline">未簽到</span>';
      
    let paymentBadge = '';
    let actionButtons = '';

    if (record.present) {
      const orderIdx = getAttendanceOrderIndex(member.id, date);
      
      if (orderIdx <= 3) {
        paymentBadge = `<span class="badge badge-success">試上免繳 (${orderIdx}/3)</span>`;
        actionButtons = `
          <button class="btn btn-outline btn-sm btn-icon" title="取消簽到" onclick="toggleAttendance('${member.id}')">
            <i data-lucide="x"></i>
          </button>
        `;
      } 
      else {
        if (member.plan === 'unlimited') {
          if (member.unlimitedPaid) {
            paymentBadge = `<span class="badge badge-success">方案內免繳</span>`;
            actionButtons = `
              <button class="btn btn-secondary btn-sm" onclick="showUnlimitedReceiptModal('${member.id}')">
                <i data-lucide="file-text"></i> 方案收據
              </button>
              <button class="btn btn-outline btn-sm btn-icon" title="取消簽到" onclick="toggleAttendance('${member.id}')">
                <i data-lucide="x"></i>
              </button>
            `;
          } else {
            paymentBadge = `<span class="badge badge-danger">未繳方案費</span>`;
            actionButtons = `
              <button class="btn btn-success btn-sm" onclick="confirmUnlimitedPayment('${member.id}')">
                <i data-lucide="dollar-sign"></i> 收方案費 1000 元
              </button>
              <button class="btn btn-outline btn-sm btn-icon" title="取消簽到" onclick="toggleAttendance('${member.id}')">
                <i data-lucide="x"></i>
              </button>
            `;
          }
        } else { // Single Plan
          if (record.paid) {
            paymentBadge = `<span class="badge badge-success">已繳 $${SINGLE_FEE_AMOUNT}</span>`;
            actionButtons = `
              <button class="btn btn-secondary btn-sm" onclick="showReceiptModal('${date}', '${member.id}')">
                <i data-lucide="file-text"></i> 收據
              </button>
              <button class="btn btn-outline btn-sm btn-icon" title="取消簽到" onclick="toggleAttendance('${member.id}')">
                <i data-lucide="x"></i>
              </button>
            `;
          } else {
            paymentBadge = `<span class="badge badge-warning">未繳費</span>`;
            actionButtons = `
              <button class="btn btn-success btn-sm" onclick="confirmPayment('${date}', '${member.id}')">
                <i data-lucide="dollar-sign"></i> 收款 50 元
              </button>
              <button class="btn btn-outline btn-sm btn-icon" title="取消簽到" onclick="toggleAttendance('${member.id}')">
                <i data-lucide="x"></i>
              </button>
            `;
          }
        }
      }
    } else {
      paymentBadge = `<span class="badge badge-outline">-</span>`;
      actionButtons = `
        <button class="btn btn-primary btn-sm" onclick="toggleAttendance('${member.id}')">
          <i data-lucide="user-check"></i> 簽到
        </button>
      `;
    }

    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center;">
          <strong>${member.name}</strong> ${planBadge}
        </div>
      </td>
      <td>${presentBadge}</td>
      <td>${paymentBadge}</td>
      <td>
        <div style="display:flex; gap:8px; align-items:center;">
          ${actionButtons}
        </div>
      </td>
    `;
    attendanceTableBody.appendChild(tr);
  });
  lucide.createIcons();
}

// Render Member Settings List (Right Panel)
function renderMemberList() {
  memberList.innerHTML = '';
  if (members.length === 0) {
    memberList.innerHTML = '<li class="empty-state">尚無社員資料，請先新增社員。</li>';
    return;
  }

  members.forEach(member => {
    const li = document.createElement('li');
    li.className = 'member-compact-item';
    
    let statusText = '';
    let payBtn = '';
    const totalAttCount = getTotalAttendanceCount(member.id);

    if (member.plan === 'unlimited') {
      if (member.unlimitedPaid) {
        statusText = ` <span class="badge badge-success">上到飽 (已付)</span>`;
      } else {
        if (totalAttCount <= 3) {
          statusText = ` <span class="badge badge-warning">試上期 (${totalAttCount}/3)</span>`;
        } else {
          statusText = ` <span class="badge badge-danger">上到飽 (未付)</span>`;
          payBtn = `
            <button class="btn btn-success btn-sm" style="padding:4px 8px; font-size:0.8rem;" onclick="confirmUnlimitedPayment('${member.id}')">
              收1000
            </button>
          `;
        }
      }
    } else {
      if (totalAttCount <= 3) {
        statusText = ` <span class="badge badge-warning">試上期 (${totalAttCount}/3)</span>`;
      } else {
        statusText = ` <span class="badge badge-indigo">單堂繳費</span>`;
      }
    }

    li.innerHTML = `
      <div style="flex-grow:1;">
        <div style="display:flex; align-items:center; gap:6px;">
          <strong>${member.name}</strong> ${statusText}
        </div>
        <div class="member-info-sub">學號：${member.phone || '未填寫'} | 已出席 ${totalAttCount} 次</div>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        ${payBtn}
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteMember('${member.id}')" title="刪除成員">
          <i data-lucide="trash"></i>
        </button>
      </div>
    `;
    memberList.appendChild(li);
  });
  lucide.createIcons();
}

// Action: Toggle Attendance State
window.toggleAttendance = function(memberId) {
  const date = getSelectedDate();
  const dateData = getAttendanceData(date);
  const member = members.find(m => m.id === memberId);
  
  if (!dateData[memberId]) {
    dateData[memberId] = { present: false, paid: false, receiptNo: '' };
  }

  dateData[memberId].present = !dateData[memberId].present;
  
  if (!dateData[memberId].present) {
    dateData[memberId].paid = false;
    dateData[memberId].receiptNo = '';
  }

  saveState();
  render();

  if (member) {
    postToCloud('checkin', {
      date: date,
      studentId: member.phone // student ID
    });
  }
};

// Action: Check in everyone
function handleCheckAll() {
  const date = getSelectedDate();
  const dateData = getAttendanceData(date);
  
  members.forEach(member => {
    if (!dateData[member.id]) {
      dateData[member.id] = { present: false, paid: false, receiptNo: '' };
    }
    dateData[member.id].present = true;
    
    postToCloud('checkin', {
      date: date,
      studentId: member.phone
    });
  });

  saveState();
  render();
}

// Action: Confirm payment & trigger receipt for SINGLE CLASS ($50)
window.confirmPayment = function(date, memberId) {
  const dateData = attendance[date];
  const member = members.find(m => m.id === memberId);
  if (!dateData || !dateData[memberId] || !member) return;

  const todayCompact = date.replace(/-/g, '');
  const serial = String(receiptIndex).padStart(4, '0');
  const receiptNo = `REC-${todayCompact}-${serial}`;
  
  dateData[memberId].paid = true;
  dateData[memberId].receiptNo = receiptNo;
  
  receiptIndex++;
  saveState();
  render();
  
  postToCloud('confirmPayment', {
    date: date,
    memberId: memberId,
    receiptNo: receiptNo,
    amount: SINGLE_FEE_AMOUNT,
    itemDesc: `單堂活動社費 (日期: ${date})`
  });

  showReceiptModal(date, memberId);
};

// Action: Confirm payment & trigger receipt for UNLIMITED PLAN ($1000)
window.confirmUnlimitedPayment = function(memberId) {
  const member = members.find(m => m.id === memberId);
  if (!member) return;

  const today = getSelectedDate();
  const todayCompact = today.replace(/-/g, '');
  const serial = String(receiptIndex).padStart(4, '0');
  const receiptNo = `REC-UNL-${todayCompact}-${serial}`;

  member.unlimitedPaid = true;
  member.unlimitedPaidDate = today;
  member.unlimitedReceiptNo = receiptNo;

  receiptIndex++;
  saveState();
  render();

  postToCloud('confirmUnlimitedPayment', {
    date: today,
    memberId: memberId,
    receiptNo: receiptNo,
    amount: UNLIMITED_FEE_AMOUNT,
    itemDesc: '包期上到飽方案費'
  });

  showUnlimitedReceiptModal(memberId);
};

// Action: Add Member
function handleAddMember(e) {
  e.preventDefault();
  const name = newMemberName.value.trim();
  const phone = newMemberPhone.value.trim();
  const plan = newMemberPlan.value;

  if (!name) return;

  const id = 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  const newMember = {
    id,
    name,
    phone,
    plan,
    unlimitedPaid: false,
    unlimitedPaidDate: '',
    unlimitedReceiptNo: ''
  };

  members.push(newMember);
  saveState();
  
  newMemberName.value = '';
  newMemberPhone.value = '';
  newMemberPlan.value = 'single';
  render();

  postToCloud('saveMember', { member: newMember });
}

// Action: Delete Member
window.deleteMember = function(memberId) {
  if (!confirm('確定要刪除這位社員嗎？這不會刪除歷史繳費紀錄，但會移出名冊。')) return;

  members = members.filter(m => m.id !== memberId);
  saveState();
  render();

  postToCloud('deleteMember', { memberId: memberId });
};

// --- Receipt Modal Draw triggers ---
window.showReceiptModal = function(date, memberId) {
  const member = members.find(m => m.id === memberId);
  const record = attendance[date] ? attendance[date][memberId] : null;

  if (!member || !record || !record.paid) {
    alert('此社員目前尚未繳費或無此點名紀錄！');
    return;
  }

  receiptModal.classList.remove('hidden');
  drawReceipt(date, member.name, record.receiptNo, SINGLE_FEE_AMOUNT, `單堂活動社費`);
};

window.showUnlimitedReceiptModal = function(memberId) {
  const member = members.find(m => m.id === memberId);

  if (!member || !member.unlimitedPaid) {
    alert('此社員目前尚未繳交方案費用！');
    return;
  }

  receiptModal.classList.remove('hidden');
  drawReceipt(member.unlimitedPaidDate, member.name, member.unlimitedReceiptNo, UNLIMITED_FEE_AMOUNT, '包期上到飽方案費');
};

// Helper: Convert number to Chinese Capital financial format for the bill
function getChineseCapitalDigits(amount) {
  const digits = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
  
  const wan = Math.floor(amount / 10000) % 10;
  const qian = Math.floor(amount / 1000) % 10;
  const bai = Math.floor(amount / 100) % 10;
  const shi = Math.floor(amount / 10) % 10;
  const yuan = amount % 10;

  return {
    wan: digits[wan],
    qian: digits[qian],
    bai: digits[bai],
    shi: digits[shi],
    yuan: digits[yuan]
  };
}

// Draw Curved Text on Canvas (used for custom circular stamp)
function drawCurvedText(ctx, text, centerX, centerY, radius, startAngle, endAngle) {
  const characters = text.split('');
  const angleRange = endAngle - startAngle;
  const angleStep = angleRange / (characters.length - 1 || 1);
  
  ctx.save();
  ctx.fillStyle = 'rgba(163, 0, 0, 0.9)';
  ctx.font = 'bold 11px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  characters.forEach((char, index) => {
    const charAngle = startAngle + (index * angleStep);
    ctx.save();
    ctx.translate(centerX + radius * Math.cos(charAngle), centerY + radius * Math.sin(charAngle));
    ctx.rotate(charAngle + Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

// Draw the traditional Taiwan "免用統一發票收據" on Canvas
function drawReceipt(date, memberName, receiptNo, amount, itemDesc) {
  const ctx = receiptCanvas.getContext('2d');
  
  const blueColor = '#0f3b68';
  const stampRed = 'rgba(163, 0, 0, 0.9)';
  const bgCream = '#fbfcf7';

  ctx.fillStyle = bgCream;
  ctx.fillRect(0, 0, receiptCanvas.width, receiptCanvas.height);

  ctx.strokeStyle = blueColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(15, 15, receiptCanvas.width - 30, receiptCanvas.height - 30);
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, receiptCanvas.width - 40, receiptCanvas.height - 40);

  ctx.fillStyle = blueColor;
  ctx.font = 'bold 32px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('免用統一發票收據', receiptCanvas.width / 2, 60);
  
  ctx.beginPath();
  ctx.moveTo(receiptCanvas.width / 2 - 140, 72);
  ctx.lineTo(receiptCanvas.width / 2 + 140, 72);
  ctx.moveTo(receiptCanvas.width / 2 - 140, 76);
  ctx.lineTo(receiptCanvas.width / 2 + 140, 76);
  ctx.strokeStyle = blueColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  let rocYear = '';
  let monthStr = '';
  let dayStr = '';
  try {
    const parts = date.split('-');
    if (parts.length === 3) {
      rocYear = String(parseInt(parts[0]) - 1911);
      monthStr = String(parseInt(parts[1]));
      dayStr = String(parseInt(parts[2]));
    }
  } catch(e) {}

  ctx.fillStyle = blueColor;
  ctx.font = 'bold 15px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`中華民國  ${rocYear}  年  ${monthStr}  月  ${dayStr}  日`, receiptCanvas.width - 45, 60);

  ctx.fillText(`統一編號：${DEFAULT_TAX_ID}`, receiptCanvas.width - 45, 95);

  ctx.textAlign = 'left';
  ctx.font = 'bold 18px "Noto Sans TC", sans-serif';
  ctx.fillText(`${memberName}   台照`, 45, 110);
  
  ctx.beginPath();
  ctx.moveTo(40, 120);
  ctx.lineTo(340, 120);
  ctx.stroke();

  ctx.font = '14px "Noto Sans TC", sans-serif';
  ctx.fillText('地址：', 45, 142);
  
  ctx.save();
  ctx.font = '10.5px "Noto Sans TC", sans-serif';
  ctx.fillText(DEFAULT_ADDRESS, 88, 142);
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(85, 148);
  ctx.lineTo(340, 148);
  ctx.stroke();

  ctx.font = '12px "Inter", sans-serif';
  ctx.fillText(`No. ${receiptNo}`, 45, 80);

  const tableX = 40;
  const tableY = 165;
  const tableW = receiptCanvas.width - 80;
  const rowHeight = 35;
  const headerHeight = 35;
  const tableRows = 4;

  ctx.lineWidth = 2;
  ctx.strokeRect(tableX, tableY, tableW, headerHeight + (rowHeight * tableRows));
  ctx.lineWidth = 1;

  const colX = {
    desc: tableX,
    qty: tableX + 280,
    unitPrice: tableX + 370,
    totalPrice: tableX + 470,
    remark: tableX + 570,
    end: tableX + tableW
  };

  ctx.beginPath();
  ctx.moveTo(colX.qty, tableY); ctx.lineTo(colX.qty, tableY + headerHeight + (rowHeight * tableRows));
  ctx.moveTo(colX.unitPrice, tableY); ctx.lineTo(colX.unitPrice, tableY + headerHeight + (rowHeight * tableRows));
  ctx.moveTo(colX.totalPrice, tableY); ctx.lineTo(colX.totalPrice, tableY + headerHeight + (rowHeight * tableRows));
  ctx.moveTo(colX.remark, tableY); ctx.lineTo(colX.remark, tableY + headerHeight + (rowHeight * tableRows));
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tableX, tableY + headerHeight);
  ctx.lineTo(colX.end, tableY + headerHeight);
  for (let r = 1; r <= tableRows; r++) {
    ctx.moveTo(tableX, tableY + headerHeight + (rowHeight * r));
    ctx.lineTo(colX.end, tableY + headerHeight + (rowHeight * r));
  }
  ctx.stroke();

  ctx.font = 'bold 15px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('品   名   商   標   摘   要', (colX.desc + colX.qty) / 2, tableY + 23);
  ctx.fillText('數 量', (colX.qty + colX.unitPrice) / 2, tableY + 23);
  ctx.fillText('單 價', (colX.unitPrice + colX.totalPrice) / 2, tableY + 23);
  ctx.fillText('總 價', (colX.totalPrice + colX.remark) / 2, tableY + 23);
  ctx.fillText('備 註', (colX.remark + colX.end) / 2, tableY + 23);

  ctx.font = '15px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`  ${itemDesc}`, colX.desc + 5, tableY + headerHeight + 23);
  
  ctx.textAlign = 'center';
  ctx.fillText('1', (colX.qty + colX.unitPrice) / 2, tableY + headerHeight + 23);
  ctx.fillText(amount.toString(), (colX.unitPrice + colX.totalPrice) / 2, tableY + headerHeight + 23);
  ctx.fillText(amount.toString(), (colX.totalPrice + colX.remark) / 2, tableY + headerHeight + 23);
  ctx.fillText('', (colX.remark + colX.end) / 2, tableY + headerHeight + 23);

  const bottomY = tableY + headerHeight + (rowHeight * tableRows) + 15;
  
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px "Noto Sans TC", sans-serif';
  ctx.fillText('合計新台幣：', tableX, bottomY + 35);

  const currencyX = tableX + 105;
  const currencyW = 280;
  const currencyH = 50;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(currencyX, bottomY, currencyW, currencyH);
  
  const curCols = [
    currencyX,
    currencyX + 56,
    currencyX + 112,
    currencyX + 168,
    currencyX + 224,
    currencyX + 280
  ];

  ctx.beginPath();
  for(let i=1; i<5; i++) {
    ctx.moveTo(curCols[i], bottomY);
    ctx.lineTo(curCols[i], bottomY + currencyH);
  }
  ctx.moveTo(currencyX, bottomY + 22);
  ctx.lineTo(currencyX + currencyW, bottomY + 22);
  ctx.stroke();

  ctx.font = 'bold 11px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('萬', (curCols[0] + curCols[1]) / 2, bottomY + 16);
  ctx.fillText('仟', (curCols[1] + curCols[2]) / 2, bottomY + 16);
  ctx.fillText('佰', (curCols[2] + curCols[3]) / 2, bottomY + 16);
  ctx.fillText('拾', (curCols[3] + curCols[4]) / 2, bottomY + 16);
  ctx.fillText('元整', (curCols[4] + curCols[5]) / 2, bottomY + 16);

  const cnDigits = getChineseCapitalDigits(amount);
  ctx.font = 'bold 16px "Noto Sans TC", sans-serif';
  ctx.fillStyle = blueColor;
  ctx.fillText(cnDigits.wan, (curCols[0] + curCols[1]) / 2, bottomY + 42);
  ctx.fillText(cnDigits.qian, (curCols[1] + curCols[2]) / 2, bottomY + 42);
  ctx.fillText(cnDigits.bai, (curCols[2] + curCols[3]) / 2, bottomY + 42);
  ctx.fillText(cnDigits.shi, (curCols[3] + curCols[4]) / 2, bottomY + 42);
  ctx.fillText(cnDigits.yuan, (curCols[4] + curCols[5]) / 2, bottomY + 42);

  const stampBoxW = 140; 
  const stampBoxX = colX.end - stampBoxW;
  const stampBoxY = bottomY;
  const stampBoxH = 110;
  
  ctx.strokeStyle = blueColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(stampBoxX, stampBoxY, stampBoxW, stampBoxH);
  
  ctx.fillStyle = blueColor;
  ctx.font = 'bold 12px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('收 據 專 用 章', stampBoxX + (stampBoxW/2), stampBoxY + 18);
  
  const stampCX = stampBoxX + (stampBoxW/2);
  const stampCY = stampBoxY + 63;
  const stampRadius = 40;
  
  ctx.strokeStyle = stampRed;
  ctx.lineWidth = 2.5;
  ctx.fillStyle = 'rgba(163, 0, 0, 0.03)';
  
  ctx.beginPath();
  ctx.arc(stampCX, stampCY, stampRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(stampCX, stampCY, stampRadius - 2.5, 0, Math.PI * 2);
  ctx.stroke();

  drawCurvedText(ctx, '東華休閒運動社', stampCX, stampCY, stampRadius - 11, Math.PI * 1.15, Math.PI * 1.85);

  ctx.fillStyle = stampRed;
  ctx.font = 'bold 9.5px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('線上收據專用章', stampCX, stampCY + 2);

  ctx.font = 'bold 9.5px "Noto Sans TC", sans-serif';
  ctx.fillText('國立東華大學', stampCX, stampCY + 18);

  // Setup Share and Download Listeners
  btnShareReceipt.onclick = async function() {
    try {
      receiptCanvas.toBlob(async (blob) => {
        const file = new File([blob], `收據-${memberName}-${date}.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `東華休閒運動社收據 - ${memberName}`,
            text: `這是您於 ${date} 的繳費電子收據，金額為 $${amount} 元。`
          });
        } else {
          const summaryText = `【東華休閒運動社 電子收據】\n收據編號：${receiptNo}\n繳費姓名：${memberName}\n收款項目：${itemDesc}\n實收金額：$${amount} TWD\n已收訖 (無統編收據專用章已蓋)`;
          await navigator.clipboard.writeText(summaryText);
          alert('您的瀏覽器/裝置不支援直接分享圖片。\n已自動下載收據圖片，並將收據文字資訊複製到剪貼簿。您可以直接貼上傳送給社員！');
          
          btnDownloadReceipt.click();
        }
      }, 'image/png');
    } catch (err) {
      console.error('Share failed:', err);
      alert('分享失敗，請點選「下載圖片」手動傳送！');
    }
  };

  btnDownloadReceipt.onclick = function() {
    const link = document.createElement('a');
    link.download = `收據-${memberName}-${date}.png`;
    link.href = receiptCanvas.toDataURL('image/png');
    link.click();
  };

  btnPrintReceipt.onclick = function() {
    const dataUrl = receiptCanvas.toDataURL();
    const windowContent = '<!DOCTYPE html><html><head><title>Print Receipt</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;"><img src="' + dataUrl + '" style="max-height:100%; max-width:100%;" onload="window.print();window.close();"/></body></html>';
    const printWindow = window.open('', '_blank');
    printWindow.document.open();
    printWindow.write(windowContent);
    printWindow.document.close();
  };
}

// Backup logic: Export Excel-compatible CSV file
function exportToCSV() {
  let csvContent = '\uFEFF';
  csvContent += '收款日期,收據編號,社員姓名,學號,收費項目,收費方案,收款金額\n';

  let hasData = false;

  Object.keys(attendance).forEach(date => {
    const dateData = attendance[date];
    Object.keys(dateData).forEach(memberId => {
      const record = dateData[memberId];
      const member = members.find(m => m.id === memberId);
      if (record.present && record.paid && member && member.plan === 'single') {
        const orderIdx = getAttendanceOrderIndex(member.id, date);
        if (orderIdx >= 4) {
          hasData = true;
          csvContent += `"${date}","${record.receiptNo || ''}","${member.name}","${member.phone || ''}","單堂活動社費","單堂 $50",${SINGLE_FEE_AMOUNT}\n`;
        }
      }
    });
  });

  members.forEach(member => {
    if (member.plan === 'unlimited' && member.unlimitedPaid) {
      hasData = true;
      csvContent += `"${member.unlimitedPaidDate}","${member.unlimitedReceiptNo || ''}","${member.name}","${member.phone || ''}","上到飽方案費","上到飽 $1000",${UNLIMITED_FEE_AMOUNT}\n`;
    }
  });

  if (!hasData) {
    alert('目前沒有任何已繳費記錄可以匯出。');
    return;
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `社團收費歷史報表_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Backup logic: Export full system JSON backup
function exportBackupJSON() {
  const backupData = {
    members,
    attendance,
    receiptIndex
  };
  
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `社團收費系統備份_${new Date().toISOString().slice(0,10)}.json`;
  link.click();
}

// Backup logic: Import full system JSON backup
function importBackupJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const data = JSON.parse(event.target.result);
      if (data.members && data.attendance && data.receiptIndex) {
        members = data.members;
        attendance = data.attendance;
        receiptIndex = data.receiptIndex;
        saveState();
        render();
        alert('備份資料匯入成功！');
      } else {
        alert('匯入失敗：備份檔案結構不正確。');
      }
    } catch (err) {
      alert('匯入失敗：無法解析此 JSON 備份檔案。');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// Clear all app data
function clearAllData() {
  if (confirm('警告！這將清除所有社員清單、簽到記錄與收據號碼，操作無法復原。您確定要重設嗎？')) {
    localStorage.clear();
    members = [];
    attendance = {};
    receiptIndex = 1;
    render();
    alert('系統已完全重設。');
  }
}
