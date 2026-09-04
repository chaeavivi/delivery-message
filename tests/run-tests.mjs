// 외부 라이브러리 없이 도는 테스트입니다. `npm test` 또는 `node tests/run-tests.mjs`
import assert from 'node:assert/strict';
import { getCarrier } from '../src/carriers.js';
import {
  addBusinessDays,
  estimateArrival,
  formatLong,
  formatShort,
  fromISODate,
  holidaysBetween,
  isBusinessDay,
  toISODate,
} from '../src/businessDays.js';
import { digitsOnly, extractCandidates, formatInvoice, validateInvoice } from '../src/invoice.js';
import {
  ALL_PRODUCTS,
  PRODUCT_GROUPS,
  formatProducts,
  isSelected,
  parseProducts,
  toggleProduct,
} from '../src/products.js';
import {
  DEFAULT_TEMPLATE,
  buildValues,
  collapseHolidayNames,
  renderTemplate,
  withJosa,
} from '../src/message.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push({ name, error });
  }
}

const epost = getCarrier('epost');
const gs = getCarrier('gspostbox');
const cu = getCarrier('cupost');

/* ---------------------------------------------------------------- 영업일 */

test('주말은 영업일이 아니다', () => {
  assert.equal(isBusinessDay(fromISODate('2026-09-05')), false); // 토
  assert.equal(isBusinessDay(fromISODate('2026-09-06')), false); // 일
  assert.equal(isBusinessDay(fromISODate('2026-09-04')), true); // 금
});

test('공휴일은 영업일이 아니다', () => {
  assert.equal(isBusinessDay(fromISODate('2026-09-25')), false); // 추석
  assert.equal(isBusinessDay(fromISODate('2026-10-09')), false); // 한글날
});

test('금요일 발송이면 다음 영업일은 월요일', () => {
  const monday = addBusinessDays(fromISODate('2026-09-04'), 1);
  assert.equal(toISODate(monday), '2026-09-07');
});

test('추석 연휴를 건너뛴다', () => {
  // 2026-09-23(수) 발송, 24~26 추석 연휴, 28(월) 대체공휴일 → 다음 영업일은 29(화)
  const next = addBusinessDays(fromISODate('2026-09-23'), 1);
  assert.equal(toISODate(next), '2026-09-29');
});

test('우체국은 익일~2일 구간이 나온다', () => {
  const arrival = estimateArrival(fromISODate('2026-09-04'), epost);
  assert.equal(toISODate(arrival.from), '2026-09-07');
  assert.equal(toISODate(arrival.to), '2026-09-08');
  assert.equal(arrival.text, '9/7(월) ~ 9/8(화)');
});

test('편의점택배는 2~3일 구간이 나온다', () => {
  const arrival = estimateArrival(fromISODate('2026-09-04'), gs);
  assert.equal(arrival.text, '9/8(화) ~ 9/9(수)');
  const cuArrival = estimateArrival(fromISODate('2026-09-04'), cu);
  assert.equal(cuArrival.text, arrival.text);
});

test('날짜 표기 형식', () => {
  assert.equal(formatLong(fromISODate('2026-09-04')), '2026년 9월 4일 (금)');
  assert.equal(formatShort(fromISODate('2026-12-25')), '12/25(금)');
});

test('배송 기간에 낀 공휴일을 알려준다', () => {
  const names = holidaysBetween(fromISODate('2026-10-08'), fromISODate('2026-10-13'));
  assert.deepEqual(names, ['한글날']);
});

/* ------------------------------------------------------------- 송장번호 */

test('숫자만 남긴다', () => {
  assert.equal(digitsOnly('1234-5678-9012-3'), '1234567890123');
  assert.equal(digitsOnly(null), '');
});

test('우체국 13자리는 4-4-4-1 로 끊는다', () => {
  assert.equal(formatInvoice('1234567890123', epost), '1234-5678-9012-3');
  assert.equal(formatInvoice('1234567890', gs), '1234567890');
});

test('빈 값과 자릿수 이상은 막는다', () => {
  assert.equal(validateInvoice('', epost).level, 'error');
  assert.equal(validateInvoice('12345', epost).level, 'error');
});

test('택배사 자릿수와 다르면 경고하되 진행은 시킨다', () => {
  const result = validateInvoice('1234567890', epost);
  assert.equal(result.ok, true);
  assert.equal(result.level, 'warn');
});

test('자릿수가 맞으면 통과', () => {
  assert.equal(validateInvoice('1234-5678-9012-3', epost).level, 'ok');
  assert.equal(validateInvoice('1234567890', gs).level, 'ok');
  assert.equal(validateInvoice('123456789012', cu).level, 'ok');
});

