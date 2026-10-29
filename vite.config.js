import { defineConfig } from 'vite';
import os from 'node:os';
import { execSync } from 'node:child_process';

// 取默认路由所在网卡名（即机器实际用来联网的那张），多网卡时优先用它
function getDefaultInterface() {
  try {
    const out = execSync('route -n get default 2>/dev/null', { encoding: 'utf8' });
    const m = out.match(/interface:\s*(\S+)/);
    if (m) return m[1];
  } catch (_) {
    /* ignore */
  }
  return '';
}

// 取本机局域网 IPv4（优先默认路由网卡，其次任一私有网段；排除回环 / 链路本地 / CG-NAT / VPN 隧道）
function getLanIPv4() {
  const ifaces = os.networkInterfaces();
  const isPrivate = (ip) =>
    /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  const primary = getDefaultInterface();

  const scan = (name) => {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal && isPrivate(ni.address)) return ni.address;
    }
    return '';
  };
  if (primary && scan(primary)) return scan(primary);
  for (const name of Object.keys(ifaces)) {
    const ip = scan(name);
    if (ip) return ip;
  }
  return '';
}

// 把本机局域网 IP 与端口注入页面（开发时实时计算，构建时取当时值）
function lanInfoPlugin() {
  let lanIP = '';
  let port = 5180;
  return {
    name: 'lan-info',
    configureServer(server) {
      port = server.config.server.port;
      lanIP = getLanIPv4();
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          injectTo: 'head',
          children: `window.__LAN_INFO__ = ${JSON.stringify({ ip: lanIP, port })};`,
        },
      ];
    },
  };
}

// 纯前端项目：不依赖任何远程接口、在线服务或后端。
// base 使用相对路径，保证构建产物可以离线、以 file:// 或任意子路径打开。
export default defineConfig({
  base: './',
  plugins: [lanInfoPlugin()],
  server: {
    // host: true 会绑定 0.0.0.0，使同一局域网内的其他设备也能访问
    host: true,
    port: 5180,
    strictPort: true,
  },
  build: {
    target: 'es2019',
    outDir: 'dist',
  },
});
