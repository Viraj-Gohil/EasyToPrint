import { DiscoveredPrinter } from '../types/agent';

const VIRTUAL_PRINTER_PATTERN =
  /(microsoft print to pdf|microsoft xps document writer|microsoft office document image writer|send to onenote|onenote|fax|microsoft shared fax|adobe pdf|foxit (reader |phantompdf )?pdf|pdfcreator|cutepdf|bullzip pdf|dopdf|primopdf|nitro pdf|pdf24|print to pdf|anydesk printer|journal note writer|snagit \d* printer)/i;

const VIRTUAL_PORT_PATTERN = /^(portprompt:|xpsport:|shrfax:|nul:)/i;

export function isVirtualPrinter(
  printerOrName?: string | Pick<DiscoveredPrinter, 'name' | 'displayName' | 'driverName' | 'portName'> | null
): boolean {
  if (!printerOrName) return false;
  if (typeof printerOrName === 'string') {
    return VIRTUAL_PRINTER_PATTERN.test(printerOrName);
  }
  const combined = `${printerOrName.name || ''} ${printerOrName.displayName || ''} ${printerOrName.driverName || ''}`;
  if (VIRTUAL_PRINTER_PATTERN.test(combined)) {
    return true;
  }
  if (printerOrName.portName && VIRTUAL_PORT_PATTERN.test(printerOrName.portName.trim())) {
    return true;
  }
  return false;
}

export function filterPhysicalPrinters<
  T extends Pick<DiscoveredPrinter, 'name' | 'displayName' | 'driverName' | 'portName'>
>(printers: T[]): T[] {
  return (printers || []).filter((printer) => !isVirtualPrinter(printer));
}
