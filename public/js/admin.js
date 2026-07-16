/* ============================================
   SPARTAN CAVE - Admin Dashboard Logic
   ============================================ */

// State
let allMembers = [];
let filteredMembers = [];
let currentPage = 1;
let perPage = 15;
let currentMember = null;
let searchDebounceTimer = null;
let confirmCallback = null;
let refreshInterval = null;

// API helpers
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('spartan_token');
}

function authHeaders() {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json'
  };
}

/* ============================================
   Initialization
   ============================================ */
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();

  const token = getToken();
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  // Verify token
  try {
    const res = await fetch(`${API_BASE}/admin/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      localStorage.removeItem('spartan_token');
      localStorage.removeItem('spartan_admin');
      window.location.href = 'login.html';
      return;
    }
  } catch {
    // Allow offline usage if token exists
  }

  // Load admin name
  try {
    const admin = JSON.parse(localStorage.getItem('spartan_admin'));
    if (admin && admin.name) {
      document.getElementById('topbarUser').textContent = `Welcome, ${admin.name}`;
    }
  } catch {}

  // Load dashboard
  await refreshDashboard();

  // Auto-refresh every 60 seconds
  refreshInterval = setInterval(() => {
    fetchStats();
  }, 60000);
});

/* ============================================
   Dashboard Refresh
   ============================================ */
async function refreshDashboard() {
  await Promise.all([fetchStats(), fetchMembers()]);
  showToast('Dashboard refreshed', 'success');
}

/* ============================================
   Stats
   ============================================ */
async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/members/stats`, {
      headers: authHeaders()
    });
    if (res.ok) {
      const stats = await res.json();
      renderStats(stats);
    }
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

function renderStats(stats) {
  // Total members
  animateValue('totalMembersValue', stats.totalMembers || stats.total || 0);

  // Active members
  animateValue('activeMembersValue', stats.activeMembers || stats.active || 0);

  // Revenue
  const revenue = stats.totalRevenue || stats.revenue || 0;
  document.getElementById('revenueValue').textContent = '₹' + parseInt(revenue).toLocaleString('en-IN');

  // Payment split
  const cashPercent = stats.cashPercent || stats.cashPercentage || 0;
  const onlinePercent = stats.onlinePercent || stats.onlinePercentage || 0;
  document.getElementById('paymentSplitValue').textContent = `Cash ${Math.round(cashPercent)}% / Online ${Math.round(onlinePercent)}%`;
}

function animateValue(elementId, target) {
  const el = document.getElementById(elementId);
  const start = parseInt(el.textContent) || 0;
  const duration = 600;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

/* ============================================
   Members
   ============================================ */
async function fetchMembers() {
  try {
    const params = new URLSearchParams();
    const search = document.getElementById('searchInput').value.trim();
    const plan = document.getElementById('filterPlan').value;
    const payment = document.getElementById('filterPayment').value;
    const status = document.getElementById('filterStatus').value;

    if (search) params.append('search', search);
    if (plan) params.append('plan', plan);
    if (payment) params.append('payment_mode', payment.toLowerCase());
    if (status) params.append('status', status);

    const res = await fetch(`${API_BASE}/members?${params.toString()}`, {
      headers: authHeaders()
    });

    if (res.ok) {
      const data = await res.json();
      allMembers = data.members || data || [];
      filteredMembers = allMembers;
      currentPage = 1;
      renderMembersTable();
    }
  } catch (err) {
    console.error('Failed to fetch members:', err);
  }
}

function renderMembersTable() {
  const tbody = document.getElementById('membersTableBody');
  const emptyState = document.getElementById('emptyState');
  const tableContainer = document.getElementById('tableContainer');

  if (filteredMembers.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    tableContainer.style.display = 'none';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';
  tableContainer.style.display = 'block';

  // Pagination
  const totalPages = Math.ceil(filteredMembers.length / perPage);
  const start = (currentPage - 1) * perPage;
  const end = start + perPage;
  const pageMembers = filteredMembers.slice(start, end);

  tbody.innerHTML = pageMembers.map((m, i) => {
    const idx = start + i + 1;
    const statusClass = getStatusClass(m.status);
    const statusLabel = capitalizeFirst(m.status || 'active');
    const isOnline = (m.payment_mode || '').toLowerCase() === 'online';
    const isPaid = m.payment_status === 'paid';
    
    const statusIcon = isPaid
      ? `<span style="color:var(--success);font-weight:bold;margin-left:6px;font-size:1.1rem;vertical-align:middle;" title="Paid">✓</span>`
      : `<span style="color:var(--danger);font-weight:bold;margin-left:6px;font-size:1.1rem;vertical-align:middle;" title="Unpaid">✗</span>`;

    const paymentBadge = isOnline
      ? `<span class="badge badge-online">Online</span>${statusIcon}`
      : `<span class="badge badge-cash">Cash</span>${statusIcon}`;
    const regDate = formatDate(m.registration_date || m.createdAt);

    return `
      <tr>
        <td>${idx}</td>
        <td style="font-family:monospace;font-size:0.82rem;">${m.member_id || '—'}</td>
        <td style="font-weight:600;">${escapeHtml(m.full_name || '—')}</td>
        <td>${m.phone || '—'}</td>
        <td>${m.gender || '—'}</td>
        <td>${m.membership_plan || '—'}</td>
        <td style="font-weight:600;">₹${parseInt(m.amount || 0).toLocaleString('en-IN')}</td>
        <td>${paymentBadge}</td>
        <td><span class="badge badge-${statusClass}">${statusLabel}</span></td>
        <td>${regDate}</td>
        <td>
          <div class="table-actions">
            <button class="btn-icon" title="View Details" onclick="viewMember('${m.member_id}')">
              <i data-lucide="eye" style="width:16px;height:16px;"></i>
            </button>
            <button class="btn-icon" title="Edit Member" onclick="editMember('${m.member_id}')">
              <i data-lucide="edit" style="width:16px;height:16px;"></i>
            </button>
            ${isPaid ? `
              <button class="btn-icon" title="Mark Unpaid" onclick="togglePaymentStatus('${m.member_id}', 'pending')" style="color:var(--danger);">
                <i data-lucide="x-circle" style="width:16px;height:16px;"></i>
              </button>
            ` : `
              <button class="btn-icon" title="Mark Paid" onclick="togglePaymentStatus('${m.member_id}', 'paid')" style="color:var(--success);">
                <i data-lucide="check-circle" style="width:16px;height:16px;"></i>
              </button>
            `}
            ${isOnline ? `
              <button class="btn-icon" title="View Proof" onclick="viewProof('${m.member_id}')" style="color:var(--success);">
                <i data-lucide="image" style="width:16px;height:16px;"></i>
              </button>
            ` : ''}
            <button class="btn-icon" title="Delete" onclick="confirmDelete('${m.member_id}')" style="color:var(--danger);">
              <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderPagination(totalPages);
  lucide.createIcons();
}

/* ============================================
   Pagination
   ============================================ */
function renderPagination(totalPages) {
  const container = document.getElementById('pagination');

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  // Prev
  html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})"><i data-lucide="chevron-left" style="width:16px;height:16px;"></i></button>`;

  // Page numbers
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    html += `<button onclick="goToPage(1)">1</button>`;
    if (startPage > 2) html += `<button disabled>...</button>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<button disabled>...</button>`;
    html += `<button onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }

  // Next
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})"><i data-lucide="chevron-right" style="width:16px;height:16px;"></i></button>`;

  container.innerHTML = html;
  lucide.createIcons();
}

function goToPage(page) {
  currentPage = page;
  renderMembersTable();
  document.getElementById('tableContainer').scrollIntoView({ behavior: 'smooth' });
}

/* ============================================
   Search & Filters
   ============================================ */
function handleSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    fetchMembers();
  }, 350);
}

function applyFilters() {
  fetchMembers();
}

/* ============================================
   View Member
   ============================================ */
function viewMember(id) {
  currentMember = findMember(id);
  if (!currentMember) return;

  const m = currentMember;
  const grid = document.getElementById('memberDetailGrid');

  grid.innerHTML = `
    <div class="member-detail-item">
      <div class="label">Member ID</div>
      <div class="value" style="font-family:monospace;">${m.member_id || '—'}</div>
    </div>
    <div class="member-detail-item">
      <div class="label">Full Name</div>
      <div class="value">${escapeHtml(m.full_name || '—')}</div>
    </div>
    <div class="member-detail-item">
      <div class="label">Phone</div>
      <div class="value">${m.phone || '—'}</div>
    </div>
    <div class="member-detail-item">
      <div class="label">Gender</div>
      <div class="value">${m.gender || '—'}</div>
    </div>
    <div class="member-detail-item">
      <div class="label">Plan</div>
      <div class="value">${m.membership_plan || '—'}</div>
    </div>
    <div class="member-detail-item">
      <div class="label">Amount</div>
      <div class="value">₹${parseInt(m.amount || 0).toLocaleString('en-IN')}</div>
    </div>
    <div class="member-detail-item">
      <div class="label">Payment Mode</div>
      <div class="value">${capitalizeFirst(m.payment_mode || '—')}</div>
    </div>
    <div class="member-detail-item">
      <div class="label">Status</div>
      <div class="value"><span class="badge badge-${getStatusClass(m.status)}">${capitalizeFirst(m.status || 'active')}</span></div>
    </div>
    <div class="member-detail-item">
      <div class="label">Registration Date</div>
      <div class="value">${formatDate(m.registration_date || m.createdAt)}</div>
    </div>
    <div class="member-detail-item">
      <div class="label">Valid Until</div>
      <div class="value">${formatDate(m.end_date || '—')}</div>
    </div>
  `;

  // Screenshot
  const screenshotSection = document.getElementById('memberScreenshot');
  if (m.payment_mode === 'online' && m.payment_screenshot) {
    document.getElementById('screenshotImg').src = m.payment_screenshot.startsWith('http') ? m.payment_screenshot : `${m.payment_screenshot}`;
    screenshotSection.style.display = 'block';
  } else {
    screenshotSection.style.display = 'none';
  }

  // Mark paid button
  const markPaidBtn = document.getElementById('markPaidBtn');
  markPaidBtn.style.display = ((m.payment_mode || '').toLowerCase() === 'online' && m.payment_status === 'pending') ? 'inline-flex' : 'none';

  // Update modal title
  document.getElementById('memberModalTitle').textContent = `Member: ${m.full_name}`;

  openModal('memberModal');
}

function viewProof(id) {
  const m = findMember(id);
  if (!m) return;
  if (m.payment_screenshot) {
    document.getElementById('proofModalImage').src = m.payment_screenshot;
    openModal('proofModal');
  } else {
    showToast('No payment screenshot has been uploaded for this member.', 'info');
  }
}

/* ============================================
   Edit Member
   ============================================ */
function editMember(id) {
  const m = findMember(id || (currentMember && currentMember.member_id));
  if (!m) return;

  currentMember = m;
  document.getElementById('editName').value = m.full_name || '';
  document.getElementById('editPhone').value = m.phone || '';
  document.getElementById('editGender').value = m.gender || 'Male';
  document.getElementById('editPlan').value = m.membership_plan || 'Monthly';
  document.getElementById('editPaymentMode').value = capitalizeFirst(m.payment_mode || 'Cash');
  document.getElementById('editPaymentStatus').value = m.payment_status || 'pending';

  closeModal('memberModal');
  openModal('editModal');
}

async function saveEditMember() {
  if (!currentMember) return;

  const id = currentMember.member_id;
  const saveBtn = document.getElementById('saveEditBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;"></div> Saving...';

  const updateData = {
    full_name: document.getElementById('editName').value.trim(),
    phone: document.getElementById('editPhone').value.trim(),
    gender: document.getElementById('editGender').value,
    membership_plan: document.getElementById('editPlan').value,
    payment_mode: document.getElementById('editPaymentMode').value.toLowerCase(),
    payment_status: document.getElementById('editPaymentStatus').value
  };

  try {
    const res = await fetch(`${API_BASE}/members/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(updateData)
    });

    if (res.ok) {
      showToast('Member updated successfully', 'success');
      closeModal('editModal');
      await fetchMembers();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Failed to update member', 'error');
    }
  } catch {
    showToast('Network error', 'error');
  }

  saveBtn.disabled = false;
  saveBtn.innerHTML = '<i data-lucide="save" style="width:16px;height:16px;"></i> Save Changes';
  lucide.createIcons();
}

/* ============================================
   Mark as Paid
   ============================================ */
async function markAsPaid() {
  if (!currentMember) return;
  const id = currentMember.member_id;

  try {
    const res = await fetch(`${API_BASE}/payments/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ payment_status: 'paid' })
    });

    if (res.ok) {
      showToast('Payment marked as paid', 'success');
      closeModal('memberModal');
      await refreshDashboard();
    } else {
      showToast('Failed to update payment', 'error');
    }
  } catch {
    showToast('Network error', 'error');
  }
}

