import { attributes, INode, MaskInputFn, MaskInputOptions } from './types';
export declare function isElement(n: Node | INode): n is Element;
export declare function isShadowRoot(n: Node): n is ShadowRoot;
interface IsInputTypeMasked {
    maskInputOptions: MaskInputOptions;
    tagName: string;
    type: string | number | boolean | null;
}
interface HasInputMaskOptions extends IsInputTypeMasked {
    maskInputSelector: string | null;
}
export declare function hasInputMaskOptions({ tagName, type, maskInputOptions, maskInputSelector, }: HasInputMaskOptions): string | boolean | undefined;
interface MaskInputValue extends HasInputMaskOptions {
    input: HTMLElement;
    unmaskInputSelector: string | null;
    value: string | null;
    maskInputFn?: MaskInputFn;
}
export declare function maskInputValue({ input, maskInputSelector, unmaskInputSelector, maskInputOptions, tagName, type, value, maskInputFn, }: MaskInputValue): string;
export declare function is2DCanvasBlank(canvas: HTMLCanvasElement): boolean;
export declare function getInputType(element: HTMLElement): Lowercase<string> | null;
export declare function getInputValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLOptionElement, tagName: Uppercase<string>, type: attributes[string]): string;
export {};
