// 写真の圧縮（ASHIATOの photo.js を流用）。canvasに描き直してJPEGにするので、
// この時点でEXIF（GPS含む）は消える。Worker側でも保存前にもう一度取り除く（S-03）。
const LONG_SIDE_LIMIT = 1280;
const TARGET_BYTES = 300 * 1024;
const QUALITY_STEPS = [0.75, 0.7, 0.6, 0.5];

function encodeCanvas(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

async function encodeWithQualitySteps(canvas) {
  let result = null;
  for (const quality of QUALITY_STEPS) {
    result = await encodeCanvas(canvas, quality);
    if (!result) {
      throw new Error("画像のエンコードに失敗しました");
    }
    if (result.size <= TARGET_BYTES) {
      break;
    }
  }
  return result;
}

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let { width, height } = img;
        const longSide = Math.max(width, height);
        if (longSide > LONG_SIDE_LIMIT) {
          const scale = LONG_SIDE_LIMIT / longSide;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        encodeWithQualitySteps(canvas).then(resolve).catch(reject);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした"));
    };

    img.src = objectUrl;
  });
}
