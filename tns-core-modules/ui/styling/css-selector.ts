import view = require("ui/core/view");
import observable = require("ui/core/dependency-observable");
import cssParser = require("css");
import * as trace from "trace";
import {StyleProperty, ResolvedStylePropertyHandler, withStyleProperty} from "ui/styling/style-property";
import * as types from "utils/types";
import * as utils from "utils/utils";
import keyframeAnimation = require("ui/animation/keyframe-animation");
import cssAnimationParser = require("./css-animation-parser");
import {getSpecialPropertySetter} from "ui/builder/special-properties";
import {CssSelectorVisitor} from "ui/styling/css-selector";

let ID_SPECIFICITY = 1000000;
let ATTR_SPECIFITY = 10000;
let CLASS_SPECIFICITY = 100;
let TYPE_SPECIFICITY = 1;

export abstract class CssSelector {
    public animations: Array<keyframeAnimation.KeyframeAnimationInfo>;

    private _expression: string;
    private _declarations: cssParser.Declaration[];
    private _attrExpression: string;

    constructor(expression: string, declarations: cssParser.Declaration[]) {
        if (expression) {
            let leftSquareBracketIndex = expression.indexOf(LSBRACKET);
            if (leftSquareBracketIndex >= 0) {
                // extracts what is inside square brackets ([target = 'test'] will extract "target = 'test'")
                let paramsRegex = /\[\s*(.*)\s*\]/;
                let attrParams = paramsRegex.exec(expression);
                if (attrParams && attrParams.length > 1) {
                    this._attrExpression = attrParams[1].trim();
                }
                this._expression = expression.substr(0, leftSquareBracketIndex);
            }
            else {
                this._expression = expression;
            }
        }
        this._declarations = declarations;
        this.animations = cssAnimationParser.CssAnimationParser.keyframeAnimationsFromCSSDeclarations(declarations);
    }

    get expression(): string {
        return this._expression;
    }

    get attrExpression(): string {
        return this._attrExpression;
    }

    get declarations(): Array<{ property: string; value: any }> {
        return this._declarations;
    }

    get specificity(): number {
        throw "Specificity property is abstract";
    }

    protected get valueSourceModifier(): number {
        return observable.ValueSource.Css;
    }

    public matches(view: view.View): boolean {
        return false;
    }

    public abstract matchTailAndApply(view: view.View, valueSourceModifier: number): void;

    public apply(view: view.View, valueSourceModifier: number) {
        view._unregisterAllAnimations();
        let modifier = valueSourceModifier || this.valueSourceModifier;
        this.eachSetter((property, value) => {
            if (types.isString(property)) {
                const propertyName = <string>property;
                let attrHandled = false;
                let specialSetter = getSpecialPropertySetter(propertyName);

                if (!attrHandled && specialSetter) {
                    specialSetter(view, value);
                    attrHandled = true;
                }

                if (!attrHandled && propertyName in view) {
                    view[propertyName] = utils.convertString(value);
                }
            } else {
                const resolvedProperty = <StyleProperty>property;
                try {
                    view.style._setValue(resolvedProperty, value, modifier);
                } catch (ex) {
                    if (trace.enabled) {
                        trace.write("Error setting property: " + resolvedProperty.name + " view: " + view + " value: " + value + " " + ex, trace.categories.Style, trace.messageType.error);
                    }
                }
            }
        });
        if (this.animations && view.isLoaded && view._nativeView !== undefined) {
            for (let animationInfo of this.animations) {
                let animation = keyframeAnimation.KeyframeAnimation.keyframeAnimationFromInfo(animationInfo, modifier);
                if (animation) {
                    view._registerAnimation(animation);
                    animation.play(view)
                        .then(() => { view._unregisterAnimation(animation);  })
                        .catch((e) => { view._unregisterAnimation(animation); });
                }
            }
        }
    }

