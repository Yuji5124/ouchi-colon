/** Loading the official, self-contained ESM bundle never selects or resets a device. */
export function loadUsbLibrary(){return import('esptool-js/bundle.js');}
export type UsbLibrary=Awaited<ReturnType<typeof loadUsbLibrary>>;
