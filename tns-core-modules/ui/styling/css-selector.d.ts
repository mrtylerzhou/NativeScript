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

        matchTailAndApply(view: view.View, valueSourceModifier: number): void;

        eachSetter(callback: (property: styleProperty.Property, resolvedValue: any) => void);

        visit(visitor: CssSelectorVisitor): void;
    }

    class CssTypeSelector extends CssSelector {
        /**
         * Qualified type name, lower-kebap-cased.
         */
        type: string;

        matches(view: view.View): boolean;

        matchHead(view: view.View): boolean;
        matchTail(view: view.View): boolean;

        /**
         * Convers a type name to qualified CSS type name.
         * This should allow for PascalCase and kebap-case selectors to match the same elements.
         */
        static qualifiedTypeName(typeName: string): string;
    }

    class CssIdSelector extends CssSelector {
        /**
         * Gets the id this selector matches.
         */
        id: string;
        matches(view: view.View): boolean;
    }

    class CssClassSelector extends CssSelector {
        matches(view: view.View): boolean;
        /**
         * Gets the class this selector matches.
         */
        cssClass: string;
    }

    class CssCompositeSelector extends CssSelector {
        /**
         * Gets the last CssSelector from the composite chain.
         * This will be suitable for pre-screening and must be one of the last CssSelectors in the chain,
         * that must match exactly the view they are applied on.
         */
        head: CssSelector;
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