async function togglePaymentStatus(id, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/payments/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ payment_status: newStatus })
    });

    if (res.ok) {
      showToast(`Payment status updated to ${newStatus === 'paid' ? 'Paid' : 'Unpaid'}`, 'success');
      await refreshDashboard();
    } else {
      showToast('Failed to update payment status', 'error');
    }
  } catch {
    showToast('Network error', 'error');
  }
}

async function quickMarkPaid(id) {
  currentMember = findMember(id);
  await markAsPaid();
}

/* ============================================
   Delete Member
   ============================================ */
function deleteMember() {
  if (!currentMember) return;
  closeModal('memberModal');
  confirmDelete(currentMember.member_id);
}

function confirmDelete(id) {
  const member = findMember(id);
  if (!member) return;

  document.getElementById('confirmTitle').textContent = 'Delete Member';
  document.getElementById('confirmMessage').textContent = `Are you sure you want to delete "${member.name}"? This action cannot be undone.`;

  confirmCallback = async () => {
    try {
      const res = await fetch(`${API_BASE}/members/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
      });

      if (res.ok) {
        showToast('Member deleted successfully', 'success');
        closeModal('confirmModal');
        await refreshDashboard();
      } else {
        showToast('Failed to delete member', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  };

  openModal('confirmModal');
}

function confirmAction() {
  if (confirmCallback) {
    confirmCallback();
    confirmCallback = null;
  }
}

/* ============================================
   QR Code Modal
   ============================================ */
async function showQRModal() {
  openModal('qrModal');

  const img = document.getElementById('qrModalImage');
  const placeholder = document.getElementById('qrModalPlaceholder');

  placeholder.style.display = 'flex';
  img.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/export/qrcode`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    if (res.ok) {
      const data = await res.json();
      img.src = data.qrDataUrl;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      placeholder.innerHTML = `
        <div style="text-align:center;color:var(--text-dim);font-size:0.82rem;">
          <i data-lucide="alert-circle" style="width:32px;height:32px;margin-bottom:8px;opacity:0.3;"></i>
          <p>Failed to load QR code</p>
        </div>
      `;
      lucide.createIcons();
    }
  } catch {
    placeholder.innerHTML = `
      <div style="text-align:center;color:var(--text-dim);font-size:0.82rem;">
        <i data-lucide="wifi-off" style="width:32px;height:32px;margin-bottom:8px;opacity:0.3;"></i>
        <p>Network error</p>
      </div>
    `;
    lucide.createIcons();
  }
}

function downloadQR() {
  const img = document.getElementById('qrModalImage');
  if (!img.src) return;

  const a = document.createElement('a');
  a.href = img.src;
  a.download = 'spartan-cave-registration-qr.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('QR code downloaded', 'success');
}

function printQR() {
  const img = document.getElementById('qrModalImage');
  if (!img.src) return;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Spartan Cave - Registration QR</title>
        <style>
          body { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; margin:0; }
          h1 { font-size:2rem; margin-bottom:8px; letter-spacing:0.1em; }
          p { color:#666; margin-bottom:24px; }
          img { width:300px; height:300px; }
        </style>
      </head>
      <body>
        <h1>SPARTAN CAVE</h1>
        <p>Scan to Register</p>
        <img src="${img.src}" alt="Registration QR Code">
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
}

/* ============================================
   Export Excel
   ============================================ */
function exportExcel() {
  const token = getToken();
  const a = document.createElement('a');
  a.href = `${API_BASE}/export/excel?token=${encodeURIComponent(token)}`;
  a.download = 'spartan-cave-members.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Exporting to Excel...', 'info');
}

/* ============================================
   Logout
   ============================================ */
function handleLogout() {
  localStorage.removeItem('spartan_token');
  localStorage.removeItem('spartan_admin');
  if (refreshInterval) clearInterval(refreshInterval);
  window.location.href = 'login.html';
}

/* ============================================
   Modal Helpers
   ============================================ */
function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(id);
  });
}

function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

// Close modals on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
      modal.classList.remove('active');
    });
    document.body.style.overflow = '';
  }
});

/* ============================================
   Utility Functions
   ============================================ */
function findMember(id) {
  return allMembers.find(m => m.member_id === id);
}

function getStatusClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'active': return 'active';
    case 'expired': return 'expired';
    case 'cancelled': return 'cancelled';
    case 'pending': return 'pending';
    default: return 'active';
  }
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === '—') return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================
   Toast Notifications
   ============================================ */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: 'check-circle',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info'
  };
  const colorMap = {
    success: 'var(--success)',
    error: 'var(--danger)',
    warning: 'var(--warning)',
    info: 'var(--text-muted)'
  };

  toast.innerHTML = `
    <span class="toast-icon"><i data-lucide="${iconMap[type]}" style="width:20px;height:20px;color:${colorMap[type]};"></i></span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}
