// 송장번호 정리 / 검증 / 이미지에서 뽑아낸 글자에서 후보 찾기

const MIN_LEN = 9;
const MAX_LEN = 14;

// 캡쳐 이미지에서 자주 잘못 읽히는 글자들
const OCR_CONFUSIONS = {
  O: '0', o: '0', D: '0', Q: '0',
  I: '1', l: '1', i: '1', '|': '1', ']': '1', '!': '1',
  Z: '2', z: '2',
  S: '5', s: '5',
  G: '6',
  T: '7',
  B: '8',
  g: '9', q: '9',
};

/** 숫자만 남깁니다. */
export function digitsOnly(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

/** 화면 표시용 포맷. 우체국 13자리는 4-4-4-1 로 끊습니다. */
export function formatInvoice(digits, carrier) {
  const groups = carrier && carrier.groups;
  if (!groups) return digits;
  const total = groups.reduce((a, b) => a + b, 0);
  if (digits.length !== total) return digits;
  const parts = [];
  let at = 0;
  for (const size of groups) {
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  return parts.join('-');
}

/**
 * 검증은 "막는" 것이 아니라 "알려주는" 용도입니다.
 * 택배사가 자릿수 규칙을 바꿔도 메시지는 그대로 만들 수 있어야 하니까요.
 */
export function validateInvoice(raw, carrier) {
  const digits = digitsOnly(raw);
  if (!digits) {
    return { digits, ok: false, level: 'error', message: '송장번호를 입력해 주세요.' };
  }
  if (digits.length < MIN_LEN || digits.length > MAX_LEN) {
    return {
      digits,
      ok: false,
      level: 'error',
      message: `송장번호는 보통 ${MIN_LEN}~${MAX_LEN}자리입니다. 지금 ${digits.length}자리예요.`,
    };
  }
  if (carrier && !carrier.digitLengths.includes(digits.length)) {
    return {
      digits,
      ok: true,
      level: 'warn',
      message: `${carrier.short} 송장번호는 보통 ${carrier.digitLengths.join(
        '자리 또는 '
      )}자리인데 ${digits.length}자리입니다. 한 번만 확인해 주세요.`,
    };
  }
  return { digits, ok: true, level: 'ok', message: '' };
}

function fixConfusions(token) {
  const chars = [...token];
  const digitCount = chars.filter((c) => /\d/.test(c)).length;
  // 절반 이상이 숫자일 때만 교정합니다. 그냥 영어 단어를 숫자로 바꾸면 안 되니까요.
  if (digitCount * 2 < chars.length) return token;
  return chars.map((c) => (OCR_CONFUSIONS[c] !== undefined ? OCR_CONFUSIONS[c] : c)).join('');
}

// 송장번호가 적혀 있을 법한 줄에는 점수를 더하고,
// 주문번호·연락처처럼 헷갈리기 쉬운 줄에는 점수를 뺍니다.
const HINT_WORDS = ['송장', '운송장', '등기', 'invoice', 'tracking', 'waybill'];
const PENALTY_WORDS = ['주문번호', '주문', '연락처', '전화', '휴대', '카드', '계좌', '금액', 'order', 'tel', 'phone'];

/**
 * OCR 로 읽은 글자 덩어리에서 송장번호 후보를 뽑아 점수순으로 돌려줍니다.
 * 캡쳐 이미지에는 전화번호·금액·주문번호가 같이 찍히기 때문에
 * 하나만 고르지 않고 후보를 보여준 뒤 사장님이 고르게 합니다.
 */
export function extractCandidates(text, carrier) {
  const found = new Map(); // digits -> score
  const lines = String(text || '').split(/\r?\n/);

  lines.forEach((line) => {
    const lowered = line.toLowerCase();
    const hinted = HINT_WORDS.some((w) => lowered.includes(w));
    const penalized = PENALTY_WORDS.some((w) => lowered.includes(w));
    const fixed = line.split(/\s+/).map(fixConfusions).join(' ');

    // 1) 있는 그대로, 2) 숫자 사이의 공백/하이픈을 붙인 형태 둘 다 훑습니다.
    const compact = fixed.replace(/(?<=\d)[\s.\-_]+(?=\d)/g, '');
    for (const variant of [fixed, compact]) {
      const matches = variant.match(new RegExp(`\\d{${MIN_LEN},${MAX_LEN}}`, 'g')) || [];
      for (const digits of matches) {
        let score = digits.length;
        if (carrier && carrier.digitLengths.includes(digits.length)) score += 100;
        if (hinted) score += 30;
        if (penalized) score -= 30;
        // 010 으로 시작하는 11자리는 거의 전화번호입니다.
        if (/^01[016789]/.test(digits) && digits.length === 11) score -= 80;
        const prev = found.get(digits);
        if (prev === undefined || score > prev) found.set(digits, score);
      }
    }
  });

  return [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([digits, score]) => ({ digits, score }));
}
