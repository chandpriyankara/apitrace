import * as fs from 'fs';
import * as path from 'path';
import { FunctionCall } from './types';

export interface ApiTraceOptions {
	apiName?: string;
	sourceRoot?: string;
	controllerPath?: string;
	enableController?: boolean;
	excludeServices?: string[];
	resolveServicePath?: (serviceName: string, sourceRoot: string) => string | null;
}

export const DEFAULT_API_TRACE_OPTIONS: Required<
	Pick<ApiTraceOptions, 'apiName' | 'sourceRoot' | 'controllerPath' | 'enableController'>
> = {
	apiName: 'API',
	sourceRoot: path.join(process.cwd(), 'src'),
	controllerPath: 'api-trace',
	enableController: true,
};

/** @deprecated use ApiTraceOptions */
export type ApiDiscoveryOptions = ApiTraceOptions;

/** @deprecated use DEFAULT_API_TRACE_OPTIONS */
export const DEFAULT_API_DISCOVERY_OPTIONS = DEFAULT_API_TRACE_OPTIONS;

export function defaultResolveServicePath(serviceName: string, sourceRoot: string): string | null {
	const base = serviceName.replace(/Service$/, '').toLowerCase();
	const candidates = [
		path.join(sourceRoot, base, `${base}.service.ts`),
		path.join(sourceRoot, base, `${serviceName.charAt(0).toLowerCase()}${serviceName.slice(1)}.ts`),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

export function resolveOptions(options?: ApiTraceOptions): Required<ApiTraceOptions> {
	return {
		apiName: options?.apiName ?? DEFAULT_API_TRACE_OPTIONS.apiName,
		sourceRoot: options?.sourceRoot ?? DEFAULT_API_TRACE_OPTIONS.sourceRoot,
		controllerPath: options?.controllerPath ?? DEFAULT_API_TRACE_OPTIONS.controllerPath,
		enableController: options?.enableController ?? DEFAULT_API_TRACE_OPTIONS.enableController,
		excludeServices: options?.excludeServices ?? [],
		resolveServicePath: options?.resolveServicePath ?? defaultResolveServicePath,
	};
}

export function extractMethodContent(sourceCode: string, methodName: string): string | null {
	const methodRegex = new RegExp(
		`(?:private|public|protected)?\\s*async\\s+${methodName}\\s*\\([^)]*\\)`,
		'g',
	);
	const match = methodRegex.exec(sourceCode);
	if (!match) return null;

	let searchStart = match.index + match[0].length;
	let startIndex = -1;
	let braceCount = 0;
	let inReturnType = false;
	let angleBraceCount = 0;

	for (let i = searchStart; i < sourceCode.length; i++) {
		const char = sourceCode[i];

		if (char === '<') {
			angleBraceCount++;
			inReturnType = true;
		} else if (char === '>') {
			angleBraceCount--;
			if (angleBraceCount === 0) {
				inReturnType = false;
			}
		}

		if (char === '{' && !inReturnType && angleBraceCount === 0) {
			startIndex = i + 1;
			braceCount = 1;
			break;
		}
	}

	if (startIndex === -1) return null;

	let endIndex = startIndex;
	for (let i = startIndex; i < sourceCode.length && braceCount > 0; i++) {
		if (sourceCode[i] === '{') braceCount++;
		else if (sourceCode[i] === '}') braceCount--;
		endIndex = i;
	}

	return sourceCode.substring(startIndex, endIndex);
}

export function analyzeFunctionCalls(methodContent: string, serviceName: string): FunctionCall[] {
	const functionCalls: FunctionCall[] = [];

	const repoCallRegex = /this\.(\w+Repository)\.(\w+)\(/g;
	let repoMatch: RegExpExecArray | null;
	while ((repoMatch = repoCallRegex.exec(methodContent)) !== null) {
		const repositoryVariableName = repoMatch[1];
		const method = repoMatch[2];
		const entityName = repositoryVariableName.replace('Repository', '');

		functionCalls.push({
			type: 'repository',
			method,
			entity: entityName,
			service: repositoryVariableName,
		});
	}

	const internalCallRegex = /(?:await\s+)?this\.(\w+)\(/g;
	let internalMatch: RegExpExecArray | null;
	while ((internalMatch = internalCallRegex.exec(methodContent)) !== null) {
		const method = internalMatch[1];
		if (
			!method.includes('Repository') &&
			method !== 'logger' &&
			method !== 'constructor' &&
			method.length > 0
		) {
			functionCalls.push({
				type: 'internal',
				method,
				service: serviceName,
			});
		}
	}

	const externalServiceRegex = /this\.(\w+Service)\.(\w+)\(/g;
	let externalMatch: RegExpExecArray | null;
	while ((externalMatch = externalServiceRegex.exec(methodContent)) !== null) {
		const externalServiceName = externalMatch[1];
		const method = externalMatch[2];

		if (externalServiceName !== serviceName) {
			functionCalls.push({
				type: 'external_service',
				method,
				service: externalServiceName,
			});
		}
	}

	return functionCalls;
}

export async function getServiceMethodFunctionHierarchy(
	serviceName: string,
	methodName: string,
	resolveServicePath: (serviceName: string, sourceRoot: string) => string | null,
	sourceRoot: string,
	visitedMethods: Set<string> = new Set(),
	depth = 0,
): Promise<FunctionCall[]> {
	const functionCalls: FunctionCall[] = [];
	const maxDepth = 3;

	if (depth > maxDepth || visitedMethods.has(`${serviceName}.${methodName}`)) {
		return functionCalls;
	}

	visitedMethods.add(`${serviceName}.${methodName}`);

	const servicePath = resolveServicePath(serviceName, sourceRoot);
	if (!servicePath) {
		return functionCalls;
	}

	const serviceContent = fs.readFileSync(servicePath, 'utf8');
	const methodContent = extractMethodContent(serviceContent, methodName);
	if (!methodContent) {
		return functionCalls;
	}

	const directCalls = analyzeFunctionCalls(methodContent, serviceName);
	functionCalls.push(...directCalls);

	for (const call of directCalls) {
		if (call.type === 'internal' && call.method) {
			const nestedCalls = await getServiceMethodFunctionHierarchy(
				serviceName,
				call.method,
				resolveServicePath,
				sourceRoot,
				visitedMethods,
				depth + 1,
			);
			functionCalls.push(...nestedCalls);
		}
	}

	return functionCalls;
}
