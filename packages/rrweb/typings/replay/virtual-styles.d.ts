import { INode } from '@sentry-internal/rrweb-snapshot';
export declare enum StyleRuleType {
    Insert = 0,
    Remove = 1,
    Snapshot = 2,
    SetProperty = 3,
    RemoveProperty = 4
}
type InsertRule = {
    cssText: string;
    type: StyleRuleType.Insert;
    index?: number | number[];
};
type RemoveRule = {
    type: StyleRuleType.Remove;
    index: number | number[];
};
type SnapshotRule = {
    type: StyleRuleType.Snapshot;
    cssTexts: string[];
};
type SetPropertyRule = {
    type: StyleRuleType.SetProperty;
    index: number[];
    property: string;
    value: string | null;
    priority: string | undefined;
};
type RemovePropertyRule = {
    type: StyleRuleType.RemoveProperty;
    index: number[];
    property: string;
};
export type VirtualStyleRules = Array<InsertRule | RemoveRule | SnapshotRule | SetPropertyRule | RemovePropertyRule>;
export type VirtualStyleRulesMap = Map<INode, VirtualStyleRules>;
export declare function getNestedRule(rules: CSSRuleList, position: number[]): CSSGroupingRule;
export declare function getPositionsAndIndex(nestedIndex: number[]): {
    positions: number[];
    index: number | undefined;
};
export declare function applyVirtualStyleRulesToNode(storedRules: VirtualStyleRules, styleNode: HTMLStyleElement): void;
export declare function storeCSSRules(parentElement: HTMLStyleElement, virtualStyleRulesMap: VirtualStyleRulesMap): void;
export {};
