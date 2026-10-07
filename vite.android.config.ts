import {mergeConfig} from 'vite';
import pages from './vite.pages.config';
export default mergeConfig(pages,{root:'android-web',base:'./',build:{outDir:'../dist-android'}});
