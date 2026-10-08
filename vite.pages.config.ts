import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root:'pages',
  base:'/grafiplot-cuentas-claras/',
  publicDir:'../public',
  resolve:{alias:{'@':path.resolve(import.meta.dirname)}},
  plugins:[react()],
  build:{outDir:'../dist-pages',emptyOutDir:true,rollupOptions:{input:{main:path.resolve(import.meta.dirname,'pages/index.html'),worker:path.resolve(import.meta.dirname,'pages/trabajador.html')}}},
});
