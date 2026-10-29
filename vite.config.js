import { defineConfig } from 'vite';

// 纯前端项目：不依赖任何远程接口、在线服务或后端。
// base 使用相对路径，保证构建产物可以离线、以 file:// 或任意子路径打开。
export default defineConfig({
  base: './',
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
