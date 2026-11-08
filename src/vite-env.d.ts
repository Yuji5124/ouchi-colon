/// <reference types="vite/client" />
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

declare module 'esptool-js/bundle.js' {
  export { ESPLoader, Transport } from 'esptool-js';
}
