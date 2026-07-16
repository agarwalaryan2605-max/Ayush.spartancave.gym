/* ============================================
   SPARTAN CAVE - Renewal Form Logic
   ============================================ */

// State
let currentStep = 1;
let selectedPlan = null;
let selectedAmount = 0;
let selectedDays = 0;
let paymentMode = 'cash';
let screenshotFile = null;
let foundMember = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
});

/* ============================================
   Step Navigation
   ============================================ */
function goToStep(step) {
  if (step > currentStep) {
    if (!validateStep(currentStep)) return;
  }

  const currentStepEl = document.getElementById(`step${currentStep}`);
  if (currentStepEl) currentStepEl.classList.remove('active');

  currentStep = step;
  const targetStepEl = document.getElementById(`step${currentStep}`);
  if (targetStepEl) {
    targetStepEl.classList.add('active');
    targetStepEl.style.animation = 'none';
    targetStepEl.offsetHeight;
    targetStepEl.style.animation = 'fadeInScale 0.4s ease';
  }

  updateStepper();

  if (currentStep === 3) {
    updatePaymentDisplay();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepper() {
  for (let i = 1; i <= 3; i++) {
    const circle = document.getElementById(`stepCircle${i}`);
    const line = document.getElementById(`stepLine${i}`);

    if (i < currentStep) {
      circle.classList.add('completed');
      circle.classList.remove('active');
      circle.innerHTML = `<i data-lucide="check" style="width:18px;height:18px;"></i><span class="stepper-label">${getStepLabel(i)}</span>`;
    } else if (i === currentStep) {
      circle.classList.add('active');
      circle.classList.remove('completed');
      circle.innerHTML = `${i}<span class="stepper-label">${getStepLabel(i)}</span>`;
    } else {
      circle.classList.remove('active', 'completed');
      circle.innerHTML = `${i}<span class="stepper-label">${getStepLabel(i)}</span>`;
    }

    if (line) {
      if (i < currentStep) {
        line.classList.add('active');
      } else {
        line.classList.remove('active');
      }
    }
  }
  lucide.createIcons();
}

function getStepLabel(step) {
  const labels = { 1: 'Lookup', 2: 'Plan', 3: 'Payment' };
  return labels[step] || '';
}

/* ============================================
   Validation
   ============================================ */
function validateStep(step) {
  switch (step) {
    case 1: return !!foundMember;
    case 2: return validatePlanSelection();
    default: return true;
  }
}

function validatePlanSelection() {
  if (!selectedPlan) {
    document.getElementById('planError').classList.add('show');
    return false;
  }
  document.getElementById('planError').classList.remove('show');
  return true;
}

/* ============================================
   Phone Lookup
   ============================================ */
async function lookupMember() {
  const phone = document.getElementById('lookupPhone').value.trim();

  if (!phone || !/^[0-9]{10}$/.test(phone)) {
    document.getElementById('lookupPhone').classList.add('error');
    document.getElementById('phoneError').classList.add('show');
    return;
  }

  document.getElementById('lookupPhone').classList.remove('error');
  document.getElementById('phoneError').classList.remove('show');

  const lookupBtn = document.getElementById('lookupBtn');
  lookupBtn.disabled = true;
  lookupBtn.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;"></div> Searching...';

  try {
    const res = await fetch(`/api/members/lookup?phone=${phone}`);

    if (res.ok) {
      foundMember = await res.json();
      displayMemberInfo(foundMember);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Member not found. Please register first.', 'error');
      document.getElementById('memberInfoCard').style.display = 'none';
      document.getElementById('continueToStep2Btn').style.display = 'none';
      foundMember = null;
    }
  } catch (err) {
    showToast('Network error. Please check your connection.', 'error');
  }

  lookupBtn.disabled = false;
  lookupBtn.innerHTML = '<i data-lucide="search" style="width:18px;height:18px;"></i> Find Membership';
  lucide.createIcons();
}

function displayMemberInfo(member) {
  document.getElementById('memberInfoCard').style.display = 'block';
  document.getElementById('memberName').textContent = member.full_name;
  document.getElementById('memberMemberId').textContent = member.member_id;
  document.getElementById('memberPlan').textContent = member.membership_plan;
  document.getElementById('memberAmount').textContent = '₹' + parseInt(member.amount).toLocaleString('en-IN');
  document.getElementById('memberEndDate').textContent = formatDate(member.end_date);

  const statusEl = document.getElementById('memberStatus');
  if (member.status === 'expired' || member.is_expired) {
    statusEl.innerHTML = '<span style="color:#ff4444;font-weight:700;">⚠️ EXPIRED</span>';
  } else {
    statusEl.innerHTML = '<span style="color:#44ff44;font-weight:700;">✅ ACTIVE</span>';
  }

  // Show continue button, hide lookup button
  document.getElementById('lookupBtn').style.display = 'none';
  document.getElementById('continueToStep2Btn').style.display = 'inline-flex';

  lucide.createIcons();
}

/* ============================================
   Plan Selection
   ============================================ */
function selectPlan(card) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedPlan = card.dataset.plan;
  selectedAmount = parseInt(card.dataset.amount);
  selectedDays = parseInt(card.dataset.days);
  document.getElementById('planError').classList.remove('show');
}

/* ============================================
   Payment Mode
   ============================================ */
function setPaymentMode(mode) {
  paymentMode = mode.toLowerCase();

  document.getElementById('cashToggleBtn').classList.toggle('active', mode === 'Cash');
  document.getElementById('onlineToggleBtn').classList.toggle('active', mode === 'Online');

  document.getElementById('cashSection').style.display = mode === 'Cash' ? 'block' : 'none';
  document.getElementById('onlineSection').style.display = mode === 'Online' ? 'block' : 'none';

  if (mode === 'Online') {
    fetchUPIQR();
  }

  updatePaymentDisplay();
}

function updatePaymentDisplay() {
  const formatted = formatCurrency(selectedAmount);
  document.getElementById('cashAmount').textContent = formatted;
  document.getElementById('onlineAmount').textContent = formatted;
}

async function fetchUPIQR() {
  const qrImg = document.getElementById('upiQrImage');
  const placeholder = document.getElementById('upiQrPlaceholder');

  placeholder.style.display = 'flex';
  qrImg.style.display = 'none';

  try {
    const response = await fetch(`/api/export/payment-qr?amount=${selectedAmount}`);
    if (response.ok) {
      const data = await response.json();
      qrImg.src = data.qrDataUrl;
      qrImg.style.display = 'block';
      placeholder.style.display = 'none';
    }
  } catch (err) {
    placeholder.innerHTML = `
      <div style="text-align:center;color:var(--text-dim);font-size:0.78rem;">
        <i data-lucide="qr-code" style="width:32px;height:32px;margin-bottom:8px;opacity:0.3;"></i>
        <p>QR unavailable</p>
      </div>
    `;
    lucide.createIcons();
  }
}

/* ============================================
   File Upload
   ============================================ */
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file', 'error');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showToast('File size must be less than 5MB', 'error');
    return;
  }

  screenshotFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('uploadPreview');
    const previewImg = document.getElementById('screenshotPreview');
    previewImg.src = e.target.result;
    preview.style.display = 'block';

    const uploadArea = document.getElementById('uploadArea');
    uploadArea.classList.add('has-file');
    document.getElementById('uploadText').textContent = file.name;
    document.getElementById('uploadSubtext').textContent = formatFileSize(file.size);
  };
  reader.readAsDataURL(file);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ============================================
   Submit Renewal
   ============================================ */
