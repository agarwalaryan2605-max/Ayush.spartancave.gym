/* ============================================
   SPARTAN CAVE - Registration Form Logic
   ============================================ */

// State
let currentStep = 1;
let selectedPlan = null;
let selectedAmount = 0;
let selectedDays = 0;
let paymentMode = 'cash';
let screenshotFile = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
});

/* ============================================
   Step Navigation
   ============================================ */
function goToStep(step) {
  // Validate current step before moving forward
  if (step > currentStep) {
    if (!validateStep(currentStep)) return;
  }

  // Hide current step
  const currentStepEl = document.getElementById(`step${currentStep}`);
  if (currentStepEl) {
    currentStepEl.classList.remove('active');
  }

  // Show target step
  currentStep = step;
  const targetStepEl = document.getElementById(`step${currentStep}`);
  if (targetStepEl) {
    targetStepEl.classList.add('active');
    targetStepEl.style.animation = 'none';
    targetStepEl.offsetHeight; // trigger reflow
    targetStepEl.style.animation = 'fadeInScale 0.4s ease';
  }

  // Update stepper
  updateStepper();

  // Load payment data if step 3
  if (currentStep === 3) {
    updatePaymentDisplay();
  }

  // Scroll to top
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
  const labels = { 1: 'Personal', 2: 'Plan', 3: 'Payment' };
  return labels[step] || '';
}

/* ============================================
   Form Validation
   ============================================ */
function validateStep(step) {
  switch (step) {
    case 1:
      return validatePersonalDetails();
    case 2:
      return validatePlanSelection();
    case 3:
      return validatePayment();
    default:
      return true;
  }
}

function validatePersonalDetails() {
  let isValid = true;

  const name = document.getElementById('fullName').value.trim();
  const phone = document.getElementById('phoneNumber').value.trim();
  const gender = document.getElementById('gender').value;

  // Name validation
  if (!name) {
    showFieldError('fullName', 'nameError');
    isValid = false;
  } else {
    clearFieldError('fullName', 'nameError');
  }

  // Phone validation
  if (!phone || !/^[0-9]{10}$/.test(phone)) {
    showFieldError('phoneNumber', 'phoneError');
    isValid = false;
  } else {
    clearFieldError('phoneNumber', 'phoneError');
  }

  // Gender validation
  if (!gender) {
    showFieldError('gender', 'genderError');
    isValid = false;
  } else {
    clearFieldError('gender', 'genderError');
  }

  return isValid;
}

function validatePlanSelection() {
  if (!selectedPlan) {
    const planError = document.getElementById('planError');
    planError.classList.add('show');
    return false;
  }
  document.getElementById('planError').classList.remove('show');
  return true;
}

function validatePayment() {
  // Payment mode is always selected (default: Cash)
  return true;
}

function showFieldError(inputId, errorId) {
  document.getElementById(inputId).classList.add('error');
  document.getElementById(errorId).classList.add('show');
}

function clearFieldError(inputId, errorId) {
  document.getElementById(inputId).classList.remove('error');
  document.getElementById(errorId).classList.remove('show');
}

/* ============================================
   Plan Selection
   ============================================ */
function selectPlan(card) {
  // Remove selection from all cards
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));

  // Select this card
  card.classList.add('selected');
  selectedPlan = card.dataset.plan;
  selectedAmount = parseInt(card.dataset.amount);
  selectedDays = parseInt(card.dataset.days);

  // Clear plan error
  document.getElementById('planError').classList.remove('show');
}

/* ============================================
   Payment Mode
   ============================================ */
function setPaymentMode(mode) {
  paymentMode = mode.toLowerCase();

  // Update toggle buttons
  document.getElementById('cashToggleBtn').classList.toggle('active', mode === 'Cash');
  document.getElementById('onlineToggleBtn').classList.toggle('active', mode === 'Online');

  // Show/hide sections
  document.getElementById('cashSection').style.display = mode === 'Cash' ? 'block' : 'none';
  document.getElementById('onlineSection').style.display = mode === 'Online' ? 'block' : 'none';

  // If online, fetch QR
  if (mode === 'Online') {
    fetchUPIQR();
  }

  updatePaymentDisplay();
}

function updatePaymentDisplay() {
  const formattedAmount = formatCurrency(selectedAmount);
  document.getElementById('cashAmount').textContent = formattedAmount;
  document.getElementById('onlineAmount').textContent = formattedAmount;
}

async function fetchUPIQR() {
  const qrImg = document.getElementById('upiQrImage');
  const placeholder = document.getElementById('upiQrPlaceholder');

  // Show loading
  placeholder.style.display = 'flex';
  qrImg.style.display = 'none';

  try {
    const response = await fetch(`/api/export/payment-qr?amount=${selectedAmount}`);
    if (response.ok) {
      const data = await response.json();
      qrImg.src = data.qrDataUrl;
      qrImg.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      showUPIQRFallback();
    }
  } catch (err) {
    showUPIQRFallback();
  }
}

function showUPIQRFallback() {
  const placeholder = document.getElementById('upiQrPlaceholder');
  placeholder.innerHTML = `
    <div style="text-align:center;color:var(--text-dim);font-size:0.78rem;">
      <i data-lucide="qr-code" style="width:32px;height:32px;margin-bottom:8px;opacity:0.3;"></i>
      <p>QR unavailable</p>
    </div>
  `;
  lucide.createIcons();
}

/* ============================================
   File Upload
   ============================================ */
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file', 'error');
    return;
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('File size must be less than 5MB', 'error');
    return;
  }

  screenshotFile = file;

  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('uploadPreview');
    const previewImg = document.getElementById('screenshotPreview');
    previewImg.src = e.target.result;
    preview.style.display = 'block';

    // Update upload area
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
   Form Submission
   ============================================ */
async function submitRegistration() {
  const submitBtn = document.getElementById('submitBtn');

  // Validate
  if (paymentMode === 'online' && !screenshotFile) {
    showToast('Please upload payment screenshot', 'warning');
    return;
  }

  // Disable button
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<div class="loading-spinner" style="width:18px;height:18px;"></div> Submitting...';

  try {
    // Step 1: Register the member with JSON
    const memberData = {
      full_name: document.getElementById('fullName').value.trim(),
      phone: document.getElementById('phoneNumber').value.trim(),
      gender: document.getElementById('gender').value,
      membership_plan: selectedPlan,
      payment_mode: paymentMode,
    };

    const response = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memberData),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      showToast(errData.error || 'Registration failed. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-lucide="check" style="width:18px;height:18px;"></i> Submit';
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
    submitBtn.innerHTML = '<i data-lucide="check" style="width:18px;height:18px;"></i> Submit';
    lucide.createIcons();
  }
}

/* ============================================
   Success Step
   ============================================ */
function showSuccessStep(data) {
  // Hide stepper
  document.getElementById('progressStepper').style.display = 'none';

  // Hide step 3, show step 4
  document.getElementById('step3').classList.remove('active');
  document.getElementById('step4').classList.add('active');

  // Populate details
  const member = data.member || data;
  document.getElementById('successMemberId').textContent = member.member_id || '—';
  document.getElementById('successName').textContent = member.full_name || '—';
  document.getElementById('successPhone').textContent = member.phone || '—';
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

  // Auto remove
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}
