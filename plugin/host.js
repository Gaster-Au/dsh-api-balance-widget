/**
 * DSH API 余额悬浮窗 — Host 半部
 *
 * 功能：读取 DeepSeek API Key，调用官方余额接口获取余额，
 *       并把本地图片以字节精确的 base64 传给浏览器端显示。
 *
 * 使用方法：在 DeepSeek Harness 会话中通过 cordis_define 定义，
 *       把本文件内容作为 code.host，client.js 内容作为 code.client。
 *
 * 安全说明：本文件不包含任何 API Key。运行时会通过 credentials 服务
 *       读取 DEEPSEEK_API_KEY（对应 ~/.dsh/.credentials.yaml 或环境变量）。
 */
return {
  apply(ctx) {
    // ==================== 配置区（发布后请按需修改） ====================
    const IMAGE_PATH = 'D:\\1234\\3e8a47e3f5fe5e931f63bffce75cc04d.jpg'; // 背景图绝对路径（默认值，换成你自己的图片）
    const IMAGE_DIR = 'D:\\1234';                                       // 背景图所在目录（Node 子进程工作目录）
    const BALANCE_URL = 'https://api.deepseek.com/user/balance';        // DeepSeek 官方余额接口
    const TTL_MS = 15000;                                               // 余额缓存时长（毫秒），配合客户端 20s 轮询
    const API_KEY_REF = 'DEEPSEEK_API_KEY';                             // credentials 服务中的 Key 名称
    // ===================================================================

    // 字节精确的 base64 编码（注意：宿主内置 btoa 按 UTF-8 编码，不能用于二进制图片）
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const bytesToBase64 = (b) => {
      let out = '';
      for (let i = 0; i < b.length; i += 3) {
        const b0 = b[i];
        const b1 = b[i + 1];
        const b2 = b[i + 2];
        out += CHARS[b0 >> 2];
        out += CHARS[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
        out += b1 === undefined ? '=' : CHARS[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
        out += b2 === undefined ? '=' : CHARS[b2 & 63];
      }
      return out;
    };

    let lastFetch = 0;
    let lastResult = null;
    let cachedImage = null;

    // 读取 API Key（优先 credentials 服务）
    const readKey = async () => {
      const credentials = ctx.get('credentials');
      if (credentials === undefined) return undefined;
      try {
        const hit = await credentials.resolve(API_KEY_REF);
        if (hit !== undefined && hit.value && hit.value.length > 0) return hit.value;
      } catch (err) {
        console.error('resolve credential failed', err);
      }
      return undefined;
    };

    // 调用 DeepSeek 余额接口。
    // 说明：动态插件沙箱禁用了 fetch，且 curl/schannel 的 TLS 在部分环境不可用，
    // 因此通过 subprocess 拉起 Node 子进程（Node 自带 TLS 栈）完成请求。
    const fetchBalance = async () => {
      const key = await readKey();
      if (!key) return { ok: false, error: '未配置 ' + API_KEY_REF, at: Date.now() };
      const subprocess = ctx.get('subprocess');
      if (subprocess === undefined) return { ok: false, error: 'subprocess 服务不可用', at: Date.now() };
      let exe;
      try {
        exe = await subprocess.resolveExecutable('node');
      } catch (err) {
        exe = 'D:\\Node.js\\node.exe'; // 兜底路径（Windows）
      }
      const script = [
        '(async () => {',
        '  try {',
        '    const res = await fetch(' + JSON.stringify(BALANCE_URL) + ', { headers: { authorization: "Bearer " + process.env.DSH_BALANCE_KEY } });',
        '    const text = await res.text();',
        '    process.stdout.write(JSON.stringify({ status: res.status, body: text }));',
        '  } catch (e) {',
        '    process.stdout.write(JSON.stringify({ error: String(e && e.message || e) }));',
        '  }',
        '})()',
      ].join('\n');
      let handle;
      try {
        handle = subprocess.spawn({
          argv: [exe, '-e', script],
          cwd: IMAGE_DIR,
          stdio: {
            stdin: 'ignore',
            stdout: { maxBytes: 65536 },
            stderr: { maxBytes: 65536 },
          },
          graceMs: 1000,
          env: { DSH_BALANCE_KEY: key },
        });
      } catch (err) {
        return { ok: false, error: 'spawn 失败: ' + String(err && err.message || err), at: Date.now() };
      }
      try {
        await handle.done;
      } catch (err) {
        return { ok: false, error: '子进程失败: ' + String(err && err.message || err), at: Date.now() };
      }
      const out = (handle.collected && handle.collected.stdout)
        ? handle.collected.stdout.readFrom(0).text.trim()
        : '';
      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch (err) {
        return { ok: false, error: '无法解析响应: ' + out.slice(0, 200), at: Date.now() };
      }
      if (parsed.error) return { ok: false, error: parsed.error, at: Date.now() };
      if (parsed.status !== 200) {
        return { ok: false, error: 'HTTP ' + parsed.status + ': ' + String(parsed.body).slice(0, 200), at: Date.now() };
      }
      try {
        const data = JSON.parse(parsed.body);
        const info = Array.isArray(data.balance_infos) && data.balance_infos[0] ? data.balance_infos[0] : null;
        return {
          ok: true,
          available: data.is_available === true,
          balance: info && info.total_balance !== undefined ? Number(info.total_balance) : null,
          currency: info ? info.currency : null,
          at: Date.now(),
        };
      } catch (err) {
        return { ok: false, error: '响应格式异常: ' + String(err && err.message || err), at: Date.now() };
      }
    };

    // 客户端可调用的 RPC 方法
    harness.handle('balance/status', async () => {
      const now = Date.now();
      if (lastResult !== null && now - lastFetch < TTL_MS) return lastResult;
      const result = await fetchBalance();
      lastResult = result;
      lastFetch = now;
      return result;
    });

    // 客户端获取背景图（base64 data URL）
    harness.handle('balance/image', async () => {
      if (cachedImage !== null) return { dataUrl: cachedImage, error: null };
      const fs = ctx.get('fs');
      if (fs === undefined) return { dataUrl: null, error: 'fs 服务不可用' };
      try {
        const target = await fs.resolve(IMAGE_PATH);
        const bytes = await fs.readBytes(target, undefined, 4 * 1024 * 1024);
        cachedImage = 'data:image/jpeg;base64,' + bytesToBase64(bytes);
        return { dataUrl: cachedImage, error: null };
      } catch (err) {
        return { dataUrl: null, error: '读取图片失败: ' + String(err && err.message || err) };
      }
    });
  },
};
