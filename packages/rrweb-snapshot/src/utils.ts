import { INode, MaskInputFn, MaskInputOptions } from './types';

export function isElement(n: Node | INode): n is Element {
  return n.nodeType === n.ELEMENT_NODE;
}

export function isShadowRoot(n: Node): n is ShadowRoot {
  const host: Element | null = (n as ShadowRoot)?.host;
  return Boolean(host && host.shadowRoot && host.shadowRoot === n);
}

interface IsInputTypeMasked {
  maskInputOptions: MaskInputOptions;
  tagName: string;
  type: string | number | boolean | null;
}

/**
 * Check `maskInputOptions` if the element, based on tag name and `type` attribute, should be masked.
 * If `<input>` has no `type`, default to using `type="text"`.
 */
function isInputTypeMasked({
  maskInputOptions,
  tagName,
  type,
}: IsInputTypeMasked) {
  // Handle options as part of select
  if (tagName.toLowerCase() === 'option') {
    tagName = 'select';
  }

  // We only care about the type if it is a string
  const actualType = typeof type === 'string' ? type.toLowerCase() : undefined;

  return (
    maskInputOptions[tagName.toLowerCase() as keyof MaskInputOptions] ||
    (actualType && maskInputOptions[actualType as keyof MaskInputOptions]) ||
    actualType === 'password' ||
    // Default to "text" option for inputs without a "type" attribute defined
    (tagName === 'input' && !type && maskInputOptions['text'])
  );
}

interface HasInputMaskOptions extends IsInputTypeMasked {
  maskInputSelector: string | null;
}

/**
 * Determine if there are masking options configured and if `maskInputValue` needs to be called
 */
export function hasInputMaskOptions({
  tagName,
  type,
  maskInputOptions,
  maskInputSelector,
}: HasInputMaskOptions) {
  return (
    maskInputSelector || isInputTypeMasked({ maskInputOptions, tagName, type })
  );
}

interface MaskInputValue extends HasInputMaskOptions {
  input: HTMLElement;
  unmaskInputSelector: string | null;
  value: string | null;
  maskInputFn?: MaskInputFn;
}

export function maskInputValue({
  input,
  maskInputSelector,
  unmaskInputSelector,
  maskInputOptions,
  tagName,
  type,
  value,
  maskInputFn,
}: MaskInputValue): string {
  let text = value || '';

  if (unmaskInputSelector && input.matches(unmaskInputSelector)) {
    return text;
  }

  if (input.hasAttribute('data-rr-is-password')) {
    type = 'password';
  }

  if (
    isInputTypeMasked({ maskInputOptions, tagName, type }) ||
    (maskInputSelector && input.matches(maskInputSelector))
  ) {
    if (maskInputFn) {
      text = maskInputFn(text);
    } else {
      text = '*'.repeat(text.length);
    }
  }
  return text;
}

const ORIGINAL_ATTRIBUTE_NAME = '__rrweb_original__';
type PatchedGetImageData = {
  [ORIGINAL_ATTRIBUTE_NAME]: CanvasImageData['getImageData'];
} & CanvasImageData['getImageData'];

export function is2DCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;

  const chunkSize = 50;

  // get chunks of the canvas and check if it is blank
  for (let x = 0; x < canvas.width; x += chunkSize) {
    for (let y = 0; y < canvas.height; y += chunkSize) {
      const getImageData = ctx.getImageData as PatchedGetImageData;
      const originalGetImageData =
        ORIGINAL_ATTRIBUTE_NAME in getImageData
          ? getImageData[ORIGINAL_ATTRIBUTE_NAME]
          : getImageData;
      // by getting the canvas in chunks we avoid an expensive
      // `getImageData` call that retrieves everything
      // even if we can already tell from the first chunk(s) that
      // the canvas isn't blank
      const pixelBuffer = new Uint32Array(
        originalGetImageData.call(
          ctx,
          x,
          y,
          Math.min(chunkSize, canvas.width - x),
          Math.min(chunkSize, canvas.height - y),
        ).data.buffer,
      );
      if (pixelBuffer.some((pixel) => pixel !== 0)) return false;
    }
  }
  return true;
}

/**
 * Get the type of an input element.
 * This takes care of the case where a password input is changed to a text input.
 * In this case, we continue to consider this of type password, in order to avoid leaking sensitive data
 * where passwords should be masked.
 */
export function getInputType(element: HTMLElement): Lowercase<string> | null {
  const type = (element as HTMLInputElement).type;

  return element.hasAttribute('data-rr-is-password')
    ? 'password'
    : type
    ? (type.toLowerCase() as Lowercase<string>)
    : null;
}
