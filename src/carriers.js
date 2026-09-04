// 채아힐링센터에서 사용하는 택배사 3곳.
//
// 조회 URL이 바뀌면 여기 trackUrl 한 줄만 고치면 됩니다.
export const CARRIERS = [
  {
    id: 'epost',
    name: '우체국택배',
    short: '우체국',
    emoji: '🏤',
    // 사장님 안내 문구 그대로
    etaText: '영업일 기준 익일~2일 이내 발송',
    minBusinessDays: 1,
    maxBusinessDays: 2,
    // 등기/택배 등기번호는 13자리
    digitLengths: [13],
    // 13자리는 4-4-4-1 로 끊어 읽는 것이 우체국 표기 방식
    groups: [4, 4, 4, 1],
    trackUrl: (digits) =>
      `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${digits}`,
  },
  {
    id: 'gspostbox',
    name: 'GS Postbox 택배',
    short: 'GS Postbox',
    emoji: '🏪',
    etaText: '영업일 기준 2~3일 이내 배송',
    minBusinessDays: 2,
    maxBusinessDays: 3,
    digitLengths: [10, 12],
    groups: null,
    // GS Postbox 택배 운영사(CVSnet) 조회 페이지
    trackUrl: (digits) =>
      `https://www.cvsnet.co.kr/invoice/tracking.do?invoice_no=${digits}`,
  },
  {
    id: 'cupost',
    name: 'CU 편의점택배',
    short: 'CU택배',
    emoji: '🏪',
    etaText: '영업일 기준 2~3일 이내 배송',
    minBusinessDays: 2,
    maxBusinessDays: 3,
    digitLengths: [10, 12],
    groups: null,
    trackUrl: (digits) =>
      `https://www.cupost.co.kr/postbox/delivery/localResult.cupost?invoice_no=${digits}`,
  },
];

export function getCarrier(id) {
  return CARRIERS.find((c) => c.id === id) || null;
}
