import * as TKUnit from "./TKUnit";
import {ScopeError} from "utils/debug";

export function test_ScopeThreeErrors() {
    let e1 = new Error("Once");
    let e2 = new ScopeError(e1, "Twice");
    let e3 = new ScopeError(e2, "Trice");

    TKUnit.assertEqual(e3.message, "Trice\n ↳Twice\n   ↳Once", "Expected e3.message to match.");
    TKUnit.assertEqual(e3.toString(), "Error: Trice\n ↳Twice\n   ↳Once", "Expected e3.toString() to match.");
}
