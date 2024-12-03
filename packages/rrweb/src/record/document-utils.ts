import type { IWindow } from '@cartesianio/rrweb-types';

export function getBaseWindow(): IWindow {
  if (
    typeof __RRWEB_RECORD_IFRAME_PARENT__ === 'boolean' &&
    __RRWEB_RECORD_IFRAME_PARENT__
  ) {
    return window.parent as IWindow;
  }
  return window;
}

export function getBaseDocument() {
  return getBaseWindow().document;
}

export function isIframe() {
  return window.parent !== window;
}
