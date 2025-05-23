import type {
  Mirror,
  MaskInputOptions,
  SlimDOMOptions,
  MaskInputFn,
  MaskTextFn,
  DataURLOptions,
  MaskAttributeFn,
} from '@sentry-internal/rrweb-snapshot';
import type { IframeManagerInterface } from './record/iframe-manager';
import type { ShadowDomManagerInterface } from './record/shadow-dom-manager';
import type { Replayer } from './replay';
import type { RRNode } from '@sentry-internal/rrdom';
import type {
  CanvasManagerConstructorOptions,
  CanvasManagerInterface,
} from './record/observers/canvas/canvas-manager';
import type { StylesheetManager } from './record/stylesheet-manager';
import type {
  addedNodeMutation,
  blockClass,
  canvasMutationCallback,
  customElementCallback,
  eventWithTime,
  fontCallback,
  hooksParam,
  inputCallback,
  IWindow,
  KeepIframeSrcFn,
  listenerHandler,
  maskTextClass,
  unmaskTextClass,
  mediaInteractionCallback,
  mouseInteractionCallBack,
  mousemoveCallBack,
  mutationCallBack,
  RecordPlugin,
  SamplingStrategy,
  scrollCallback,
  selectionCallback,
  styleDeclarationCallback,
  styleSheetRuleCallback,
  viewportResizeCallback,
  PackFn,
  UnpackFn,
} from '@sentry-internal/rrweb-types';
import type ProcessedNodeManager from './record/processed-node-manager';

export type recordOptions<T> = {
  emit?: (e: T, isCheckout?: boolean) => void;
  checkoutEveryNth?: number;
  checkoutEveryNms?: number;
  blockClass?: blockClass;
  blockSelector?: string;
  unblockSelector?: string;
  ignoreClass?: string;
  ignoreSelector?: string;
  maskAllText?: boolean;
  maskTextClass?: maskTextClass;
  unmaskTextClass?: unmaskTextClass;
  maskTextSelector?: string;
  unmaskTextSelector?: string;
  maskAllInputs?: boolean;
  maskInputOptions?: MaskInputOptions;
  maskAttributeFn?: MaskAttributeFn;
  maskInputFn?: MaskInputFn;
  maskTextFn?: MaskTextFn;
  maxCanvasSize?: [number, number];
  slimDOMOptions?: SlimDOMOptions | 'all' | true;
  ignoreCSSAttributes?: Set<string>;
  inlineStylesheet?: boolean;
  hooks?: hooksParam;
  packFn?: PackFn;
  sampling?: SamplingStrategy;
  dataURLOptions?: DataURLOptions;
  recordDOM?: boolean;
  recordCanvas?: boolean;
  recordCrossOriginIframes?: boolean;
  recordAfter?: 'DOMContentLoaded' | 'load';
  userTriggeredOnInput?: boolean;
  collectFonts?: boolean;
  inlineImages?: boolean;
  plugins?: RecordPlugin[];
  // departed, please use sampling options
  mousemoveWait?: number;
  keepIframeSrcFn?: KeepIframeSrcFn;
  errorHandler?: ErrorHandler;
  onMutation?: (mutations: MutationRecord[]) => boolean;
  getCanvasManager?: (
    options: CanvasManagerConstructorOptions,
  ) => CanvasManagerInterface;
};

