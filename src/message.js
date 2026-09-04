// 안내 메시지 템플릿 렌더링
//
// {{이름}}      : 값을 그대로 끼워 넣습니다.
// [[ ... ]]     : 안에 든 {{이름}} 중 하나라도 비어 있으면 그 덩어리를 통째로 지웁니다.
//                 (고객명이나 상품명을 안 적었을 때 "님," 만 덩그러니 남는 걸 막습니다.)

export const DEFAULT_TEMPLATE = `안녕하세요, 채아힐링센터입니다 🌿
[[{{고객명}}님, ]]주문해 주신 [[{{상품명}} ]]상품이 발송되었습니다.

📦 택배사 : {{택배사}}
🔢 송장번호 : {{송장번호}}
🗓 발송일 : {{발송일}}
🚚 배송안내 : {{배송안내}}
📍 도착 예상 : {{도착예상}}

▼ 실시간 배송조회 (아래 주소를 눌러주세요)
{{조회링크}}

주말·공휴일은 배송이 진행되지 않아 하루 이틀 늦어질 수 있습니다.[[
{{공휴일안내}}]]
받아보시고 궁금한 점 있으시면 편하게 메시지 주세요. 감사합니다 😊`;

export const PLACEHOLDERS = [
  { key: '고객명', desc: '입력한 고객 이름 (비우면 그 부분이 사라집니다)' },
  { key: '상품명', desc: '입력한 상품 이름 (비우면 그 부분이 사라집니다)' },
  { key: '택배사', desc: '선택한 택배사 이름' },
  { key: '송장번호', desc: '보기 좋게 끊어 쓴 송장번호' },
  { key: '발송일', desc: '2026년 9월 4일 (금) 형태' },
  { key: '배송안내', desc: '택배사별 소요기간 안내 문구' },
  { key: '도착예상', desc: '9/8(화) ~ 9/9(수) 형태' },
  { key: '조회링크', desc: '송장번호가 들어간 배송조회 주소' },
  { key: '공휴일안내', desc: '배송 기간에 공휴일이 끼어 있을 때만 나오는 안내' },
];

/** '추석 연휴', '추석', '추석 대체공휴일' 이 같이 나오면 '추석' 하나로 묶습니다. */
export function collapseHolidayNames(names) {
  const bases = [];
  (names || []).forEach((name) => {
    const base = String(name).replace(/\s*(연휴|대체공휴일)$/, '').trim();
    if (base && !bases.includes(base)) bases.push(base);
  });
  return bases;
}

/** 받침 유무에 따라 '이/가' 같은 조사를 골라 붙입니다. */
export function withJosa(word, withBatchim, withoutBatchim) {
  const last = String(word).trim().slice(-1);
  const code = last.charCodeAt(0);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  // 한글이 아니면(숫자·영문) 판단이 어려우니 받침 없는 쪽으로 둡니다.
  const hasBatchim = isHangul && (code - 0xac00) % 28 !== 0;
  return word + (hasBatchim ? withBatchim : withoutBatchim);
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

export function renderTemplate(template, values) {
  const get = (key) => (values[key] == null ? '' : String(values[key]));

  // 1) 선택 덩어리 처리
  let out = String(template).replace(/\[\[([\s\S]*?)\]\]/g, (_, inner) => {
    const keys = [...inner.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
    if (keys.length === 0) return inner;
    if (keys.some((k) => isBlank(values[k]))) return '';
    return inner;
  });

  // 2) 남은 자리표시자 채우기
  out = out.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => get(key));

  // 3) 빈 줄이 세 줄 이상 이어지면 두 줄로 줄입니다.
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** 화면 입력값들을 템플릿 값으로 바꿔줍니다. */
export function buildValues({
  customer,
  product,
  carrier,
  invoiceDisplay,
  shipDateLong,
  arrivalText,
  trackUrl,
  holidayNames,
}) {
  return {
    고객명: customer || '',
    상품명: product || '',
    택배사: carrier ? carrier.name : '',
    송장번호: invoiceDisplay || '',
    발송일: shipDateLong || '',
    배송안내: carrier ? carrier.etaText : '',
    도착예상: arrivalText || '',
    조회링크: trackUrl || '',
    공휴일안내: (() => {
      const bases = collapseHolidayNames(holidayNames);
      if (!bases.length) return '';
      const listed = bases.join(', ');
      return `(배송 기간에 ${withJosa(listed, '이', '가')} 있어 조금 늦어질 수 있습니다)`;
    })(),
  };
}
