import { z } from "zod";

type Renderable =
	| string
	| Promise<string>
	| { toString: () => string | Promise<string> }
	| null;

export const render = z
	.function()
	.args(z.custom<unknown>(), z.custom<unknown>())
	.returns(z.union([z.string(), z.promise(z.string())]))
	.implement((Component, props) => {
		const component = Component as (componentProps: unknown) => Renderable;
		const element = component(props);

		if (element === null) {
			return "";
		}

		if (typeof element === "string") {
			return element;
		}

		if (element instanceof Promise) {
			return element;
		}

		return element.toString();
	});
