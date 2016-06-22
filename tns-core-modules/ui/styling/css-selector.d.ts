declare module "ui/styling/css-selector" {
    import view = require("ui/core/view");
    import cssParser = require("css");
    import styleProperty = require("ui/styling/style-property");
    import keyframeAnimation = require("ui/animation/keyframe-animation");

    export interface CssSelectorVisitor {
        visitId(selector: CssIdSelector);
        visitClass(selector: CssClassSelector);
        visitType(selector: CssTypeSelector);
        visitComposite(selector: CssCompositeSelector);
        visitAttr(selector: CssAttrSelector);
        visitVisualState(selector: CssVisualStateSelector);
        visitInlineStyle(selector: InlineStyleSelector);
    }

    export class CssSelector {
        constructor(expression: string, declarations: cssParser.Declaration[]);

        expression: string;
        attrExpression: string;

        declarations(): Array<{ property: string; value: any }>;

        specificity: number;

        animations: Array<keyframeAnimation.KeyframeAnimationInfo>;

        matches(view: view.View): boolean;

        apply(view: view.View, valueSourceModifier: number);

        eachSetter(callback: (property: styleProperty.Property, resolvedValue: any) => void);

        visit(visitor: CssSelectorVisitor): void;
    }

    class CssTypeSelector extends CssSelector {
        /**
         * Qualified type name, lowercased with dashes removed.
         */
        type: string;

        matches(view: view.View): boolean;

        matchHead(view: view.View): boolean;
        matchTail(view: view.View): boolean;
    }

    class CssIdSelector extends CssSelector {
        matches(view: view.View): boolean;
    }

    class CssClassSelector extends CssSelector {
        matches(view: view.View): boolean;
    }

    class CssCompositeSelector extends CssSelector {
    }

    class CssAttrSelector extends CssSelector {
    }

    export class CssVisualStateSelector extends CssSelector {
        key: string;
        state: string;
        constructor(expression: string, declarations: cssParser.Declaration[]);
        matches(view: view.View): boolean;
    }

    export function createSelector(expression: string, declarations: cssParser.Declaration[]): CssSelector;

    class InlineStyleSelector extends CssSelector {
        constructor(declarations: cssParser.Declaration[]);
        apply(view: view.View);
    }

    export function applyInlineSyle(view: view.View, declarations: cssParser.Declaration[]);
}
