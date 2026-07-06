import { DynamicModule, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { API_TRACE_OPTIONS } from './constants';
import { ApiTraceController } from './api-trace.controller';
import { ApiTraceService } from './api-trace.service';
import { ApiTraceOptions } from './source-analyzer';

@Module({})
export class ApiTraceModule {
	static forRoot(options?: ApiTraceOptions): DynamicModule {
		return {
			module: ApiTraceModule,
			imports: [DiscoveryModule],
			controllers: options?.enableController === false ? [] : [ApiTraceController],
			providers: [
				{ provide: API_TRACE_OPTIONS, useValue: options ?? {} },
				ApiTraceService,
			],
			exports: [ApiTraceService],
		};
	}
}

/** @deprecated use ApiTraceModule */
export const ApiDiscoveryModule = ApiTraceModule;
