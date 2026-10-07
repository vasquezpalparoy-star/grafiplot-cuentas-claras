import {Capacitor, registerPlugin} from '@capacitor/core';
export const native = Capacitor.isNativePlatform();
const vault = registerPlugin<{exportFile(o:{name:string;mime:string;base64:string}):Promise<void>;get(o:{key:string}):Promise<{value:string|null}>;set(o:{key:string;value:string}):Promise<void>;remove(o:{key:string}):Promise<void>}>('SecureVault');
// Android stores both session tokens and business data encrypted with a Keystore key.
export const storage = {
  async get(key:string) {return native ? (await vault.get({key})).value : localStorage.getItem(key)},
  async set(key:string,value:string) {if(native)await vault.set({key,value});else localStorage.setItem(key,value)},
  async remove(key:string) {if(native)await vault.remove({key});else localStorage.removeItem(key)},
};

export async function exportBlob(blob:Blob,name:string){
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.slice(i,i+8192));
  await vault.exportFile({name,mime:blob.type||'application/octet-stream',base64:btoa(binary)});
}