test('조회 주소에 송장번호가 들어간다', () => {
  assert.ok(epost.trackUrl('1234567890123').includes('1234567890123'));
  assert.ok(gs.trackUrl('1234567890').startsWith('https://'));
  assert.ok(cu.trackUrl('1234567890').startsWith('https://'));
});

/* ------------------------------------------------------- 이미지 인식 후보 */

test('띄어쓰기로 나뉜 번호를 하나로 붙여 읽는다', () => {
  const candidates = extractCandidates('등기번호 1234 5678 9012 3', epost);
  assert.equal(candidates[0].digits, '1234567890123');
});

test('하이픈으로 나뉜 번호도 읽는다', () => {
  const candidates = extractCandidates('1234-5678-9012-3', epost);
  assert.equal(candidates[0].digits, '1234567890123');
});

test('전화번호보다 송장번호를 앞에 둔다', () => {
  const text = '연락처 01012345678\n송장번호 1234567890123';
  const candidates = extractCandidates(text, epost);
  assert.equal(candidates[0].digits, '1234567890123');
});

test('택배사 자릿수에 맞는 후보를 먼저 보여준다', () => {
  const text = '주문번호 202609041234\n운송장 1234567890';
  const candidates = extractCandidates(text, gs);
  assert.equal(candidates[0].digits, '1234567890');
});

test('O 와 I 로 잘못 읽은 글자를 숫자로 고친다', () => {
  const candidates = extractCandidates('I23456789O123', epost);
  assert.equal(candidates[0].digits, '1234567890123');
});

test('숫자가 없으면 빈 배열', () => {
  assert.deepEqual(extractCandidates('송장번호를 찾을 수 없음', epost), []);
});

/* -------------------------------------------------------------- 메시지 */

test('선택 항목이 비면 그 부분만 사라진다', () => {
  const tpl = '[[{{고객명}}님, ]]안녕하세요';
  assert.equal(renderTemplate(tpl, { 고객명: '김채아' }), '김채아님, 안녕하세요');
  assert.equal(renderTemplate(tpl, { 고객명: '' }), '안녕하세요');
  assert.equal(renderTemplate(tpl, {}), '안녕하세요');
});

test('빈 줄이 과하게 생기지 않는다', () => {
  const tpl = 'a\n[[{{x}}]]\n\n\nb';
  assert.equal(renderTemplate(tpl, { x: '' }), 'a\n\nb');
});

test('기본 문구가 완성된다', () => {
  const shipDate = fromISODate('2026-09-04');
  const arrival = estimateArrival(shipDate, epost);
  const values = buildValues({
    customer: '김채아',
    product: '자격과정 교재',
    carrier: epost,
    invoiceDisplay: formatInvoice('1234567890123', epost),
    shipDateLong: formatLong(shipDate),
    arrivalText: arrival.text,
    trackUrl: epost.trackUrl('1234567890123'),
    holidayNames: holidaysBetween(shipDate, arrival.to),
  });
  const message = renderTemplate(DEFAULT_TEMPLATE, values);

  assert.ok(message.includes('채아힐링센터'));
  assert.ok(message.includes('김채아님'));
  assert.ok(message.includes('자격과정 교재'));
  assert.ok(message.includes('우체국택배'));
  assert.ok(message.includes('1234-5678-9012-3'));
  assert.ok(message.includes('2026년 9월 4일 (금)'));
  assert.ok(message.includes('영업일 기준 익일~2일 이내 발송'));
  assert.ok(message.includes('9/7(월) ~ 9/8(화)'));
  assert.ok(message.includes('service.epost.go.kr'));
  assert.ok(!message.includes('{{'), '치환되지 않은 자리표시자가 남아 있으면 안 됩니다');
  assert.ok(!message.includes('[['), '선택 표시가 남아 있으면 안 됩니다');
});

test('고객명·상품명 없이도 문장이 어색하지 않다', () => {
  const shipDate = fromISODate('2026-09-04');
  const arrival = estimateArrival(shipDate, gs);
  const message = renderTemplate(
    DEFAULT_TEMPLATE,
    buildValues({
      customer: '',
      product: '',
      carrier: gs,
      invoiceDisplay: '1234567890',
      shipDateLong: formatLong(shipDate),
      arrivalText: arrival.text,
      trackUrl: gs.trackUrl('1234567890'),
      holidayNames: [],
    })
  );
  assert.ok(message.includes('주문해 주신 상품이 발송되었습니다.'));
  assert.ok(!message.includes('님,'));
});

