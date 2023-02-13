import { blockClass, canvasManagerMutationCallback, IWindow, listenerHandler, Mirror, blockSelector } from '../../../types';
export default function initCanvasWebGLMutationObserver(cb: canvasManagerMutationCallback, win: IWindow, blockClass: blockClass, blockSelector: blockSelector, unblockSelector: blockSelector, mirror: Mirror): listenerHandler;
