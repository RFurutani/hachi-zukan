// 写真の圧縮（ASHIATOの photo.js を流用）。canvasに描き直してJPEGにするので、
// この時点でEXIF（GPS含む）は消える。Worker側でも保存前にもう一度取り除く（S-03）。
// 🔴 写真を選んだ直後に呼ぶ（J-22）。Androidの File は端末上のファイルへの参照なので、
// フォームを入力している間に読めなくなることがある。
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

async function readIntoMemory(file) {
  try {
    return new Blob([await file.arrayBuffer()], { type: file.type });
  } catch (err) {
    throw new Error(`写真のファイルを読めませんでした（${err.name}）。もう一度選び直してください。`);
  }
}

function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image element"));
    };
    img.src = objectUrl;
  });
}

async function decode(blob, file) {
  try {
    return await loadImageElement(blob);
  } catch {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      const size = (file.size / (1024 * 1024)).toFixed(1);
      throw new Error(`写真を画像として開けませんでした（${file.type || "形式不明"}、${size}MB）。別の写真を選んでください。`);
    }
  }
}

export async function compressImage(file) {
  const blob = await readIntoMemory(file);
  const source = await decode(blob, file);

  let { width, height } = source;
  const longSide = Math.max(width, height);
  if (longSide > LONG_SIDE_LIMIT) {
    const scale = LONG_SIDE_LIMIT / longSide;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(source, 0, 0, width, height);
  if (source.close) {
    source.close();
  }
  return encodeWithQualitySteps(canvas);
}
