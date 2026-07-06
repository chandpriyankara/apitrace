import 'reflect-metadata';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { PATH_METADATA, METHOD_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { API_TRACE_OPTIONS } from './constants';
import {
	generateControllerMermaidDiagram,
	generateMermaidDiagram,
	buildFullPath,
} from './mermaid-generator';
import { ApiTraceOptions, resolveOptions } from './source-analyzer';
import {
	ApiTraceResult,
	ApiEndpoint,
	ControllerInfo,
	EndpointParameter,
	ServiceInfo,
} from './types';

const BUILT_IN_SERVICES = [
	'ModulesContainer',
	'MetadataScanner',
	'Reflector',
	'HttpAdapterHost',
	'ApplicationConfig',
	'SerializedGraph',
	'Logger',
	'JwtService',
	'ConfigService',
	'ModuleRef',
	'DiscoveryService',
	'Module',
];

@Injectable()
export class ApiTraceService {
	private readonly logger = new Logger(ApiTraceService.name);
	private readonly options: Required<ApiTraceOptions>;

	constructor(
		private readonly discoveryService: DiscoveryService,
		private readonly reflector: Reflector,
		@Optional() @Inject(API_TRACE_OPTIONS) options?: ApiTraceOptions,
	) {
		this.options = resolveOptions(options);
	}

	async discoverApi(): Promise<ApiTraceResult> {
		this.logger.log('Starting API discovery...');

		const controllers: ControllerInfo[] = [];
		const services: ServiceInfo[] = [];

		try {
			const controllerWrappers = this.discoveryService.getControllers();
			this.logger.log(`Found ${controllerWrappers.length} controller wrappers`);

			for (const wrapper of controllerWrappers) {
				if (!wrapper.metatype) continue;

				const controller = wrapper.metatype;
				const controllerName = controller.name;
				const moduleName = wrapper.host?.metatype?.name || 'Unknown';
				const controllerPath = this.reflector.get(PATH_METADATA, controller) || '';
				const controllerGuards = this.getGuards(controller);
				const dependencies = this.getDependenciesFromWrapper(wrapper);
				const endpoints = this.discoverEndpointsInController(
					controller,
					controllerPath,
					moduleName,
					controllerGuards,
				);

				controllers.push({
					name: controllerName,
					path: controllerPath,
					module: moduleName,
					endpoints,
					dependencies,
					guards: controllerGuards,
				});
			}

			try {
				const providerWrappers = this.discoveryService.getProviders();
				this.logger.log(`Found ${providerWrappers.length} provider wrappers`);

				for (const wrapper of providerWrappers) {
					try {
						if (!wrapper.metatype || this.isBuiltInService(wrapper.metatype.name)) continue;

						const service = wrapper.metatype;
						const serviceName = service.name;
						const moduleName = wrapper.host?.metatype?.name || 'Unknown';

						services.push({
							name: serviceName,
							module: moduleName,
							methods: this.getServiceMethodsSafely(service),
							dependencies: this.getDependenciesFromWrapper(wrapper),
							repositories: this.getRepositoriesFromWrapper(wrapper),
						});
					} catch (serviceError) {
						this.logger.warn(
							`Error processing service ${wrapper.metatype?.name}: ${serviceError.message}`,
						);
					}
				}
			} catch (providerError) {
				this.logger.warn(`Error getting providers: ${providerError.message}`);
			}
		} catch (error) {
			this.logger.error('Error during API discovery:', error);
		}

		const result: ApiTraceResult = { controllers, services };
		const totalEndpoints = controllers.reduce((sum, ctrl) => sum + ctrl.endpoints.length, 0);
		this.logger.log(
			`API discovery completed. Found ${controllers.length} controllers, ${services.length} services, ${totalEndpoints} endpoints`,
		);
		return result;
	}

	async generateMermaidDiagram(result: ApiTraceResult): Promise<string> {
		return generateMermaidDiagram(result, this.options);
	}

	async generateControllerMermaidDiagram(
		controller: ControllerInfo,
		services: ServiceInfo[],
	): Promise<string> {
		return generateControllerMermaidDiagram(controller, services, this.options);
	}

	private getDependenciesFromWrapper(wrapper: InstanceWrapper): string[] {
		const dependencies: string[] = [];

		try {
			if ((wrapper as any).dependencies) {
				for (const dep of (wrapper as any).dependencies) {
					let depName: string | null = null;
					if (dep && dep.name) {
						depName = dep.name;
					} else if (dep && typeof dep === 'function') {
						depName = dep.name;
					} else if (dep && dep.metatype && dep.metatype.name) {
						depName = dep.metatype.name;
					}
					if (depName && !this.isBuiltInService(depName)) {
						dependencies.push(depName);
					}
				}
			}

			if (wrapper.inject && dependencies.length === 0) {
				for (const token of wrapper.inject) {
					if (typeof token === 'string') {
						dependencies.push(token);
					} else if (token && typeof token === 'function') {
						dependencies.push(token.name);
					}
				}
			}

			if (wrapper.metatype && dependencies.length === 0) {
				const paramTypes = Reflect.getMetadata('design:paramtypes', wrapper.metatype) || [];
				for (const paramType of paramTypes) {
					if (
						paramType &&
						paramType.name &&
						paramType.name !== 'Object' &&
						paramType.name !== 'Function' &&
						!this.isBuiltInService(paramType.name)
					) {
						dependencies.push(paramType.name);
					}
				}
			}

			if (dependencies.length === 0 && wrapper.metatype) {
				const controllerName = wrapper.metatype.name;
				if (controllerName.endsWith('Controller')) {
					dependencies.push(controllerName.replace('Controller', 'Service'));
				}
			}
		} catch (error) {
			this.logger.warn(
				`Error getting dependencies for ${wrapper.metatype?.name}: ${error.message}`,
			);
		}

		return dependencies;
	}

	private getRepositoriesFromWrapper(wrapper: InstanceWrapper): string[] {
		const repositories: string[] = [];

		if (wrapper.inject) {
			for (const token of wrapper.inject) {
				if (typeof token === 'string' && token.includes('Repository')) {
					repositories.push(token);
				}
			}
		}

		return repositories;
	}

	private discoverEndpointsInController(
		controller: any,
		basePath: string,
		moduleName: string,
		controllerGuards: string[],
	): ApiEndpoint[] {
		const endpoints: ApiEndpoint[] = [];
		const prototype = controller.prototype;
		if (!prototype) return endpoints;

		const methodNames = Object.getOwnPropertyNames(prototype).filter((name) => {
			if (name === 'constructor') return false;
			return typeof prototype[name] === 'function';
		});

		for (const methodName of methodNames) {
			const method = prototype[methodName];
			if (!method || typeof method !== 'function') continue;

			const httpMethod = this.reflector.get(METHOD_METADATA, method);
			if (httpMethod === undefined) continue;

			const routePath = this.reflector.get(PATH_METADATA, method) || '';
			const fullPath = buildFullPath(basePath, routePath);
			const methodGuards = this.getGuards(method);

			endpoints.push({
				path: fullPath,
				method: this.getHttpMethodName(httpMethod),
				methodName,
				controller: controller.name,
				module: moduleName,
				guards: [...controllerGuards, ...methodGuards],
				roles: this.getRoles(method),
				parameters: this.getParameters(method),
				returnType: this.getReturnType(method),
				decorators: this.getDecorators(method),
				dependencies: this.getMethodDependencies(controller, methodName),
			});
		}

		return endpoints;
	}

	private getGuards(target: any): string[] {
		const guards = this.reflector.get('__guards__', target) || [];
		return guards.map((guard: any) => guard.name || guard.constructor?.name || 'Unknown');
	}

	private getRoles(target: any): string[] {
		return this.reflector.get('roles', target) || [];
	}

	private getParameters(method: any): EndpointParameter[] {
		const parameters: EndpointParameter[] = [];
		const routeArgs = this.reflector.get(ROUTE_ARGS_METADATA, method) || {};

		for (const [key, metadata] of Object.entries(routeArgs)) {
			const paramMetadata = metadata as any;
			parameters.push({
				name: paramMetadata.data || `param${key}`,
				type: paramMetadata.metatype?.name || 'any',
				decorator: this.getParameterDecorator(paramMetadata.index),
				required: !paramMetadata.pipes?.some((pipe: any) => pipe.name === 'OptionalPipe'),
			});
		}

		return parameters;
	}

	private getDecorators(method: any): string[] {
		const decorators: string[] = [];
		const decoratorChecks = [
			{ key: 'swagger/api-operation', name: 'ApiOperation' },
			{ key: 'swagger/api-response', name: 'ApiResponse' },
			{ key: 'swagger/api-tags', name: 'ApiTags' },
			{ key: 'swagger/api-bearer-auth', name: 'ApiBearerAuth' },
			{ key: '__guards__', name: 'UseGuards' },
			{ key: 'roles', name: 'Roles' },
		];

		for (const check of decoratorChecks) {
			if (this.reflector.get(check.key, method)) {
				decorators.push(check.name);
			}
		}

		return decorators;
	}

	private getServiceMethods(service: any): string[] {
		const methods: string[] = [];
		const prototype = service.prototype;
		if (!prototype) return methods;

		for (const methodName of Object.getOwnPropertyNames(prototype)) {
			if (methodName === 'constructor') continue;
			if (typeof prototype[methodName] === 'function') {
				methods.push(methodName);
			}
		}

		return methods;
	}

	private getServiceMethodsSafely(service: any): string[] {
		try {
			if (this.isBuiltInService(service?.name)) {
				return [];
			}
			return this.getServiceMethods(service);
		} catch (error) {
			if (!this.isBuiltInService(service?.name)) {
				this.logger.warn(`Error getting methods for service ${service?.name}: ${error.message}`);
			}
			return [];
		}
	}

	private getMethodDependencies(_controller: any, _methodName: string): string[] {
		return [];
	}

	private getHttpMethodName(httpMethod: number): string {
		const methods: Record<number, string> = {
			[RequestMethod.GET]: 'GET',
			[RequestMethod.POST]: 'POST',
			[RequestMethod.PUT]: 'PUT',
			[RequestMethod.DELETE]: 'DELETE',
			[RequestMethod.PATCH]: 'PATCH',
			[RequestMethod.ALL]: 'ALL',
			[RequestMethod.OPTIONS]: 'OPTIONS',
			[RequestMethod.HEAD]: 'HEAD',
		};

		return methods[httpMethod] || 'UNKNOWN';
	}

	private getParameterDecorator(index: number): string {
		const decorators = ['@Body', '@Param', '@Query', '@Headers', '@Req', '@Res'];
		return decorators[index] || '@Unknown';
	}

	private getReturnType(method: any): string {
		const returnType = this.reflector.get('design:returntype', method);
		if (returnType) {
			return returnType.name || 'Promise<IResponse>';
		}
		return 'Promise<IResponse>';
	}

	private isBuiltInService(serviceName: string): boolean {
		if (!serviceName) return true;
		if (BUILT_IN_SERVICES.includes(serviceName)) return true;
		if (this.options.excludeServices.includes(serviceName)) return true;

		return (
			serviceName.startsWith('TypeOrm') ||
			serviceName.startsWith('Nest') ||
			serviceName.includes('Adapter') ||
			serviceName.includes('Factory')
		);
	}
}

/** @deprecated use ApiTraceService */
export const ApiDiscoveryService = ApiTraceService;
