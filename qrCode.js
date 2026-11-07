// Pure JavaScript QR Code Generator (Zero-dependency, self-contained)
// Based on QR Code Model 2 algorithm

function createQRCode(text, errorCorrectionLevel = 'M') {
  // Simple & reliable QR matrix generator
  // Supporting byte mode encoding for URLs
  const PAD0 = 0xec;
  const PAD1 = 0x11;

  const EC_LEVELS = {
    'L': { ordinal: 1, formatBits: 0x01 },
    'M': { ordinal: 0, formatBits: 0x00 },
    'Q': { ordinal: 3, formatBits: 0x03 },
    'H': { ordinal: 2, formatBits: 0x02 }
  };

  // Minimal version determination based on length of text
  function getVersion(len) {
    if (len <= 14) return 1;
    if (len <= 26) return 2;
    if (len <= 42) return 3;
    if (len <= 62) return 4;
    if (len <= 84) return 5;
    if (len <= 106) return 6;
    if (len <= 122) return 7;
    if (len <= 152) return 8;
    if (len <= 180) return 9;
    return 10;
  }

  // Version specs: [totalCodewords, ecCodewordsPerBlock, numBlocks]
  const VERSION_SPECS = {
    1: [26, 10, 1],
    2: [44, 16, 1],
    3: [70, 26, 1],
    4: [100, 18, 2],
    5: [134, 24, 2],
    6: [172, 16, 4],
    7: [196, 18, 4],
    8: [242, 22, 4],
    9: [292, 22, 5],
    10: [346, 26, 5]
  };

  const utf8Bytes = Buffer.from(text, 'utf8');
  const version = getVersion(utf8Bytes.length);
  const size = version * 4 + 17;
  const [totalCodewords, ecCodewords, numBlocks] = VERSION_SPECS[version] || [346, 26, 5];
  const dataCodewords = totalCodewords - ecCodewords * numBlocks;

  // Encode byte mode stream
  const bits = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for versions 1-9)
  pushBits(utf8Bytes.length, version < 10 ? 8 : 16);
  // Data
  for (let i = 0; i < utf8Bytes.length; i++) {
    pushBits(utf8Bytes[i], 8);
  }
  // Terminator
  for (let i = 0; i < 4 && bits.length < dataCodewords * 8; i++) {
    bits.push(0);
  }
  // Byte align
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  // Pad bytes
  let padByte = 0;
  while (bits.length < dataCodewords * 8) {
    pushBits(padByte === 0 ? PAD0 : PAD1, 8);
    padByte ^= 1;
  }

  // Convert bits to bytes
  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i + j];
    }
    dataBytes.push(byte);
  }

  // GF(256) Math for Reed-Solomon Error Correction
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    EXP[i + 255] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], EXP[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    return poly;
  }

  function rsCalculate(data, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const result = new Array(ecCount).fill(0);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ result[0];
      result.shift();
      result.push(0);
      for (let j = 0; j < ecCount; j++) {
        result[j] ^= gfMul(gen[j], factor);
      }
    }
    return result;
  }

  // Partition into blocks & compute EC
  const blockSize = Math.floor(dataCodewords / numBlocks);
  const blocks = [];
  const ecBlocks = [];
  for (let i = 0; i < numBlocks; i++) {
    const start = i * blockSize;
    const end = (i === numBlocks - 1) ? dataCodewords : (i + 1) * blockSize;
    const blockData = dataBytes.slice(start, end);
    blocks.push(blockData);
    ecBlocks.push(rsCalculate(blockData, ecCodewords));
  }

  // Interleave
  const finalCodewords = [];
  const maxBlockLen = Math.max(...blocks.map(b => b.length));
  for (let i = 0; i < maxBlockLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < blocks[b].length) finalCodewords.push(blocks[b][i]);
    }
  }
  for (let i = 0; i < ecCodewords; i++) {
    for (let b = 0; b < numBlocks; b++) {
      finalCodewords.push(ecBlocks[b][i]);
    }
  }

  // Initialize Matrix
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));
  const isReserved = Array.from({ length: size }, () => Array(size).fill(false));

  function setFunctionModule(r, c, val) {
    matrix[r][c] = val;
    isReserved[r][c] = true;
  }

  // Finder Patterns
  function drawFinderPattern(r, c) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
          const isBlack = (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setFunctionModule(nr, nc, isBlack ? 1 : 0);
        } else {
          setFunctionModule(nr, nc, 0); // Separator
        }
      }
    }
  }

  drawFinderPattern(0, 0);
  drawFinderPattern(0, size - 7);
  drawFinderPattern(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0 ? 1 : 0);
    setFunctionModule(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Dark module
  setFunctionModule(size - 8, 8, 1);

  // Alignment patterns for version >= 2
  const ALIGN_POSITIONS = {
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50]
  };

  const align = ALIGN_POSITIONS[version] || [];
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      const ar = align[i];
      const ac = align[j];
      if (isReserved[ar][ac]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isEdge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          const isCenter = dr === 0 && dc === 0;
          setFunctionModule(ar + dr, ac + dc, isEdge || isCenter ? 1 : 0);
        }
      }
    }
  }

  // Reserve format bits
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isReserved[8][i] = true;
      isReserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isReserved[size - 1 - i][8] = true;
    isReserved[8][size - 1 - i] = true;
  }

  // Place data bits with Zigzag scan
  const allBits = [];
  for (let i = 0; i < finalCodewords.length; i++) {
    for (let b = 7; b >= 0; b--) {
      allBits.push((finalCodewords[i] >> b) & 1);
    }
  }

  let bitIdx = 0;
  let dir = -1; // up
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // skip timing col
    const rStart = dir === -1 ? size - 1 : 0;
    const rEnd = dir === -1 ? -1 : size;
    for (let r = rStart; r !== rEnd; r += dir) {
      for (let c = right; c > right - 2; c--) {
        if (!isReserved[r][c]) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          // Apply mask 0: (r + c) % 2 === 0
          const mask = ((r + c) % 2 === 0);
          matrix[r][c] = mask ? bit ^ 1 : bit;
        }
      }
    }
    dir = -dir;
  }

  // Format info (Mask 0, EC Level M => 0b00)
  // Format string with BCH (15, 5) code for (0b00000) ^ 0b101010000010010 = 0x5412
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Apply to top-left and split corners
  const posTopLeft = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    matrix[posTopLeft[i][0]][posTopLeft[i][1]] = formatBits[i];
  }
  const posSplit = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
  ];
  for (let i = 0; i < 15; i++) {
    matrix[posSplit[i][0]][posSplit[i][1]] = formatBits[i];
  }

  return matrix;
}

function generateSvgQRCode(text, moduleSize = 8, margin = 4) {
  try {
    const matrix = createQRCode(text);
    const count = matrix.length;
    const totalSize = (count + margin * 2) * moduleSize;

    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (matrix[r][c] === 1) {
          const x = (c + margin) * moduleSize;
          const y = (r + margin) * moduleSize;
          path += `M${x},${y}h${moduleSize}v${moduleSize}h-${moduleSize}z `;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}">
      <rect width="100%" height="100%" fill="#ffffff" rx="16"/>
      <path d="${path}" fill="#0f172a" />
    </svg>`;
  } catch (err) {
    // Fallback if URL is too long or error occurs
    return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
      <rect width="220" height="220" fill="#1e293b" rx="12"/>
      <text x="50%" y="45%" text-anchor="middle" fill="#38bdf8" font-size="14" font-family="sans-serif">Scan to Connect</text>
      <text x="50%" y="60%" text-anchor="middle" fill="#94a3b8" font-size="11" font-family="sans-serif">${text}</text>
    </svg>`;
  }
}

module.exports = {
  createQRCode,
  generateSvgQRCode
};
