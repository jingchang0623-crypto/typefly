const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const fileUrl = 'file://' + path.resolve(__dirname, 'index.html');
  await page.goto(fileUrl);
  await page.waitForTimeout(300);

  // Build a synthetic test image (colored grid with labels) as a data URL in-page,
  // then feed it into the file input as two "uploaded" files.
  const makeAndUpload = async () => {
    const buffers = await page.evaluate(async () => {
      function gridImg(w, h, label, bgcolor) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.fillStyle = bgcolor; x.fillRect(0, 0, w, h);
        const cols = 8, rows = 6;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          if ((i + j) % 2 === 0) { x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(i*w/cols, j*h/rows, w/cols, h/rows); }
        }
        x.strokeStyle = '#fff'; x.lineWidth = 3; x.strokeRect(0,0,w,h);
        x.fillStyle = '#fff'; x.font = 'bold 60px sans-serif'; x.textAlign = 'center';
        x.fillText(label, w/2, h/2);
        return c.toDataURL('image/png');
      }
      return [gridImg(1280,720,'IMG-1','#3b6cff'), gridImg(1280,720,'IMG-2','#c2362e')];
    });

    // Convert data URLs to File objects and assign to the input via DataTransfer
    await page.evaluate((urls) => {
      const dt = new DataTransfer();
      urls.forEach((u, i) => {
        const bin = atob(u.split(',')[1]);
        const arr = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
        dt.items.add(new File([arr], `test_${i+1}.png`, { type: 'image/png' }));
      });
      const input = document.getElementById('file');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, buffers);
  };

  await makeAndUpload();
  await page.waitForTimeout(800); // allow images to load + render

  const thumbCount = await page.$$eval('#thumbs .thumb', els => els.length);
  const meta = await page.evaluate(() => ({
    name: document.getElementById('mName').textContent,
    size: document.getElementById('mSize').textContent,
    trap: document.getElementById('mTrap').textContent,
    info: document.getElementById('mInfo').textContent,
    status: document.getElementById('status').textContent,
    canvasNotBlank: (() => {
      const c = document.getElementById('preview');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonTransparent = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nonTransparent++;
      return nonTransparent;
    })()
  }));

  // toggle reference grid + switch to bottom-narrow to exercise other branches
  await page.check('#showGrid');
  await page.selectOption('#dir', 'bottom');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'verify_preview.png' });

  // Verify export produces a valid PNG blob (intercept the download click via toBlob)
  const exportOk = await page.evaluate(async () => {
    const p = (typeof getParams === 'function') ? getParams() : null;
    if (!p) return 'no getParams';
    const it = state.images[0];
    const c = renderFull(it.img, p);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return blob && blob.size > 1000 ? `png ${blob.size} bytes, ${c.width}x${c.height}` : 'bad blob';
  });

  console.log(JSON.stringify({ thumbCount, meta, exportOk, errors }, null, 2));
  await browser.close();
})();