    public eachSetter(callback: ResolvedStylePropertyHandler) {
        for (let i = 0; i < this._declarations.length; i++) {
            let declaration = this._declarations[i];
            let name = declaration.property;
            let resolvedValue = declaration.value;
            withStyleProperty(name, resolvedValue, callback);
        }
    }

    public get declarationText(): string {
        return this.declarations.map((declaration) => `${declaration.property}: ${declaration.value}`).join("; ");
    }

    public get attrExpressionText(): string  {
        if (this.attrExpression) {
            return `[${this.attrExpression}]`;
        } else {
            return "";
        }
    }

    public abstract visit(visitor: CssSelectorVisitor): void;
}

class CssTypeSelector extends CssSelector {
    private _type: string;
    constructor(expression: string, declarations: cssParser.Declaration[]) {
        super(expression, declarations);
        this._type = CssTypeSelector.qualifiedTypeName(this.expression);
    }
    get specificity(): number {
        let result = TYPE_SPECIFICITY;
        let dotIndex = this.expression.indexOf(DOT);
        if (dotIndex > -1) {
            result += CLASS_SPECIFICITY;
        }
        return result;
    }
    /**
     * Qualified type name, lower cased with dashes removed.
     */
    get type(): string {
        return this._type;
    }
    public matches(view: view.View): boolean {
        let result = this.type === view.cssType;
        if (result && this.attrExpression) {
            return matchesAttr(this.attrExpression, view);
        }
        return result;
    }

    public matchTailAndApply(view: view.View, valueSourceModifier: number): void {
        if (this.attrExpression && !matchesAttr(this.attrExpression, view)) {
            return;
        }
        this.apply(view, valueSourceModifier);
    }

    public toString(): string {
        return `CssTypeSelector ${this.expression}${this.attrExpressionText} { ${this.declarationText} }`;
    }

    public visit(visitor: CssSelectorVisitor): void {
        visitor.visitType(<any>this);
    }

    static qualifiedTypeName(selector: string): string {
        return selector.replace(/-/, '').toLowerCase();
    }
}

function matchesType(expression: string, view: view.View): boolean {
    let exprArr = expression.split(".");
    let exprTypeName = exprArr[0];
    let exprClassName = exprArr[1];

    let typeCheck = exprTypeName.toLowerCase() === view.typeName.toLowerCase() ||
        exprTypeName.toLowerCase() === view.typeName.split(/(?=[A-Z])/).join("-").toLowerCase();

    if (typeCheck) {
        if (exprClassName) {
            return view._cssClasses.some((cssClass, i, arr) => { return cssClass === exprClassName });
        }
        else {
            return typeCheck;
        }
    }
    else {
        return false;
    }
}

class CssIdSelector extends CssSelector {
    get specificity(): number {
        return ID_SPECIFICITY;
    }
    get id() {
        return this.expression;
    }
    public matches(view: view.View): boolean {
        let result = this.id === view.id;
        if (result && this.attrExpression) {
            return matchesAttr(this.attrExpression, view);
        }
        return result;
    }

    public matchTailAndApply(view: view.View, valueSourceModifier: number): void {
        if (this.attrExpression && !matchesAttr(this.attrExpression, view)) {
            return;
        }
        this.apply(view, valueSourceModifier);
    }

    public toString(): string {
        return `CssIdSelector ${this.expression}${this.attrExpressionText} { ${this.declarationText} }`;
    }

    public visit(visitor: CssSelectorVisitor): void {
        visitor.visitId(<any>this);
    }
}

class CssClassSelector extends CssSelector {
    get specificity(): number {
        return CLASS_SPECIFICITY;
    }
    get cssClass(): string {
        return this.expression;
    }
    public matches(view: view.View): boolean {
        let result = view._cssClasses.some(viewCssClass => viewCssClass === this.cssClass);
        if (result && this.attrExpression) {
            return matchesAttr(this.attrExpression, view);
        }
        return result;
    }
    public matchTailAndApply(view: view.View, valueSourceModifier: number): void {
        if (this.attrExpression && !matchesAttr(this.attrExpression, view)) {
            return;
        }
        this.apply(view, valueSourceModifier);
    }
    public toString(): string {
        return `CssClassSelector ${this.expression}${this.attrExpressionText} { ${this.declarationText} }`;
    }

