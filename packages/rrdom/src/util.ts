/**
 * Get the content document of an iframe.
 * Catching errors is necessary because some older browsers block access to the content document of a sandboxed iframe.
 */
export function getIFrameContentDocument(iframe?: HTMLIFrameElement) {
  if (iframe) {
    try {
      return iframe.contentDocument;
    } catch (e) {
      // noop
    }
  }
}

/**
 * Get the content window of an iframe.
 * Catching errors is necessary because some older browsers block access to the content document of a sandboxed iframe.
 */
export function getIFrameContentWindow(iframe?: HTMLIFrameElement) {
  if (iframe) {
    try {
      return iframe.contentWindow;
    } catch (e) {
      // noop
    }
  }
}
