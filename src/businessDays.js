import { KR_HOLIDAYS, COVERED_YEARS } from './holidays.js';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** Date -> 'YYYY-MM-DD' (로컬 기준) */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' -> Date (로컬 자정). 시간대 때문에 하루 밀리는 것을 막습니다. */
export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function holidayName(date) {
  return KR_HOLIDAYS[toISODate(date)] || null;
}

export function isBusinessDay(date) {
  return !isWeekend(date) && !holidayName(date);
}

/**
 * 기준일 다음 영업일부터 세어서 n번째 영업일을 돌려줍니다.
 * n = 1 이면 "익일(다음 영업일)".
 */
export function addBusinessDays(date, n) {
  let cursor = new Date(date.getTime());
  let left = n;
  let guard = 0;
  while (left > 0 && guard < 400) {
    cursor = addDays(cursor, 1);
    if (isBusinessDay(cursor)) left -= 1;
    guard += 1;
  }
  return cursor;
}

/** '9/7(월)' */
export function formatShort(date) {
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAY_KO[date.getDay()]})`;
}

/** '2026년 9월 4일 (금)' */
export function formatLong(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${
    WEEKDAY_KO[date.getDay()]
  })`;
}

/**
 * 발송일과 택배사 소요일로 도착 예상 구간을 만듭니다.
 * 최소일과 최대일이 같은 날이면 한 번만 표기합니다.
 */
export function estimateArrival(shipDate, carrier) {
  const from = addBusinessDays(shipDate, carrier.minBusinessDays);
  const to = addBusinessDays(shipDate, carrier.maxBusinessDays);
  const sameDay = toISODate(from) === toISODate(to);
  return {
    from,
    to,
    text: sameDay ? formatShort(from) : `${formatShort(from)} ~ ${formatShort(to)}`,
  };
}

/** 공휴일 정보를 가지고 있는 기간인지 (UI 주의 문구용) */
export function hasHolidayData(date) {
  return COVERED_YEARS.includes(date.getFullYear());
}

/** 발송일 ~ 도착 예상일 사이에 낀 공휴일 이름들 (안내 문구에 덧붙이기 좋음) */
export function holidaysBetween(startDate, endDate) {
  const names = [];
  let cursor = addDays(startDate, 1);
  let guard = 0;
  while (cursor <= endDate && guard < 400) {
    const name = holidayName(cursor);
    if (name && !names.includes(name)) names.push(name);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return names;
}
