import { defineConfig } from 'umi';

export default defineConfig({
  routes: [{ path: '/', component: '@/pages/index' }],
  npmClient: 'npm',
  mfsu: false,
  base: process.env.NODE_ENV === 'production' ? '/gtsv/' : '/',
  publicPath: process.env.NODE_ENV === 'production' ? '/gtsv/' : '/',
  title: 'Unit 1705 · Sensing Van Buildout',
  favicons: [],
});
