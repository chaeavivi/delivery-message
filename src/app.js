import { CARRIERS, getCarrier } from './carriers.js';
import {
  estimateArrival,
  formatLong,
  fromISODate,
  hasHolidayData,
  holidayName,
  holidaysBetween,
  isWeekend,
  toISODate,
} from './businessDays.js';
import { digitsOnly, extractCandidates, formatInvoice, validateInvoice } from './invoice.js';
import { DEFAULT_TEMPLATE, PLACEHOLDERS, buildValues, renderTemplate } from './message.js';
import { PRODUCT_GROUPS, isSelected, toggleProduct } from './products.js';
import { recognizeNumbers } from './ocr.js';

const STORAGE = {
  carrier: 'chaea.invoice.carrier',
  template: 'chaea.invoice.template',
};

const $ = (id) => document.getElementById(id);

const el = {
  carriers: $('carriers'),
  invoice: $('invoice'),
  invoiceHint: $('invoice-hint'),
  dropzone: $('dropzone'),
  file: $('file'),
  ocr: $('ocr'),
  ocrFill: $('ocr-fill'),
  ocrStatus: $('ocr-status'),
  candidates: $('candidates'),
  candidatesList: $('candidates-list'),
  previewImage: $('preview-image'),
  previewImageEl: $('preview-image-el'),
  customer: $('customer'),
  product: $('product'),
  products: $('products'),
  shipDate: $('ship-date'),
  dateHint: $('date-hint'),
  message: $('message'),
  copy: $('copy'),
  share: $('share'),
  regenerate: $('regenerate'),
  track: $('track'),
  actionHint: $('action-hint'),
  template: $('template'),
  tokens: $('tokens'),
  resetTemplate: $('reset-template'),
};

const state = {
  carrierId: readStorage(STORAGE.carrier) || CARRIERS[0].id,
  messageDirty: false,
  previewUrl: null,
};

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // 사파리 시크릿 모드 등에서 막히는 경우
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 저장 못 해도 사용에는 지장 없음 */
  }
}

