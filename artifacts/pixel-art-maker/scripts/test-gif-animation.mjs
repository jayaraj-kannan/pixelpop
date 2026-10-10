import assert from 'node:assert/strict';
import { encodeGifBase64, renderGifFrame } from '../src/lib/pixel-art.ts';

function sample(width = 64, height = 48) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      data.set([(Math.floor(x / 4) * 19) % 256, (Math.floor(y / 4) * 27) % 256,
        ((Math.floor(x / 4) + Math.floor(y / 4)) * 23) % 256, 255], offset);
    }
  }
  return { width, height, data };
}

function inspectGif(base64) {
  const bytes = Buffer.from(base64, 'base64');
  assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  let offset = 13;
  let globalPalette = Buffer.alloc(0);
  if (bytes[10] & 0x80) {
    const size = 3 * (1 << ((bytes[10] & 7) + 1));
    globalPalette = bytes.subarray(offset, offset + size);
    offset += size;
  }
  let delay = 0;
  let repeats = null;
  const frames = [];
  const blocks = () => {
    const chunks = [];
    while (bytes[offset]) {
      const size = bytes[offset++];
      chunks.push(bytes.subarray(offset, offset + size));
      offset += size;
      assert.ok(offset < bytes.length, 'Sub-block exceeds file bounds');
    }
    offset++;
    return Buffer.concat(chunks);
  };
  let trailer = false;
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) { trailer = true; break; }
    if (marker === 0x21) {
      const label = bytes[offset++];
      if (label === 0xf9) {
        assert.equal(bytes[offset++], 4);
        offset++;
        delay = bytes.readUInt16LE(offset) * 10;
        offset += 3;
        assert.equal(bytes[offset++], 0);
      } else if (label === 0xff) {
        const length = bytes[offset++];
        const application = bytes.subarray(offset, offset + length).toString();
        offset += length;
        const extension = blocks();
        if (application === 'NETSCAPE2.0') repeats = extension.readUInt16LE(1);
      } else {
        blocks();
      }
    } else if (marker === 0x2c) {
      assert.equal(bytes.readUInt16LE(offset + 4), width);
      assert.equal(bytes.readUInt16LE(offset + 6), height);
      offset += 8;
      const packed = bytes[offset++];
      let palette = globalPalette;
      if (packed & 0x80) {
        const size = 3 * (1 << ((packed & 7) + 1));
        palette = bytes.subarray(offset, offset + size);
        offset += size;
      }
      assert.ok(bytes[offset++] >= 2, 'Invalid LZW code size');
      frames.push({ delay, signature: Buffer.concat([palette, blocks()]).toString('base64') });
    } else {
      throw Error(`Unexpected GIF marker: ${marker}`);
    }
  }
  assert.ok(trailer, 'GIF must have a trailer');
  assert.equal(repeats, 0, 'GIF must loop indefinitely');
  assert.equal(frames.length, 12);
  assert.ok(new Set(frames.map((frame) => frame.signature)).size > 1, 'Animation frames must vary');
  return { width, height, frames };
}

const image = sample();
const delays = { slow: 200, normal: 120, fast: 70 };
let combinations = 0;
for (const effect of ['pulse', 'bounce', 'sway', 'zoom', 'wobble']) {
  for (const speed of ['slow', 'normal', 'fast']) {
    for (const strength of ['gentle', 'normal', 'bold']) {
      const options = { effect, speed, strength };
      const frame = renderGifFrame(image, 3, options);
      assert.notDeepEqual(frame, image.data, `${effect} must change the photo`);
      for (let i = 3; i < frame.length; i += 4) assert.equal(frame[i], 255, 'No empty motion borders');
      assert.deepEqual(renderGifFrame(image, 12, options), image.data, 'Loop endpoint matches start');
      const gif = inspectGif(encodeGifBase64(image, options));
      assert.equal(gif.width, image.width);
      assert.equal(gif.height, image.height);
      assert.ok(gif.frames.every((frame) => frame.delay === delays[speed]));
      combinations++;
    }
  }
  assert.notDeepEqual(
    renderGifFrame(image, 3, { effect, speed: 'normal', strength: 'gentle' }),
    renderGifFrame(image, 3, { effect, speed: 'normal', strength: 'bold' }),
    'Strength must change the rendered effect',
  );
}
for (const [width, height] of [[8, 96], [96, 8]]) {
  const narrow = sample(width, height);
  for (const effect of ['bounce', 'sway', 'zoom', 'wobble']) {
    const frame = renderGifFrame(narrow, 3, { effect, speed: 'normal', strength: 'bold' });
    for (let i = 3; i < frame.length; i += 4) assert.equal(frame[i], 255);
  }
}
const large = inspectGif(encodeGifBase64(sample(1024, 512), {
  effect: 'wobble', speed: 'normal', strength: 'bold',
}));
assert.equal(large.width, 512);
assert.equal(large.height, 256);
console.log(`Passed ${combinations} GIF settings, loop timing, motion strength, filled frames, and 512px export limit.`);
