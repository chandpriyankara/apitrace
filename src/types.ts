export interface ApiEndpoint {
	path: string;
	method: string;
	methodName: string;
	controller: string;
	module: string;
	guards: string[];
	roles: string[];
	parameters: EndpointParameter[];
	returnType: string;
	decorators: string[];
	dependencies: string[];
}

export interface EndpointParameter {
	name: string;
	type: string;
	decorator: string;
	required: boolean;
	description?: string;
}

export interface ControllerInfo {
	name: string;
	path: string;
	module: string;
	endpoints: ApiEndpoint[];
	dependencies: string[];
	guards: string[];
}

export interface ServiceInfo {
	name: string;
	module: string;
	methods: string[];
	dependencies: string[];
	repositories: string[];
}

export interface ApiTraceResult {
	controllers: ControllerInfo[];
	services: ServiceInfo[];
}

/** @deprecated use ApiTraceResult */
export type ApiDiscoveryResult = ApiTraceResult;

export interface FunctionCall {
	type: 'internal' | 'repository' | 'external_service';
	method: string;
	service?: string;
	entity?: string;
}
