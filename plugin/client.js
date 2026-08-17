/**
 * DSH API 余额悬浮窗 — Client 半部
 *
 * 功能：在页面右下角（shell.overlay 根级浮动层）渲染悬浮窗：
 *       - 背景图来自 Host 的 balance/image（base64 data URL）
 *       - 余额气泡显示在图片内，可拖动定位（百分比坐标）
 *       - 每 REFRESH_MS 毫秒轮询一次 Host 的 balance/status
 */
return {
  inject: ['timer'],
  apply(ctx) {
    // ==================== 配置区（可按需修改） ====================
    const REFRESH_MS = 20000;                     // 余额刷新间隔（毫秒）
    const DEFAULT_POS = { x: 30, y: 14 };         // 余额气泡默认位置（图片内百分比）
    // =============================================================

    styles.insert(`
      .dsb-widget {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 10000;
        pointer-events: auto;
        user-select: none;
        -webkit-user-select: none;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      }
      .dsb-frame {
        position: relative;
        width: 210px;
        min-height: 80px;
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
        background: #fff;
        border: 1px solid rgba(0, 0, 0, 0.08);
      }
      .dsb-img {
        display: block;
        width: 100%;
        height: auto;
      }
      .dsb-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 120px;
        color: #888;
        font-size: 12px;
        text-align: center;
        padding: 8px;
        box-sizing: border-box;
      }
      .dsb-dialog {
        position: absolute;
        transform: translate(-50%, -50%);
        background: transparent;
        border: none;
        box-shadow: none;
        padding: 5px 12px;
        cursor: move;
        text-align: center;
        white-space: nowrap;
      }
      .dsb-label {
        font-size: 11px;
        color: #666;
        line-height: 1.2;
      }
      .dsb-value {
        font-size: 19px;
        font-weight: 700;
        color: #1a7f37;
        line-height: 1.3;
      }
      .dsb-value.err {
        color: #c0392b;
      }
      .dsb-sub {
        font-size: 10px;
        color: #999;
        line-height: 1.2;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `);

    function Widget() {
      const [status, setStatus] = React.useState(null);
      const [image, setImage] = React.useState(null);
      const [imageError, setImageError] = React.useState(null);
      const [pos, setPos] = React.useState(DEFAULT_POS);
      const boxRef = React.useRef(null);
      const posRef = React.useRef(pos);
      posRef.current = pos;

      React.useEffect(() => {
        let alive = true;
        try {
          const refresh = async () => {
            let s;
            try {
              s = await host.call('balance/status');
            } catch (e) {
              s = { ok: false, error: String(e && e.message || e) };
            }
            if (alive) setStatus(s);
          };
          refresh();
          host.call('balance/image').then((r) => {
            if (!alive) return;
            if (r && r.dataUrl) setImage(r.dataUrl);
            if (r && r.error) setImageError(r.error);
          }).catch((e) => {
            if (alive) setImageError(String(e && e.message || e));
          });
          const stop = ctx.interval(refresh, REFRESH_MS);
          return () => { alive = false; stop(); };
        } catch (err) {
          setStatus({ ok: false, error: 'effect 错误: ' + String(err && err.message || err) });
        }
      }, []);

      const onPointerDown = (e) => {
        const el = e.currentTarget;
        const box = boxRef.current;
        if (!el || !box) return;
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        const start = { cx: e.clientX, cy: e.clientY, px: posRef.current.x, py: posRef.current.y };
        const rect = box.getBoundingClientRect();
        const move = (ev) => {
          const nx = Math.max(0, Math.min(100, start.px + ((ev.clientX - start.cx) / rect.width) * 100));
          const ny = Math.max(0, Math.min(100, start.py + ((ev.clientY - start.cy) / rect.height) * 100));
          setPos({ x: nx, y: ny });
        };
        const up = (ev) => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          try { el.releasePointerCapture(ev.pointerId); } catch (err) {}
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      };

      const ok = !!(status && status.ok);
      const valueText = ok
        ? (status.balance !== null && status.balance !== undefined ? Number(status.balance).toFixed(2) : '--')
        : '--';
      const subText = ok
        ? (status.currency ? status.currency : '') + (status.available === false ? ' · 不可用' : '')
        : (status && status.error ? String(status.error) : '获取中…');

      const showImage = image && !imageError;

      return React.createElement('div', { className: 'dsb-widget' },
        React.createElement('div', { className: 'dsb-frame', ref: boxRef },
          showImage
            ? React.createElement('img', {
                className: 'dsb-img',
                src: image,
                alt: '',
                draggable: false,
                onError: () => setImageError('图片解码失败'),
              })
            : React.createElement('div', { className: 'dsb-img dsb-placeholder' }, imageError || '图片加载中…'),
          React.createElement('div', {
            className: 'dsb-dialog',
            style: { left: pos.x + '%', top: pos.y + '%' },
            title: '拖动可调整位置',
            onPointerDown,
          },
            React.createElement('div', { className: 'dsb-label' }, 'API 余额'),
            React.createElement('div', { className: 'dsb-value' + (ok ? '' : ' err') }, valueText),
            React.createElement('div', { className: 'dsb-sub' }, subText),
          ),
        ),
      );
    }

    const slots = ctx.get('slots');
    if (slots === undefined) return;
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'api-balance-widget' },
      () => React.createElement(Widget),
    ));
  },
};
