// 채아힐링센터 취급 품목.
//
// 품목이 늘거나 이름이 바뀌면 이 목록만 고치면 화면 버튼도 같이 바뀝니다.
export const PRODUCT_GROUPS = [
  {
    label: '자격 과정',
    items: ['자격증', '자격과정 교재'],
  },
  {
    label: '컬러테라피 보드게임',
    items: ['레인보우프리즘', '컬러링코드', '마인드 보석함'],
  },
  {
    label: '교구·재료',
    items: ['컬러테라피 교구재', '아트테라피 재료'],
  },
];

/** 목록에 있는 모든 품목 이름 */
export const ALL_PRODUCTS = PRODUCT_GROUPS.flatMap((group) => group.items);

/** '자격증, 컬러링코드' -> ['자격증', '컬러링코드'] */
export function parseProducts(text) {
  return String(text || '')
    .split(/[,·、]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** ['자격증', '컬러링코드'] -> '자격증, 컬러링코드' */
export function formatProducts(list) {
  return list.join(', ');
}

/**
 * 품목 버튼을 눌렀을 때: 이미 들어 있으면 빼고, 없으면 뒤에 붙입니다.
 * 사장님이 칸에 직접 적어둔 내용은 건드리지 않습니다.
 */
export function toggleProduct(text, item) {
  const list = parseProducts(text);
  const at = list.indexOf(item);
  if (at >= 0) list.splice(at, 1);
  else list.push(item);
  return formatProducts(list);
}

export function isSelected(text, item) {
  return parseProducts(text).includes(item);
}