    public visit(visitor: CssSelectorVisitor): void {
        visitor.visitClass(<any>this);
    }
}

class CssCompositeSelector extends CssSelector {
    private _head: CssSelector;

    get specificity(): number {
        let result = 0;
        for (let i = 0; i < this.parentCssSelectors.length; i++) {
            result += this.parentCssSelectors[i].selector.specificity;
        }
        return result;
    }

    get head(): CssSelector {
        return this._head;
    }

    private parentCssSelectors: [{ selector: CssSelector, onlyDirectParent: boolean, onlySameElement: boolean }];

    private splitExpression(expression) {
        let result = [];
        let tempArr = [];
        let validSpace = true;
        for (let i = 0; i < expression.length; i++) {
            if (expression[i] === LSBRACKET) {
                validSpace = false;
            }
            if (expression[i] === RSBRACKET) {
                validSpace = true;
            }
            let isDotOrHash = expression[i] === DOT || expression[i] === HASH;
            if ((expression[i] === SPACE && validSpace) || (expression[i] === GTHAN) || (isDotOrHash && tempArr.length > 0)) {
                if (tempArr.length > 0) {
                    result.push(tempArr.join(""));
                    tempArr = [];
                    if (isDotOrHash) {
                        result.push(EMPTY);
                        tempArr.push(expression[i]);
                    }
                }
                if (expression[i] === GTHAN) {
                    result.push(GTHAN);
                }
                continue;
            }
            tempArr.push(expression[i]);
        }
        if (tempArr.length > 0) {
            result.push(tempArr.join(""));
        }
        return result;
    }

    constructor(expr: string, declarations: cssParser.Declaration[]) {
        super(expr, declarations);
        let expressions = this.splitExpression(expr);
        let onlyDirectParent = false;
        let onlySameElement = false;
        this.parentCssSelectors = <any>[];
        for (let i = expressions.length - 1; i >= 0; i--) {
            if (expressions[i].trim() === GTHAN) {
                onlyDirectParent = true;
                continue;
            } else if (expressions[i] === EMPTY) {
                onlySameElement = true;
                continue;
            }
            if (this.parentCssSelectors.length === 0) {
                // This is the right-most selector, which must match exactly the target element
                onlyDirectParent = false;
                onlySameElement = true;
            }
            let selector = createSelector(expressions[i].trim(), null);
            this.parentCssSelectors.push({ selector, onlyDirectParent, onlySameElement });
            onlyDirectParent = false;
            onlySameElement = false;
        }

        this._head = null;
        for (let i = 0; i < this.parentCssSelectors.length; i++) {
            let current = this.parentCssSelectors[i];
            if (!current.onlySameElement) {
                break;
            }
            if (!this._head || current.selector.specificity > this._head.specificity) {
                this._head = current.selector;
            }
        }
    }

    public matchTailAndApply(view: view.View, valueSourceModifier: number): void {
        if (!this.matchesChain(view, this.head)) {
            return;
        }
        this.apply(view, valueSourceModifier);
    }

    public matches(view: view.View): boolean {
        return this.matchesChain(view);
    }

    private matchesChain(view: view.View, head?: CssSelector): boolean {
        for (let i = 0; i < this.parentCssSelectors.length; i++) {
            let sel = this.parentCssSelectors[i];
            if (sel.selector === head) {
            } else if (sel.onlySameElement) {
                if (!sel.selector.matches(view)) {
                    return false;
                }
            } else if (sel.onlyDirectParent) {
                view = view.parent;
                if (!view) {
                    return false;
                }
                if (!sel.selector.matches(view)) {
                    return false;
                }
            } else {
                // Ancestor...
                while(view = view.parent) {
                    if (sel.selector.matches(view)) {
                        break;
                    }
                }
                if (!view) {
                    return false;
                }
            }
        }
        return true;
    }

