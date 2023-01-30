import { serializedNodeWithId, idNodeMap, INode, MaskInputOptions, SlimDOMOptions, MaskInputFn, MaskTextFn } from '@sentry-internal/rrweb-snapshot';
import { PackFn, UnpackFn } from './packer/base';
import { IframeManager } from './record/iframe-manager';
import { ShadowDomManager } from './record/shadow-dom-manager';
import type { Replayer } from './replay';
import { CanvasManager } from './record/observers/canvas/canvas-manager';
export declare enum EventType {
    DomContentLoaded = 0,
    Load = 1,
    FullSnapshot = 2,
    IncrementalSnapshot = 3,
    Meta = 4,
    Custom = 5,
    Plugin = 6
}
export type domContentLoadedEvent = {
    type: EventType.DomContentLoaded;
    data: {};
};
export type loadedEvent = {
    type: EventType.Load;
    data: {};
};
export type fullSnapshotEvent = {
    type: EventType.FullSnapshot;
    data: {
        node: serializedNodeWithId;
        initialOffset: {
            top: number;
            left: number;
        };
    };
};
export type incrementalSnapshotEvent = {
    type: EventType.IncrementalSnapshot;
    data: incrementalData;
};
export type metaEvent = {
    type: EventType.Meta;
    data: {
        href: string;
        width: number;
        height: number;
    };
};
export type customEvent<T = unknown> = {
    type: EventType.Custom;
    data: {
        tag: string;
        payload: T;
    };
};
export type pluginEvent<T = unknown> = {
    type: EventType.Plugin;
    data: {
        plugin: string;
        payload: T;
    };
};
export type styleSheetEvent = {};
export declare enum IncrementalSource {
    Mutation = 0,
    MouseMove = 1,
    MouseInteraction = 2,
    Scroll = 3,
    ViewportResize = 4,
    Input = 5,
    TouchMove = 6,
    MediaInteraction = 7,
    StyleSheetRule = 8,
    CanvasMutation = 9,
    Font = 10,
    Log = 11,
    Drag = 12,
    StyleDeclaration = 13
}
export type mutationData = {
    source: IncrementalSource.Mutation;
} & mutationCallbackParam;
export type mousemoveData = {
    source: IncrementalSource.MouseMove | IncrementalSource.TouchMove | IncrementalSource.Drag;
    positions: mousePosition[];
};
export type mouseInteractionData = {
    source: IncrementalSource.MouseInteraction;
} & mouseInteractionParam;
export type scrollData = {
    source: IncrementalSource.Scroll;
} & scrollPosition;
export type viewportResizeData = {
    source: IncrementalSource.ViewportResize;
} & viewportResizeDimension;
export type inputData = {
    source: IncrementalSource.Input;
    id: number;
} & inputValue;
export type mediaInteractionData = {
    source: IncrementalSource.MediaInteraction;
} & mediaInteractionParam;
export type styleSheetRuleData = {
    source: IncrementalSource.StyleSheetRule;
} & styleSheetRuleParam;
export type styleDeclarationData = {
    source: IncrementalSource.StyleDeclaration;
} & styleDeclarationParam;
export type canvasMutationData = {
    source: IncrementalSource.CanvasMutation;
} & canvasMutationParam;
export type fontData = {
    source: IncrementalSource.Font;
} & fontParam;
export type incrementalData = mutationData | mousemoveData | mouseInteractionData | scrollData | viewportResizeData | inputData | mediaInteractionData | styleSheetRuleData | canvasMutationData | fontData | styleDeclarationData;
export type event = domContentLoadedEvent | loadedEvent | fullSnapshotEvent | incrementalSnapshotEvent | metaEvent | customEvent | pluginEvent;
export type eventWithTime = event & {
    timestamp: number;
    delay?: number;
};
export type blockClass = string | RegExp;
export type maskTextClass = string | RegExp;
export type SamplingStrategy = Partial<{
    mousemove: boolean | number;
    mousemoveCallback: number;
    mouseInteraction: boolean | Record<string, boolean | undefined>;
    scroll: number;
    media: number;
    input: 'all' | 'last';
}>;
export type RecordPlugin<TOptions = unknown> = {
    name: string;
    observer?: (cb: Function, win: IWindow, options: TOptions) => listenerHandler;
    eventProcessor?: <TExtend>(event: eventWithTime) => eventWithTime & TExtend;
    options: TOptions;
};
export type recordOptions<T> = {
    emit?: (e: T, isCheckout?: boolean) => void;
    checkoutEveryNth?: number;
    checkoutEveryNms?: number;
    blockClass?: blockClass;
    blockSelector?: string;
    unblockSelector?: string;
    ignoreClass?: string;
    ignoreSelector?: string;
    maskTextClass?: maskTextClass;
    maskTextSelector?: string;
    maskAllText?: boolean;
    maskAllInputs?: boolean;
    maskInputSelector?: string;
    maskInputOptions?: MaskInputOptions;
    maskInputFn?: MaskInputFn;
    maskTextFn?: MaskTextFn;
    unmaskTextSelector?: string;
    unmaskInputSelector?: string;
    slimDOMOptions?: SlimDOMOptions | 'all' | true;
    inlineStylesheet?: boolean;
    hooks?: hooksParam;
    packFn?: PackFn;
    sampling?: SamplingStrategy;
    recordCanvas?: boolean;
    userTriggeredOnInput?: boolean;
    collectFonts?: boolean;
    inlineImages?: boolean;
    plugins?: RecordPlugin[];
    mousemoveWait?: number;
    keepIframeSrcFn?: KeepIframeSrcFn;
};
export type observerParam = {
    mutationCb: mutationCallBack;
    mousemoveCb: mousemoveCallBack;
    mouseInteractionCb: mouseInteractionCallBack;
    scrollCb: scrollCallback;
    viewportResizeCb: viewportResizeCallback;
    inputCb: inputCallback;
    mediaInteractionCb: mediaInteractionCallback;
    blockClass: blockClass;
    blockSelector: string | null;
    unblockSelector: string | null;
    ignoreClass: string;
    ignoreSelector: string | null;
    maskTextClass: maskTextClass;
    maskTextSelector: string | null;
    unmaskTextSelector: string | null;
    maskInputSelector: string | null;
    unmaskInputSelector: string | null;
    maskAllText: boolean;
    maskInputOptions: MaskInputOptions;
    maskInputFn?: MaskInputFn;
    maskTextFn?: MaskTextFn;
    inlineStylesheet: boolean;
    styleSheetRuleCb: styleSheetRuleCallback;
    styleDeclarationCb: styleDeclarationCallback;
    canvasMutationCb: canvasMutationCallback;
    fontCb: fontCallback;
    sampling: SamplingStrategy;
    recordCanvas: boolean;
    inlineImages: boolean;
    userTriggeredOnInput: boolean;
    collectFonts: boolean;
    slimDOMOptions: SlimDOMOptions;
    doc: Document;
    mirror: Mirror;
    iframeManager: IframeManager;
    shadowDomManager: ShadowDomManager;
    canvasManager: CanvasManager;
    plugins: Array<{
        observer: Function;
        callback: Function;
        options: unknown;
    }>;
};
export type MutationBufferParam = Pick<observerParam, 'mutationCb' | 'blockClass' | 'blockSelector' | 'unblockSelector' | 'maskTextClass' | 'maskTextSelector' | 'unmaskTextSelector' | 'inlineStylesheet' | 'maskInputSelector' | 'unmaskInputSelector' | 'maskAllText' | 'maskInputOptions' | 'maskTextFn' | 'maskInputFn' | 'recordCanvas' | 'inlineImages' | 'slimDOMOptions' | 'doc' | 'mirror' | 'iframeManager' | 'shadowDomManager' | 'canvasManager'>;
export type hooksParam = {
    mutation?: mutationCallBack;
    mousemove?: mousemoveCallBack;
    mouseInteraction?: mouseInteractionCallBack;
    scroll?: scrollCallback;
    viewportResize?: viewportResizeCallback;
    input?: inputCallback;
    mediaInteaction?: mediaInteractionCallback;
    styleSheetRule?: styleSheetRuleCallback;
    styleDeclaration?: styleDeclarationCallback;
    canvasMutation?: canvasMutationCallback;
    font?: fontCallback;
};
export type mutationRecord = {
    type: string;
    target: Node;
    oldValue: string | null;
    addedNodes: NodeList;
    removedNodes: NodeList;
    attributeName: string | null;
};
export type textCursor = {
    node: Node;
    value: string | null;
};
export type textMutation = {
    id: number;
    value: string | null;
};
export type styleAttributeValue = {
    [key: string]: styleValueWithPriority | string | false;
};
export type styleValueWithPriority = [string, string];
export type attributeCursor = {
    node: Node;
    attributes: {
        [key: string]: string | styleAttributeValue | null;
    };
};
export type attributeMutation = {
    id: number;
    attributes: {
        [key: string]: string | styleAttributeValue | null;
    };
};
export type removedNodeMutation = {
    parentId: number;
    id: number;
    isShadow?: boolean;
};
export type addedNodeMutation = {
    parentId: number;
    previousId?: number | null;
    nextId: number | null;
    node: serializedNodeWithId;
};
export type mutationCallbackParam = {
    texts: textMutation[];
    attributes: attributeMutation[];
    removes: removedNodeMutation[];
    adds: addedNodeMutation[];
    isAttachIframe?: true;
};
export type mutationCallBack = (m: mutationCallbackParam) => void;
export type mousemoveCallBack = (p: mousePosition[], source: IncrementalSource.MouseMove | IncrementalSource.TouchMove | IncrementalSource.Drag) => void;
export type mousePosition = {
    x: number;
    y: number;
    id: number;
    timeOffset: number;
};
export type mouseMovePos = {
    x: number;
    y: number;
    id: number;
    debugData: incrementalData;
};
export declare enum MouseInteractions {
    MouseUp = 0,
    MouseDown = 1,
    Click = 2,
    ContextMenu = 3,
    DblClick = 4,
    Focus = 5,
    Blur = 6,
    TouchStart = 7,
    TouchMove_Departed = 8,
    TouchEnd = 9,
    TouchCancel = 10
}
export declare enum CanvasContext {
    '2D' = 0,
    WebGL = 1,
    WebGL2 = 2
}
export type SerializedWebGlArg = {
    rr_type: 'ArrayBuffer';
    base64: string;
} | {
    rr_type: string;
    src: string;
} | {
    rr_type: string;
    args: SerializedWebGlArg[];
} | {
    rr_type: string;
    index: number;
} | string | number | boolean | null | SerializedWebGlArg[];
type mouseInteractionParam = {
    type: MouseInteractions;
    id: number;
    x: number;
    y: number;
};
export type mouseInteractionCallBack = (d: mouseInteractionParam) => void;
export type scrollPosition = {
    id: number;
    x: number;
    y: number;
};
export type scrollCallback = (p: scrollPosition) => void;
export type styleSheetAddRule = {
    rule: string;
    index?: number | number[];
};
export type styleSheetDeleteRule = {
    index: number | number[];
};
export type styleSheetRuleParam = {
    id: number;
    removes?: styleSheetDeleteRule[];
    adds?: styleSheetAddRule[];
};
export type styleSheetRuleCallback = (s: styleSheetRuleParam) => void;
export type styleDeclarationParam = {
    id: number;
    index: number[];
    set?: {
        property: string;
        value: string | null;
        priority: string | undefined;
    };
    remove?: {
        property: string;
    };
};
export type styleDeclarationCallback = (s: styleDeclarationParam) => void;
export type canvasMutationCommand = {
    property: string;
    args: Array<unknown>;
    setter?: true;
};
export type canvasMutationParam = {
    id: number;
    type: CanvasContext;
    commands: canvasMutationCommand[];
} | ({
    id: number;
    type: CanvasContext;
} & canvasMutationCommand);
export type canvasMutationWithType = {
    type: CanvasContext;
} & canvasMutationCommand;
export type canvasMutationCallback = (p: canvasMutationParam) => void;
export type canvasManagerMutationCallback = (target: HTMLCanvasElement, p: canvasMutationWithType) => void;
export type fontParam = {
    family: string;
    fontSource: string;
    buffer: boolean;
    descriptors?: FontFaceDescriptors;
};
export type fontCallback = (p: fontParam) => void;
export type viewportResizeDimension = {
    width: number;
    height: number;
};
export type viewportResizeCallback = (d: viewportResizeDimension) => void;
export type inputValue = {
    text: string;
    isChecked: boolean;
    userTriggered?: boolean;
};
export type inputCallback = (v: inputValue & {
    id: number;
}) => void;
export declare const enum MediaInteractions {
    Play = 0,
    Pause = 1,
    Seeked = 2,
    VolumeChange = 3
}
export type mediaInteractionParam = {
    type: MediaInteractions;
    id: number;
    currentTime?: number;
    volume?: number;
    muted?: boolean;
};
export type mediaInteractionCallback = (p: mediaInteractionParam) => void;
export type DocumentDimension = {
    x: number;
    y: number;
    relativeScale: number;
    absoluteScale: number;
};
export type Mirror = {
    map: idNodeMap;
    getId: (n: INode) => number;
    getNode: (id: number) => INode | null;
    removeNodeFromMap: (n: INode) => void;
    has: (id: number) => boolean;
    reset: () => void;
};
export type throttleOptions = {
    leading?: boolean;
    trailing?: boolean;
};
export type listenerHandler = () => void;
export type hookResetter = () => void;
export type ReplayPlugin = {
    handler: (event: eventWithTime, isSync: boolean, context: {
        replayer: Replayer;
    }) => void;
};
export type playerConfig = {
    speed: number;
    maxSpeed: number;
    root: Element;
    loadTimeout: number;
    skipInactive: boolean;
    showWarning: boolean;
    showDebug: boolean;
    blockClass: string;
    liveMode: boolean;
    insertStyleRules: string[];
    triggerFocus: boolean;
    UNSAFE_replayCanvas: boolean;
    pauseAnimation?: boolean;
    mouseTail: boolean | {
        duration?: number;
        lineCap?: string;
        lineWidth?: number;
        strokeStyle?: string;
    };
    unpackFn?: UnpackFn;
    plugins?: ReplayPlugin[];
};
export type playerMetaData = {
    startTime: number;
    endTime: number;
    totalTime: number;
};
export type missingNode = {
    node: Node;
    mutation: addedNodeMutation;
};
export type missingNodeMap = {
    [id: number]: missingNode;
};
export type actionWithDelay = {
    doAction: () => void;
    delay: number;
};
export type Handler = (event?: unknown) => void;
export type Emitter = {
    on(type: string, handler: Handler): void;
    emit(type: string, event?: unknown): void;
    off(type: string, handler: Handler): void;
};
export type Arguments<T> = T extends (...payload: infer U) => unknown ? U : unknown;
export declare enum ReplayerEvents {
    Start = "start",
    Pause = "pause",
    Resume = "resume",
    Resize = "resize",
    Finish = "finish",
    FullsnapshotRebuilded = "fullsnapshot-rebuilded",
    LoadStylesheetStart = "load-stylesheet-start",
    LoadStylesheetEnd = "load-stylesheet-end",
    SkipStart = "skip-start",
    SkipEnd = "skip-end",
    MouseInteraction = "mouse-interaction",
    EventCast = "event-cast",
    CustomEvent = "custom-event",
    Flush = "flush",
    StateChange = "state-change",
    PlayBack = "play-back"
}
export type ElementState = {
    scroll?: [number, number];
};
export type KeepIframeSrcFn = (src: string) => boolean;
declare global {
    interface Window {
        FontFace: typeof FontFace;
    }
}
export type IWindow = Window & typeof globalThis;
export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
export {};
