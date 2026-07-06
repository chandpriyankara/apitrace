import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiTraceService } from './api-trace.service';

@ApiTags('API Trace')
@Controller('api-trace')
export class ApiTraceController {
	constructor(private readonly apiTraceService: ApiTraceService) {}

	@Get('sequence-diagram')
	@Header('Content-Type', 'text/plain')
	@ApiOperation({
		summary: 'Get pure Mermaid code',
		description:
			'Returns Mermaid sequence diagram code organized by route handler. Copy-paste ready for mermaid.live.',
	})
	@ApiResponse({
		status: 200,
		description: 'Pure Mermaid code',
		schema: {
			type: 'string',
			example:
				'sequenceDiagram\n    actor User as User/Client\n    participant API as API\n    ...',
		},
	})
	async getMermaidCode(): Promise<string> {
		const result = await this.apiTraceService.discoverApi();
		return this.apiTraceService.generateMermaidDiagram(result);
	}
}

/** @deprecated use ApiTraceController */
export const ApiDiscoveryController = ApiTraceController;