/** 메시지가 잘려 보이지 않도록 높이를 내용에 맞춥니다. */
function autoGrow(node) {
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight + 2}px`;
}

function setHint(node, message, level) {
  node.textContent = message || '';
  node.className = 'hint' + (message && level ? ` hint--${level}` : '');
}

/* ---------------------------------------------------------------- 택배사 */

function renderCarriers() {
  el.carriers.innerHTML = '';
  CARRIERS.forEach((carrier) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'carrier';
    button.setAttribute('role', 'radio');
    button.dataset.id = carrier.id;
    button.setAttribute('aria-checked', String(carrier.id === state.carrierId));
    button.innerHTML = `
      <span class="carrier__name">${carrier.emoji} ${carrier.name}</span>
      <span class="carrier__eta">${carrier.etaText}</span>`;
    button.addEventListener('click', () => {
      state.carrierId = carrier.id;
      writeStorage(STORAGE.carrier, carrier.id);
      // 택배사마다 끊어 쓰는 방식이 달라서 입력칸 표기도 맞춰줍니다.
      const digits = digitsOnly(el.invoice.value);
      if (digits) el.invoice.value = formatInvoice(digits, carrier);
      renderCarriers();
      update();
    });
    el.carriers.appendChild(button);
  });
}

/* -------------------------------------------------------------- 상품 목록 */

function renderProducts() {
  el.products.innerHTML = '';
  PRODUCT_GROUPS.forEach((group) => {
    const box = document.createElement('div');
    box.className = 'products__group';

    const label = document.createElement('span');
    label.className = 'products__label';
    label.textContent = group.label;
    box.appendChild(label);

    group.items.forEach((item) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip--product';
      chip.textContent = item;
      chip.dataset.item = item;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        // 여러 개를 함께 보내는 경우가 많아서 눌렀다 뗐다 할 수 있게 했습니다.
        el.product.value = toggleProduct(el.product.value, item);
        syncProductChips();
        update();
      });
      box.appendChild(chip);
    });

    el.products.appendChild(box);
  });
  syncProductChips();
}

/** 칸에 직접 적은 내용과 버튼 상태를 맞춥니다. */
function syncProductChips() {
  const text = el.product.value;
  el.products.querySelectorAll('.chip--product').forEach((chip) => {
    const on = isSelected(text, chip.dataset.item);
    chip.classList.toggle('chip--on', on);
    chip.setAttribute('aria-pressed', String(on));
  });
}

/* ------------------------------------------------------------- 이미지 인식 */

async function handleImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    setHint(el.invoiceHint, '이미지 파일만 올릴 수 있습니다.', 'error');
    return;
  }

  showPreviewImage(file);
  el.candidates.hidden = true;
  el.ocr.hidden = false;
  el.ocrFill.style.width = '0%';
  el.ocrStatus.textContent = '이미지에서 송장번호를 읽는 중입니다…';

  try {
    const text = await recognizeNumbers(file, (progress) => {
      el.ocrFill.style.width = `${Math.round(progress * 100)}%`;
    });
    el.ocrFill.style.width = '100%';

    const carrier = getCarrier(state.carrierId);
    const candidates = extractCandidates(text, carrier).slice(0, 6);

    if (candidates.length === 0) {
      el.ocrStatus.textContent =
        '번호를 찾지 못했습니다. 송장번호 부분만 크게 잘라서 다시 올리거나 직접 입력해 주세요.';
      return;
    }

    el.ocrStatus.textContent = `${candidates.length}개의 번호를 찾았습니다.`;
    renderCandidates(candidates, carrier);

    // 가장 유력한 후보는 미리 채워둡니다. 다르면 아래에서 바로 바꿀 수 있습니다.
    el.invoice.value = formatInvoice(candidates[0].digits, carrier);
    update();
  } catch (error) {
    el.ocr.hidden = true;
    setHint(el.invoiceHint, error.message || '이미지를 읽지 못했습니다.', 'error');
  }
}

function renderCandidates(candidates, carrier) {
  el.candidatesList.innerHTML = '';
  candidates.forEach((candidate, index) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (index === 0 ? ' chip--best' : '');
    const matches = carrier.digitLengths.includes(candidate.digits.length);
    chip.innerHTML = `${formatInvoice(candidate.digits, carrier)}${
      matches ? '<span class="chip__tag">자릿수 일치</span>' : ''
    }`;
    chip.addEventListener('click', () => {
      el.invoice.value = formatInvoice(candidate.digits, carrier);
      update();
      el.invoice.focus();
    });
    el.candidatesList.appendChild(chip);
  });
  el.candidates.hidden = false;
}

function showPreviewImage(file) {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = URL.createObjectURL(file);
  el.previewImageEl.src = state.previewUrl;
  el.previewImage.hidden = false;
}

/* ------------------------------------------------------------------ 계산 */

function currentShipDate() {
  const value = el.shipDate.value;
  const date = value ? fromISODate(value) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function update() {
  const carrier = getCarrier(state.carrierId);
  const check = validateInvoice(el.invoice.value, carrier);
  // 아직 아무것도 안 넣은 첫 화면에서 빨간 글씨가 보이면 부담스러우니 비워둡니다.
  const untouched = el.invoice.value.trim() === '';
  setHint(
    el.invoiceHint,
    untouched ? '' : check.message,
    check.level === 'ok' ? null : check.level
  );

  const shipDate = currentShipDate();
  const arrival = estimateArrival(shipDate, carrier);

  // 발송일 자체가 쉬는 날이면 알려줍니다.
  const shipHoliday = holidayName(shipDate);
  if (shipHoliday) {
    setHint(el.dateHint, `${shipHoliday}입니다. 실제 발송은 다음 영업일에 이뤄질 수 있어요.`, 'warn');
  } else if (isWeekend(shipDate)) {
    setHint(el.dateHint, '주말입니다. 실제 발송은 다음 영업일에 이뤄질 수 있어요.', 'warn');
  } else if (!hasHolidayData(shipDate)) {
    setHint(el.dateHint, '이 연도의 공휴일 정보가 없어 주말만 빼고 계산했습니다.', 'warn');
  } else {
    setHint(el.dateHint, `도착 예상 ${arrival.text}`, 'ok');
  }

  const trackUrl = check.ok ? carrier.trackUrl(check.digits) : '';
  el.track.href = trackUrl || '#';
  el.track.setAttribute('aria-disabled', String(!trackUrl));

  if (!state.messageDirty) {
    const values = buildValues({
      customer: el.customer.value.trim(),
      product: el.product.value.trim(),
      carrier,
      invoiceDisplay: check.digits ? formatInvoice(check.digits, carrier) : '(송장번호 입력 전)',
      shipDateLong: formatLong(shipDate),
      arrivalText: arrival.text,
      trackUrl: trackUrl || '(송장번호를 넣으면 조회 주소가 만들어집니다)',
      holidayNames: holidaysBetween(shipDate, arrival.to),
    });
    el.message.value = renderTemplate(el.template.value || DEFAULT_TEMPLATE, values);
    autoGrow(el.message);
  }

  el.copy.setAttribute('aria-disabled', String(!check.ok));
}

/* ------------------------------------------------------------------ 동작 */

async function copyMessage() {
  const text = el.message.value;
  try {
    await navigator.clipboard.writeText(text);
    setHint(el.actionHint, '복사했습니다. 카카오톡에 붙여넣기 해주세요.', 'ok');
  } catch {
    // 클립보드 권한이 없는 브라우저용 대비책
    el.message.focus();
    el.message.select();
    const ok = document.execCommand?.('copy');
    setHint(
      el.actionHint,
      ok ? '복사했습니다. 카카오톡에 붙여넣기 해주세요.' : '복사가 막혀 있습니다. 길게 눌러 직접 복사해 주세요.',
      ok ? 'ok' : 'warn'
    );
  }
}

async function shareMessage() {
  try {
    await navigator.share({ text: el.message.value });
  } catch {
    /* 사용자가 취소한 경우 — 알릴 것 없음 */
  }
}

function renderTokens() {
  el.tokens.innerHTML = '';
  PLACEHOLDERS.forEach(({ key, desc }) => {
    const li = document.createElement('li');
    li.innerHTML = `<code>{{${key}}}</code> — ${desc}`;
    el.tokens.appendChild(li);
  });
  const note = document.createElement('li');
  note.innerHTML =
    '<code>[[ ... ]]</code> — 안에 든 값이 비어 있으면 그 부분을 통째로 지웁니다.';
  el.tokens.appendChild(note);
}

function bind() {
  ['input', 'change'].forEach((event) => {
    [el.invoice, el.customer, el.product, el.shipDate].forEach((node) =>
      node.addEventListener(event, update)
    );
  });
  el.product.addEventListener('input', syncProductChips);

  // 입력을 마치면 택배사 표기 방식대로 끊어서 보기 좋게 정리합니다.
  el.invoice.addEventListener('blur', () => {
    const digits = digitsOnly(el.invoice.value);
    if (digits) el.invoice.value = formatInvoice(digits, getCarrier(state.carrierId));
  });

  el.message.addEventListener('input', () => {
    autoGrow(el.message);
    state.messageDirty = true;
    el.regenerate.hidden = false;
    setHint(el.actionHint, '메시지를 직접 고쳤습니다. 입력을 바꿔도 이 내용을 유지합니다.', 'warn');
  });

  el.regenerate.addEventListener('click', () => {
    state.messageDirty = false;
    el.regenerate.hidden = true;
    setHint(el.actionHint, '', null);
    update();
  });

  el.copy.addEventListener('click', copyMessage);
  el.share.addEventListener('click', shareMessage);

  el.dropzone.addEventListener('click', () => el.file.click());
  el.dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      el.file.click();
    }
  });
  el.file.addEventListener('change', () => {
    if (el.file.files[0]) handleImage(el.file.files[0]);
    el.file.value = '';
  });

  ['dragenter', 'dragover'].forEach((event) =>
    el.dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      el.dropzone.classList.add('is-over');
    })
  );
  ['dragleave', 'drop'].forEach((event) =>
    el.dropzone.addEventListener(event, () => el.dropzone.classList.remove('is-over'))
  );
  el.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImage(file);
  });

  // 캡쳐 직후 Ctrl+V 로 바로 넣기
  document.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (file) {
      e.preventDefault();
      handleImage(file);
    }
  });

  el.template.addEventListener('input', () => {
    writeStorage(STORAGE.template, el.template.value);
    update();
  });
  el.resetTemplate.addEventListener('click', () => {
    el.template.value = DEFAULT_TEMPLATE;
    writeStorage(STORAGE.template, DEFAULT_TEMPLATE);
    state.messageDirty = false;
    el.regenerate.hidden = true;
    update();
  });
}

function init() {
  el.shipDate.value = toISODate(new Date());
  el.template.value = readStorage(STORAGE.template) || DEFAULT_TEMPLATE;
  if (!getCarrier(state.carrierId)) state.carrierId = CARRIERS[0].id;
  if (navigator.share) el.share.hidden = false;
  renderCarriers();
  renderProducts();
  renderTokens();
  bind();
  update();
}

init();
