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

  // synthesize + upload two test images via the file input
  const buffers = await page.evaluate(async () => {
    function gridImg(w, h, label, bg) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, w, h);
      for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++)
        if ((i + j) % 2 === 0) { x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(i*w/8, j*h/6, w/8, h/6); }
      x.strokeStyle = '#fff'; x.lineWidth = 3; x.strokeRect(0,0,w,h);
      x.fillStyle = '#fff'; x.font = 'bold 60px sans-serif'; x.textAlign = 'center'; x.fillText(label, w/2, h/2);
      return c.toDataURL('image/png');
    }
    return [gridImg(1280,720,'IMG-1','#3b6cff'), gridImg(1280,720,'IMG-2','#c2362e')];
  });
  await page.evaluate((urls) => {
    const dt = new DataTransfer();
    urls.forEach((u, i) => {
      const bin = atob(u.split(',')[1]); const arr = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      dt.items.add(new File([arr], `test_${i+1}.png`, { type: 'image/png' }));
    });
    const input = document.getElementById('file'); input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, buffers);
  await page.waitForTimeout(800);

  const thumbCount = await page.$$eval('#thumbs .thumb', els => els.length);

  // exercise dual-axis: add horizontal taper too
  await page.selectOption('#hdir', 'left');
  await page.fill('#hRatio', '75');
  await page.dispatchEvent('#hRatio', 'input');
  await page.check('#showGrid');
  await page.waitForTimeout(300);

  const meta = await page.evaluate(() => ({
    size: document.getElementById('mSize').textContent,
    info: document.getElementById('mInfo').textContent,
    mode: document.getElementById('mMode').textContent,
    canvasPixels: (() => { const c=document.getElementById('preview'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++; return n; })()
  }));

  // simulate dragging corner #1 (top-left): drag from its position inward
  const dragResult = await page.evaluate(() => {
    const c = document.getElementById('preview');
    const r = c.getBoundingClientRect();
    const before = JSON.stringify(state.corners);
    const q = previewState.qpx[0]; // top-left handle in canvas px
    const toClient = (px,py) => ({ x: r.left + px*(r.width/c.width), y: r.top + py*(r.height/c.height) });
    const down = toClient(q[0], q[1]);
    const move = toClient(q[0]+120, q[1]+60);
    c.dispatchEvent(new PointerEvent('pointerdown', {clientX:down.x, clientY:down.y, pointerId:1, bubbles:true}));
    window.dispatchEvent(new PointerEvent('pointermove', {clientX:move.x, clientY:move.y, pointerId:1, bubbles:true}));
    window.dispatchEvent(new PointerEvent('pointerup', {pointerId:1, bubbles:true}));
    return { before, after: JSON.stringify(state.corners), mode: document.getElementById('mMode').textContent };
  });

  await page.screenshot({ path: 'verify_preview.png' });

  // localStorage persistence: reload and check params restored
  await page.reload();
  await page.waitForTimeout(400);
  const persisted = await page.evaluate(() => ({
    hdir: document.getElementById('hdir').value,
    hRatio: document.getElementById('hRatio').value,
    showGrid: document.getElementById('showGrid').checked,
    cornersRestored: !!state.corners,
    mode: document.getElementById('mMode').textContent
  }));

  // export validity (after reload images are gone, so re-evaluate with a fresh synthesized image)
  const exportOk = await page.evaluate(async () => {
    const img = new Image();
    await new Promise(res => { const c=document.createElement('canvas'); c.width=640;c.height=360; img.onload=res; img.src=c.toDataURL(); });
    const c = renderFull(img, getParams());
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return `${c.width}x${c.height}, ${blob ? blob.size : 0} bytes`;
  });

  console.log(JSON.stringify({ thumbCount, meta, dragResult, persisted, exportOk, errors }, null, 2));
  await browser.close();
})();
