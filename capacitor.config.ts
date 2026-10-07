import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.grafiplot.cuentasclaras',
  appName: 'Grafiplot Cuentas claras',
  webDir: 'dist-android',
  server: { androidScheme: 'https', cleartext: false },
  android: { allowMixedContent: false },
};
export default config;