async function submitRenewal() {
  const submitBtn = document.getElementById('submitBtn');

  if (paymentMode === 'online' && !screenshotFile) {
    showToast('Please upload payment screenshot', 'warning');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;"></div> Renewing...';

  try {
    // Step 1: Renew membership
    const renewData = {
      phone: foundMember.phone,
      membership_plan: selectedPlan,
      payment_mode: paymentMode,
    };

    const response = await fetch('/api/members/renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(renewData),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      showToast(errData.error || 'Renewal failed. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="check" style="width:18px;height:18px;"></i> Renew Membership';
      lucide.createIcons();
      return;
    }

    const data = await response.json();

    // Step 2: Upload screenshot if online payment
    if (paymentMode === 'online' && screenshotFile && data.member) {
      const formData = new FormData();
      formData.append('screenshot', screenshotFile);
      formData.append('memberId', data.member.member_id);

      await fetch('/api/payments/upload-screenshot', {
        method: 'POST',
        body: formData,
      });
    }

    showSuccessStep(data);
  } catch (err) {
    showToast('Network error. Please check your connection.', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-lucide="check" style="width:18px;height:18px;"></i> Renew Membership';
    lucide.createIcons();
  }
}

/* ============================================
   Success Step
   ============================================ */
function showSuccessStep(data) {
  document.getElementById('progressStepper').style.display = 'none';

  document.getElementById('step3').classList.remove('active');
  document.getElementById('step4').classList.add('active');

  const member = data.member || data;
  document.getElementById('successMemberId').textContent = member.member_id || '—';
  document.getElementById('successName').textContent = member.full_name || '—';
  document.getElementById('successPlan').textContent = member.membership_plan || selectedPlan || '—';
  document.getElementById('successAmount').textContent = formatCurrency(member.amount || selectedAmount);
  document.getElementById('successPayment').textContent = (member.payment_mode || paymentMode || '—').toUpperCase();
  document.getElementById('successRegDate').textContent = formatDate(member.registration_date || new Date().toISOString());
  document.getElementById('successValidUntil').textContent = formatDate(member.end_date || '—');

  lucide.createIcons();
}

/* ============================================
   Utilities
   ============================================ */
function formatCurrency(amount) {
  return '₹' + parseInt(amount).toLocaleString('en-IN');
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

  toast.innerHTML = `
    <span class="toast-icon"><i data-lucide="${iconMap[type]}" style="width:20px;height:20px;color:var(--${type === 'error' ? 'danger' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'text-muted'});"></i></span>
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