export type observerParam = {
  onMutation?: (mutations: MutationRecord[]) => boolean;
  mutationCb: mutationCallBack;
  mousemoveCb: mousemoveCallBack;
  mouseInteractionCb: mouseInteractionCallBack;
  scrollCb: scrollCallback;
  viewportResizeCb: viewportResizeCallback;
  inputCb: inputCallback;
  mediaInteractionCb: mediaInteractionCallback;
  selectionCb: selectionCallback;
  blockClass: blockClass;
  blockSelector: string | null;
  unblockSelector: string | null;
  ignoreClass: string;
  ignoreSelector: string | null;
  maskAllText: boolean;
  maskTextClass: maskTextClass;
  unmaskTextClass: unmaskTextClass;
  maskTextSelector: string | null;
  unmaskTextSelector: string | null;
  maskInputOptions: MaskInputOptions;
  maskAttributeFn?: MaskAttributeFn;
  maskInputFn?: MaskInputFn;
  maskTextFn?: MaskTextFn;
  keepIframeSrcFn: KeepIframeSrcFn;
  inlineStylesheet: boolean;
  styleSheetRuleCb: styleSheetRuleCallback;
  styleDeclarationCb: styleDeclarationCallback;
  canvasMutationCb: canvasMutationCallback;
  customElementCb: customElementCallback;
  fontCb: fontCallback;
  sampling: SamplingStrategy;
  recordDOM: boolean;
  recordCanvas: boolean;
  inlineImages: boolean;
  userTriggeredOnInput: boolean;
  collectFonts: boolean;
  slimDOMOptions: SlimDOMOptions;
  dataURLOptions: DataURLOptions;
  doc: Document;
  mirror: Mirror;
  iframeManager: IframeManagerInterface;
  stylesheetManager: StylesheetManager;
  shadowDomManager: ShadowDomManagerInterface;
  canvasManager: CanvasManagerInterface;
  processedNodeManager: ProcessedNodeManager;
  ignoreCSSAttributes: Set<string>;
  plugins: Array<{
    observer: (
      cb: (...arg: Array<unknown>) => void,
      win: IWindow,
      options: unknown,
    ) => listenerHandler;
    callback: (...arg: Array<unknown>) => void;
    options: unknown;
  }>;
};

export type MutationBufferParam = Pick<
  observerParam,
  | 'onMutation'
  | 'mutationCb'
  | 'blockClass'
  | 'blockSelector'
  | 'maskAllText'
  | 'unblockSelector'
  | 'maskTextClass'
  | 'unmaskTextClass'
  | 'maskTextSelector'
  | 'unmaskTextSelector'
  | 'inlineStylesheet'
  | 'maskInputOptions'
  | 'maskAttributeFn'
  | 'maskTextFn'
  | 'maskInputFn'
  | 'keepIframeSrcFn'
  | 'recordCanvas'
  | 'inlineImages'
  | 'slimDOMOptions'
  | 'dataURLOptions'
  | 'doc'
  | 'mirror'
  | 'iframeManager'
  | 'stylesheetManager'
  | 'shadowDomManager'
  | 'canvasManager'
  | 'processedNodeManager'
>;

export type ReplayPlugin = {
  handler?: (
    event: eventWithTime,
    isSync: boolean,
    context: { replayer: Replayer },
  ) => void;
  onBuild?: (
    node: Node | RRNode,
    context: { id: number; replayer: Replayer },
  ) => void;
  getMirror?: (mirrors: { nodeMirror: Mirror }) => void;
};
export type { Replayer } from './replay';
export type playerConfig = {
  speed: number;
  maxSpeed: number;
  root: Element;
  loadTimeout: number;
  skipInactive: boolean;
  inactivePeriodThreshold: number;
  showWarning: boolean;
  showDebug: boolean;
  blockClass: string;
  liveMode: boolean;
  insertStyleRules: string[];
  triggerFocus: boolean;
  UNSAFE_replayCanvas: boolean;
  pauseAnimation?: boolean;
  mouseTail:
    | boolean
    | {
        duration?: number;
        lineCap?: string;
        lineWidth?: number;
        strokeStyle?: string;
      };
  unpackFn?: UnpackFn;
  useVirtualDom: boolean;
  logger: {
    log: (...args: Parameters<typeof console.log>) => void;
    warn: (...args: Parameters<typeof console.warn>) => void;
  };
  plugins?: ReplayPlugin[];
};

export type missingNode = {
  node: Node | RRNode;
  mutation: addedNodeMutation;
};
export type missingNodeMap = {
  [id: number]: missingNode;
};

declare global {
  interface Window {
    FontFace: typeof FontFace;
    Array: typeof Array;
  }
}

export type CrossOriginIframeMessageEventContent<T = eventWithTime> = {
  type: 'rrweb';
  event: T;
  // The origin of the iframe which originally emits this message. It is used to check the integrity of message and to filter out the rrweb messages which are forwarded by some sites.
  origin: string;
  isCheckout?: boolean;
};
export type CrossOriginIframeMessageEvent =
  MessageEvent<CrossOriginIframeMessageEventContent>;

export type ErrorHandler = (error: unknown) => void | boolean;
