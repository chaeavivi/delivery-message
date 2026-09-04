// 캡쳐 이미지에서 글자를 읽어옵니다. (브라우저에서만 동작)
//
// tesseract.js 를 CDN 에서 필요할 때만 불러옵니다. 이미지를 올리지 않으면
// 다운로드도 일어나지 않아서 첫 화면이 가볍습니다.

// 한 곳이 막혀 있을 때를 대비해 두 곳에서 순서대로 시도합니다.
const TESSERACT_SOURCES = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js',
];

let loadPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`불러오기 실패: ${src}`));
    };
    document.head.appendChild(script);
  });
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  if (!loadPromise) {
    loadPromise = (async () => {
      for (const src of TESSERACT_SOURCES) {
        try {
          await loadScript(src);
          if (window.Tesseract) return window.Tesseract;
        } catch {
          /* 다음 주소로 넘어갑니다 */
        }
      }
      loadPromise = null; // 다음에 다시 시도할 수 있게 초기화
      throw new Error(
        '글자 인식 기능을 불러오지 못했습니다. 인터넷 연결을 확인하거나 송장번호를 직접 입력해 주세요.'
      );
    })();
  }
  return loadPromise;
}

/** 오츠(Otsu) 방식으로 밝기 경계값을 찾습니다. */
function otsuThreshold(histogram, total) {
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * 인식률을 올리기 위한 전처리:
 * 너무 작은 캡쳐는 키우고, 흑백으로 바꾼 뒤 글자와 배경을 또렷하게 나눕니다.
 * 어두운 배경(다크모드) 캡쳐는 반전시켜 항상 "흰 바탕 검은 글씨"로 맞춥니다.
 */
export async function preprocessImage(file) {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  // 1200 ~ 2400px 사이로 맞춥니다. 너무 크면 느리고, 너무 작으면 안 읽힙니다.
  let scale = 1;
  if (longest < 1200) scale = Math.min(3, 1200 / longest);
  else if (longest > 2400) scale = 2400 / longest;

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const gray = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const value = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    const level = value | 0;
    gray[p] = level;
    histogram[level] += 1;
  }

  const threshold = otsuThreshold(histogram, gray.length);
  let darkCount = 0;
  for (let p = 0; p < gray.length; p += 1) if (gray[p] < threshold) darkCount += 1;
  const invert = darkCount * 2 > gray.length; // 배경이 어두우면 뒤집습니다.

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    let on = gray[p] < threshold; // 경계값보다 어두우면 글자로 봅니다.
    if (invert) on = !on;
    const value = on ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * 이미지에서 숫자를 읽어 텍스트로 돌려줍니다.
 * onProgress(0~1) 로 진행률을 알려줍니다.
 */
export async function recognizeNumbers(file, onProgress) {
  const Tesseract = await loadTesseract();
  const canvas = await preprocessImage(file);
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(m.progress);
      }
    },
  });
  try {
    await worker.setParameters({
      // 송장번호는 숫자와 구분기호뿐입니다. 후보를 좁히면 훨씬 정확해집니다.
      tessedit_char_whitelist: '0123456789- ',
    });
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}