    public toString(): string {
        return `CssCompositeSelector ${this.expression}${this.attrExpressionText} { ${this.declarationText} }`;
    }

    public visit(visitor: CssSelectorVisitor): void {
        visitor.visitComposite(<any>this);
    }
}

class CssAttrSelector extends CssSelector {
    get specificity(): number {
        return ATTR_SPECIFITY;
    }

    public matches(view: view.View): boolean {
        return matchesAttr(this.attrExpression, view);
    }

    public toString(): string {
        return `CssAttrSelector ${this.expression}${this.attrExpressionText} { ${this.declarationText} }`;
    }

    public visit(visitor: CssSelectorVisitor): void {
        visitor.visitAttr(<any>this);
    }

    /**
     * There is no happy match for AttrSelector.
     */
    public matchTailAndApply(view: view.View, valueSourceModifier: number): void {
        if (!this.matches(view)) {
            return;
        }
        this.apply(view, valueSourceModifier);
    }
}

function matchesAttr(attrExpression: string, view: view.View): boolean {
    let equalSignIndex = attrExpression.indexOf(EQUAL);
    if (equalSignIndex > 0) {
        let nameValueRegex = /(.*[^~|\^\$\*])[~|\^\$\*]?=(.*)/;
        let nameValueRegexRes = nameValueRegex.exec(attrExpression);
        let attrName;
        let attrValue;
        if (nameValueRegexRes && nameValueRegexRes.length > 2) {
            attrName = nameValueRegexRes[1].trim();
            attrValue = nameValueRegexRes[2].trim().replace(/^(["'])*(.*)\1$/, '$2');
        }
        // extract entire sign (=, ~=, |=, ^=, $=, *=)
        let escapedAttrValue = utils.escapeRegexSymbols(attrValue);
        let attrCheckRegex;
        switch (attrExpression.charAt(equalSignIndex - 1)) {
            case "~":
                attrCheckRegex = new RegExp("(^|[^a-zA-Z-])" + escapedAttrValue + "([^a-zA-Z-]|$)");
                break;
            case "|":
                attrCheckRegex = new RegExp("^" + escapedAttrValue + "\\b");
                break;
            case "^":
                attrCheckRegex = new RegExp("^" + escapedAttrValue);
                break;
            case "$":
                attrCheckRegex = new RegExp(escapedAttrValue + "$");
                break;
            case "*":
                attrCheckRegex = new RegExp(escapedAttrValue);
                break;

            // only = (EQUAL)
            default:
                attrCheckRegex = new RegExp("^" + escapedAttrValue + "$");
                break;
        }
        return !types.isNullOrUndefined(view[attrName]) && attrCheckRegex.test(view[attrName] + "");
    } else {
        return !types.isNullOrUndefined(view[attrExpression]);
    }
}

export class CssVisualStateSelector extends CssSelector {
    private _key: string;
    private _match: string;
    private _state: string;
    private _isById: boolean;
    private _isByClass: boolean;
    private _isByType: boolean;
    private _isByAttr: boolean;

    get specificity(): number {
        return (this._isById ? ID_SPECIFICITY : 0) +
            (this._isByAttr ? ATTR_SPECIFITY : 0) +
            (this._isByClass ? CLASS_SPECIFICITY : 0) +
            (this._isByType ? TYPE_SPECIFICITY : 0);
    }

    get key(): string {
        return this._key;
    }

    get state(): string {
        return this._state;
    }

    protected get valueSourceModifier(): number {
        return observable.ValueSource.VisualState;
    }

    constructor(expression: string, declarations: cssParser.Declaration[]) {
        super(expression, declarations);

        let args = expression.split(COLON);
        this._key = args[0];
        this._state = args[1];

        if (this._key.charAt(0) === HASH) {
            this._match = this._key.substring(1);
            this._isById = true;
        } else if (this._key.charAt(0) === DOT) {
            this._match = this._key.substring(1);
            this._isByClass = true;
        } else if (this._key.charAt(0) === LSBRACKET) {
            this._match = this._key;
            this._isByAttr = true;
        }
        else if (this._key.length > 0) { // handle the case when there is no key. E.x. ":pressed" selector
            this._match = this._key;
            this._isByType = true;
        }
    }

    public matches(view: view.View): boolean {
        let matches = true;
        if (this._isById) {
            matches = this._match === view.id;
        }

        if (this._isByClass) {
            let expectedClass = this._match;
            matches = view._cssClasses.some((cssClass, i, arr) => { return cssClass === expectedClass });
        }

        if (this._isByType) {
            matches = matchesType(this._match, view);
        }

        if (this._isByAttr) {
            matches = matchesAttr(this._key, view);
        }

        return matches;
    }

    public matchTailAndApply(view: view.View, valueSourceModifier: number): void {
        if (!this.matches(view)) {
            return;
        }
        this.apply(view, valueSourceModifier);
    }

    public toString(): string {
        return `CssVisualStateSelector ${this.expression}${this.attrExpressionText} { ${this.declarationText} }`;
    }

    public visit(visitor: CssSelectorVisitor): void {
        visitor.visitVisualState(<any>this);
    }
}

let HASH = "#";
let DOT = ".";
let COLON = ":";
let SPACE = " ";
let GTHAN = ">";
let EMPTY = "";
let LSBRACKET = "[";
let RSBRACKET = "]";
let EQUAL = "=";

export function createSelector(expression: string, declarations: cssParser.Declaration[]): CssSelector {
    let goodExpr = expression.replace(/>/g, " > ").replace(/\s\s+/g, " ");
    let spaceIndex = goodExpr.indexOf(SPACE);
    let hasNonFirstDotOrHash = goodExpr.indexOf(DOT, 1) >= 0 || goodExpr.indexOf(HASH, 1) >= 0;
    if (spaceIndex >= 0) {
        return new CssCompositeSelector(goodExpr, declarations);
    }

    let leftSquareBracketIndex = goodExpr.indexOf(LSBRACKET);
    if (leftSquareBracketIndex === 0) {
        return new CssAttrSelector(goodExpr, declarations);
    }

    var colonIndex = goodExpr.indexOf(COLON);
    if (colonIndex >= 0) {
        return new CssVisualStateSelector(goodExpr, declarations);
    }

    if (hasNonFirstDotOrHash) {
        return new CssCompositeSelector(goodExpr, declarations);
    }

    if (goodExpr.charAt(0) === HASH) {
        return new CssIdSelector(goodExpr.substring(1), declarations);
    }

    if (goodExpr.charAt(0) === DOT) {
        return new CssClassSelector(goodExpr.substring(1), declarations);
    }

    return new CssTypeSelector(goodExpr, declarations);
}

class InlineStyleSelector extends CssSelector {
    constructor(declarations: cssParser.Declaration[]) {
        super(undefined, declarations)
    }

    public apply(view: view.View, valueSourceModifier: number) {
        this.eachSetter((property, value) => {
            const resolvedProperty = <StyleProperty>property;
            view.style._setValue(resolvedProperty, value, valueSourceModifier);
        });
    }

    public toString(): string {
        return `InlineStyleSelector ${this.expression}${this.attrExpressionText} { ${this.declarationText} }`;
    }

    public visit(visitor: CssSelectorVisitor): void {
        visitor.visitInlineStyle(<any>this);
    }

    public matchTailAndApply(view: view.View, valueSourceModifier: number): void {
        if (!this.matches(view)) {
            return;
        }
        this.apply(view, valueSourceModifier);
    }
}

export function applyInlineSyle(view: view.View, declarations: cssParser.Declaration[]) {
    let localStyleSelector = new InlineStyleSelector(declarations);
    localStyleSelector.apply(view, observable.ValueSource.Local);
}
