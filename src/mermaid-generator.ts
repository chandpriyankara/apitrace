import {
	ApiTraceResult,
	ApiEndpoint,
	ControllerInfo,
	FunctionCall,
	ServiceInfo,
} from './types';
import { ApiTraceOptions, getServiceMethodFunctionHierarchy } from './source-analyzer';

export async function generateMermaidDiagram(
	result: ApiTraceResult,
	options: Required<ApiTraceOptions>,
): Promise<string> {
	const allMermaidCode: string[] = [];

	for (const controller of result.controllers) {
		if (controller.endpoints.length === 0) continue;

		allMermaidCode.push(
			`%% ${controller.name} - ${controller.path} (${controller.endpoints.length} endpoints)`,
		);
		const controllerMermaid = await generateControllerMermaidDiagram(
			controller,
			result.services,
			options,
		);
		allMermaidCode.push(controllerMermaid);
		allMermaidCode.push('');
	}

	return allMermaidCode.join('\n');
}

export async function generateControllerMermaidDiagram(
	controller: ControllerInfo,
	services: ServiceInfo[],
	options: Required<ApiTraceOptions>,
): Promise<string> {
	const lines: string[] = [];
	lines.push('sequenceDiagram');

	lines.push('    actor User as User/Client');
	lines.push(`    participant API as ${options.apiName}`);
	lines.push(`    participant ${controller.name} as ${controller.name}`);

	const usedServices = new Set<string>();
	for (const dependency of controller.dependencies) {
		const service = services.find((s) => s.name === dependency);
		if (service) {
			usedServices.add(dependency);
		}
	}

	for (const serviceName of usedServices) {
		lines.push(`    participant ${serviceName} as ${serviceName}`);
	}

	lines.push('    participant DB as Database');
	lines.push('');

	let stepNumber = 1;
	for (const endpoint of controller.endpoints) {
		await generateMermaidEndpointFlow(
			controller,
			endpoint,
			stepNumber,
			lines,
			services,
			options,
		);
		stepNumber++;
	}

	return lines.join('\n');
}

async function generateMermaidEndpointFlow(
	controller: ControllerInfo,
	endpoint: ApiEndpoint,
	stepNumber: number,
	lines: string[],
	services: ServiceInfo[],
	options: Required<ApiTraceOptions>,
): Promise<void> {
	const methodLabel = `${stepNumber}. ${endpoint.method} ${endpoint.path}`;

	lines.push(`    User->>API: ${methodLabel}`);
	lines.push(`    API->>${controller.name}: ${endpoint.methodName}()`);

	if (endpoint.guards.length > 0) {
		lines.push(`    ${controller.name}->>AuthGuard: validate JWT token`);
		lines.push(`    AuthGuard-->>${controller.name}: authorized`);
	}

	if (endpoint.roles.length > 0) {
		lines.push(
			`    ${controller.name}->>RolesGuard: check roles [${endpoint.roles.join(', ')}]`,
		);
		lines.push(`    RolesGuard-->>${controller.name}: role authorized`);
	}

	if (controller.dependencies && controller.dependencies.length > 0) {
		for (const dependency of controller.dependencies) {
			const service = services.find((s) => s.name === dependency);
			if (service) {
				const serviceMethod = findBestMatchingMethod(endpoint.methodName, service.methods);
				lines.push(`    ${controller.name}->>${dependency}: ${serviceMethod}()`);

				const functionHierarchy = await getServiceMethodFunctionHierarchy(
					dependency,
					serviceMethod,
					options.resolveServicePath,
					options.sourceRoot,
				);

				appendFunctionCalls(dependency, functionHierarchy, lines);
				lines.push(`    ${dependency}-->>${controller.name}: processed data`);
			}
		}
	} else {
		lines.push(`    ${controller.name}->>Repository: direct query`);
		lines.push(`    Repository-->>${controller.name}: result`);
	}

	lines.push(`    ${controller.name}-->>API: ${endpoint.returnType}`);
	lines.push(`    API-->>User: HTTP ${getExpectedStatusCode(endpoint.method)}`);
	lines.push('');
}

function appendFunctionCalls(
	dependency: string,
	functionHierarchy: FunctionCall[],
	lines: string[],
): void {
	for (const funcCall of functionHierarchy) {
		if (funcCall.type === 'internal') {
			lines.push(`    ${dependency}->>${dependency}: ${funcCall.method}()`);
		} else if (funcCall.type === 'repository') {
			lines.push(`    ${dependency}->>${funcCall.service}: ${funcCall.method}()`);
			lines.push(`    ${funcCall.service}-->>${dependency}: ${funcCall.entity} data`);
		} else if (funcCall.type === 'external_service') {
			lines.push(`    ${dependency}->>${funcCall.service}: ${funcCall.method}()`);
			lines.push(`    ${funcCall.service}-->>${dependency}: result`);
		}
	}
}

export function findBestMatchingMethod(controllerMethod: string, serviceMethods: string[]): string {
	const lowerControllerMethod = controllerMethod.toLowerCase();

	const exactMatch = serviceMethods.find((m) => m.toLowerCase() === lowerControllerMethod);
	if (exactMatch) return exactMatch;

	const partialMatch = serviceMethods.find(
		(m) =>
			m.toLowerCase().includes(lowerControllerMethod) ||
			lowerControllerMethod.includes(m.toLowerCase()),
	);
	if (partialMatch) return partialMatch;

	const semanticMatch = findSemanticMatch(lowerControllerMethod, serviceMethods);
	if (semanticMatch) return semanticMatch;

	return serviceMethods.length > 0 ? serviceMethods[0] : controllerMethod;
}

function findSemanticMatch(controllerMethod: string, serviceMethods: string[]): string | undefined {
	const semanticMappings: Record<string, string[]> = {
		create: ['add', 'insert', 'save', 'register'],
		add: ['create', 'insert', 'save', 'register'],
		get: ['find', 'retrieve', 'fetch', 'load'],
		find: ['get', 'retrieve', 'fetch', 'load'],
		update: ['edit', 'modify', 'change', 'patch'],
		edit: ['update', 'modify', 'change', 'patch'],
		delete: ['remove', 'destroy', 'cancel'],
		remove: ['delete', 'destroy', 'cancel'],
		login: ['authenticate', 'signin', 'auth'],
		register: ['signup', 'create', 'add'],
	};

	for (const [key, synonyms] of Object.entries(semanticMappings)) {
		if (controllerMethod.includes(key)) {
			for (const synonym of synonyms) {
				const match = serviceMethods.find((m) => m.toLowerCase().includes(synonym));
				if (match) return match;
			}
		}
	}

	return undefined;
}

export function getExpectedStatusCode(method: string): string {
	switch (method) {
		case 'POST':
			return '201 Created';
		case 'PUT':
		case 'PATCH':
		case 'DELETE':
			return '200 OK';
		case 'GET':
		default:
			return '200 OK';
	}
}

export function buildFullPath(basePath: string, routePath: string): string {
	const base = basePath.startsWith('/') ? basePath : `/${basePath}`;
	const route = routePath.startsWith('/') ? routePath : `/${routePath}`;

	if (routePath === '') return base;
	if (basePath === '') return route;

	return `${base}${route}`.replace(/\/+/g, '/');
}