test('배송 기간에 공휴일이 있으면 안내 문장이 붙는다', () => {
  const shipDate = fromISODate('2026-10-07');
  const arrival = estimateArrival(shipDate, gs);
  const message = renderTemplate(
    DEFAULT_TEMPLATE,
    buildValues({
      carrier: gs,
      invoiceDisplay: '1234567890',
      shipDateLong: formatLong(shipDate),
      arrivalText: arrival.text,
      trackUrl: gs.trackUrl('1234567890'),
      holidayNames: holidaysBetween(shipDate, arrival.to),
    })
  );
  assert.ok(message.includes('한글날'));
});

test('같은 명절은 하나로 묶어서 안내한다', () => {
  assert.deepEqual(
    collapseHolidayNames(['추석 연휴', '추석', '추석 대체공휴일']),
    ['추석']
  );
  assert.deepEqual(collapseHolidayNames([]), []);
});

test('받침에 따라 조사를 고른다', () => {
  assert.equal(withJosa('추석', '이', '가'), '추석이');
  assert.equal(withJosa('어린이날', '이', '가'), '어린이날이');
  assert.equal(withJosa('부처님오신날', '이', '가'), '부처님오신날이');
  assert.equal(withJosa('신정', '이', '가'), '신정이');
  assert.equal(withJosa('개천절 대체휴가', '이', '가'), '개천절 대체휴가가');
});

test('추석 연휴를 낀 발송은 한 번만 언급한다', () => {
  const shipDate = fromISODate('2026-09-23');
  const arrival = estimateArrival(shipDate, getCarrier('epost'));
  const message = renderTemplate(
    DEFAULT_TEMPLATE,
    buildValues({
      carrier: getCarrier('epost'),
      invoiceDisplay: '1234-5678-9012-3',
      shipDateLong: formatLong(shipDate),
      arrivalText: arrival.text,
      trackUrl: 'https://example.test',
      holidayNames: holidaysBetween(shipDate, arrival.to),
    })
  );
  assert.ok(message.includes('배송 기간에 추석이 있어'));
  assert.equal(message.match(/추석/g).length, 1);
});

/* -------------------------------------------------------------- 상품 목록 */

test('취급 품목이 모두 들어 있다', () => {
  assert.deepEqual(ALL_PRODUCTS, [
    '자격증',
    '자격과정 교재',
    '레인보우프리즘',
    '컬러링코드',
    '마인드 보석함',
    '컬러테라피 교구재',
    '아트테라피 재료',
  ]);
  assert.equal(PRODUCT_GROUPS.length, 3);
});

test('품목을 눌렀다 다시 누르면 빠진다', () => {
  let text = '';
  text = toggleProduct(text, '자격증');
  assert.equal(text, '자격증');
  text = toggleProduct(text, '컬러링코드');
  assert.equal(text, '자격증, 컬러링코드');
  text = toggleProduct(text, '자격증');
  assert.equal(text, '컬러링코드');
  text = toggleProduct(text, '컬러링코드');
  assert.equal(text, '');
});

test('직접 적은 품목도 그대로 살린다', () => {
  const text = toggleProduct('선물 포장', '마인드 보석함');
  assert.equal(text, '선물 포장, 마인드 보석함');
  assert.deepEqual(parseProducts(text), ['선물 포장', '마인드 보석함']);
  assert.equal(isSelected(text, '마인드 보석함'), true);
  assert.equal(isSelected(text, '컬러링코드'), false);
});

test('가운뎃점으로 적어도 나눠 읽는다', () => {
  assert.deepEqual(parseProducts('자격증 · 컬러링코드'), ['자격증', '컬러링코드']);
  assert.deepEqual(parseProducts('  '), []);
  assert.equal(formatProducts(['자격증', '컬러링코드']), '자격증, 컬러링코드');
});

test('여러 품목이 메시지에 자연스럽게 들어간다', () => {
  const shipDate = fromISODate('2026-09-04');
  const arrival = estimateArrival(shipDate, epost);
  const message = renderTemplate(
    DEFAULT_TEMPLATE,
    buildValues({
      customer: '김채아',
      product: toggleProduct(toggleProduct('', '컬러링코드'), '컬러테라피 교구재'),
      carrier: epost,
      invoiceDisplay: '1234-5678-9012-3',
      shipDateLong: formatLong(shipDate),
      arrivalText: arrival.text,
      trackUrl: epost.trackUrl('1234567890123'),
      holidayNames: [],
    })
  );
  assert.ok(message.includes('주문해 주신 컬러링코드, 컬러테라피 교구재 상품이 발송되었습니다.'));
});

/* --------------------------------------------------------------- 결과 */

if (failures.length) {
  console.error(`\n실패 ${failures.length}건 / 통과 ${passed}건\n`);
  for (const { name, error } of failures) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message.split('\n')[0]}`);
  }
  process.exit(1);
}
console.log(`✓ 테스트 ${passed}건 모두 통과`);
