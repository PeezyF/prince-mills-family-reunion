const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');

menuButton.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.querySelector('[aria-hidden]').textContent = open ? '×' : '☰';
});

document.querySelectorAll('.nav-links a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.querySelector('[aria-hidden]').textContent = '☰';
}));

const reunionDate = new Date('2027-07-16T13:30:00-04:00').getTime();
const countdownFields = { days: 86400000, hours: 3600000, minutes: 60000, seconds: 1000 };
function updateCountdown() {
  let remaining = Math.max(0, reunionDate - Date.now());
  Object.entries(countdownFields).forEach(([id, duration]) => {
    const value = Math.floor(remaining / duration);
    remaining %= duration;
    document.getElementById(id).textContent = String(value).padStart(id === 'days' ? 3 : 2, '0');
  });
}
updateCountdown();
setInterval(updateCountdown, 1000);

const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  tabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  });
  tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    selectTab(tabs[(index + direction + tabs.length) % tabs.length]);
  });
});

const modal = document.getElementById('schedule-modal');
const modalPoster = document.getElementById('modal-poster');
const openModalButton = document.getElementById('open-schedule');
let previousFocus;
function openModal() {
  previousFocus = document.activeElement;
  modalPoster.replaceChildren(document.getElementById('schedule-poster').cloneNode(true));
  modal.hidden = false;
  document.body.classList.add('modal-open');
  modal.querySelector('.modal-close').focus();
}
function closeModal() {
  modal.hidden = true;
  document.body.classList.remove('modal-open');
  previousFocus?.focus();
}
openModalButton.addEventListener('click', openModal);
modal.querySelectorAll('[data-close-modal]').forEach((item) => item.addEventListener('click', closeModal));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
modal.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const focusable = [...modal.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((item) => !item.disabled && !item.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

const form = document.getElementById('rsvp-form');
const formError = document.getElementById('form-error');
const deliveryError = document.getElementById('delivery-error');
const successMessage = document.getElementById('success-message');
const submitButton = form.querySelector('.submit-button');

function collectRsvpData(formData) {
  const data = Object.fromEntries(formData.entries());
  data.events = formData.getAll('events');
  data.submittedAt = new Date().toISOString();
  delete data.confirmation;
  delete data._subject;
  delete data._template;
  delete data._honey;
  return data;
}

function saveRsvp(data) {
  try {
    const submissions = JSON.parse(localStorage.getItem('princeMillsRsvps') || '[]');
    submissions.push(data);
    localStorage.setItem('princeMillsRsvps', JSON.stringify(submissions));
    return true;
  } catch (error) {
    return false;
  }
}

function createRsvpFile(data) {
  const labels = {
    firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone',
    cityState: 'City and state', familySide: 'Family side', adults: 'Adults attending',
    children: 'Children attending', shirtSize: 'T-shirt size', dietary: 'Dietary restrictions',
    emergencyName: 'Emergency contact name', emergencyPhone: 'Emergency contact phone',
    notes: 'Special notes', attendance: 'Attending', events: 'Events', submittedAt: 'Submitted at'
  };
  const lines = [
    'PRINCE + MILLS FAMILY REUNION RSVP',
    'Atlanta, Georgia | July 16-18, 2027',
    '----------------------------------------',
    ...Object.entries(data).map(([key, value]) => `${labels[key] || key}: ${Array.isArray(value) ? value.join(', ') || 'None selected' : value || 'Not provided'}`)
  ];
  const safeName = `${data.firstName}-${data.lastName}`.replace(/[^a-z0-9-]+/gi, '-');
  return new File([lines.join('\n')], `Prince-Mills-RSVP-${safeName}.txt`, { type: 'text/plain' });
}

async function emailRsvp(data, originalFormData) {
  const emailData = new FormData();
  originalFormData.forEach((value, key) => {
    if (key !== 'confirmation' && key !== '_honey') emailData.append(key, value);
  });
  emailData.set('_subject', `New RSVP: ${data.firstName} ${data.lastName} — Prince + Mills Reunion`);
  emailData.set('_template', 'table');
  emailData.set('_replyto', data.email);
  emailData.append('attachment', createRsvpFile(data));

  const response = await fetch('https://formsubmit.co/ajax/donnell.prince@gmail.com', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: emailData
  });
  if (!response.ok) throw new Error('RSVP email delivery failed');
  const result = await response.json();
  if (result.success === false) throw new Error(result.message || 'RSVP email delivery failed');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  form.querySelectorAll('input, select').forEach((field) => field.classList.add('touched'));
  if (!form.checkValidity()) {
    formError.hidden = false;
    deliveryError.hidden = true;
    successMessage.hidden = true;
    form.querySelector(':invalid')?.focus();
    return;
  }
  formError.hidden = true;
  deliveryError.hidden = true;
  successMessage.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Sending RSVP…';

  const originalFormData = new FormData(form);
  const rsvpData = collectRsvpData(originalFormData);
  const savedLocally = saveRsvp(rsvpData);

  try {
    await emailRsvp(rsvpData, originalFormData);
    form.reset();
    form.querySelectorAll('.touched').forEach((field) => field.classList.remove('touched'));
    successMessage.hidden = false;
    successMessage.focus();
  } catch (error) {
    deliveryError.textContent = savedLocally
      ? 'Your RSVP was saved on this device, but the email could not be sent. Please check your connection and try again.'
      : 'Your RSVP could not be sent or saved. Please check your connection and try again.';
    deliveryError.hidden = false;
    deliveryError.focus();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit My RSVP';
  }
});
