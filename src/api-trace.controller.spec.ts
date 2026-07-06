import { Test, TestingModule } from "@nestjs/testing";
import { ApiTraceController } from "./api-trace.controller";
import { ApiTraceService } from "./api-trace.service";

describe("ApiTraceController", () => {
	let controller: ApiTraceController;
	let apiTraceService: any;

	beforeEach(async () => {
		apiTraceService = {
			discoverApi: jest.fn(),
			generateMermaidDiagram: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [ApiTraceController],
			providers: [{ provide: ApiTraceService, useValue: apiTraceService }],
		}).compile();

		controller = module.get<ApiTraceController>(ApiTraceController);
	});

	it("should be defined", () => {
		expect(controller).toBeDefined();
	});

	describe("getMermaidCode", () => {
		it("should return mermaid diagram code", async () => {
			const mockApiResult = { controllers: [] };
			const mockMermaidCode = "sequenceDiagram\n    actor User";
			apiTraceService.discoverApi.mockResolvedValue(mockApiResult);
			apiTraceService.generateMermaidDiagram.mockResolvedValue(mockMermaidCode);

			const result = await controller.getMermaidCode();

			expect(result).toBe(mockMermaidCode);
			expect(apiTraceService.discoverApi).toHaveBeenCalled();
			expect(apiTraceService.generateMermaidDiagram).toHaveBeenCalledWith(mockApiResult);
		});
	});
});
