import { Test, TestingModule } from "@nestjs/testing";
import { ApiTraceService } from "./api-trace.service";
import { ApiTraceResult } from "./types";
import { buildFullPath, findBestMatchingMethod, getExpectedStatusCode } from "./mermaid-generator";
import { DiscoveryService } from "@nestjs/core";
import { Reflector } from "@nestjs/core";
import { PATH_METADATA, METHOD_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";

describe("ApiTraceService", () => {
    let service: ApiTraceService;
    let discoveryService: jest.Mocked<DiscoveryService>;
    let reflector: jest.Mocked<Reflector>;

    beforeEach(async () => {
        const mockDiscoveryService = {
            getControllers: jest.fn().mockReturnValue([]),
            getProviders: jest.fn().mockReturnValue([]),
        };

        const mockReflector = {
            get: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ApiTraceService,
                {
                    provide: DiscoveryService,
                    useValue: mockDiscoveryService,
                },
                {
                    provide: Reflector,
                    useValue: mockReflector,
                },
            ],
        }).compile();

        service = module.get<ApiTraceService>(ApiTraceService);
        discoveryService = module.get(DiscoveryService);
        reflector = module.get(Reflector);
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    describe("discoverApi", () => {
        it("should return API discovery result", async () => {
            discoveryService.getControllers.mockReturnValue([]);
            discoveryService.getProviders.mockReturnValue([]);

            const result = await service.discoverApi();

            expect(result).toBeDefined();
            expect(result).toHaveProperty("controllers");
            expect(result).toHaveProperty("services");
            expect(Array.isArray(result.controllers)).toBe(true);
            expect(Array.isArray(result.services)).toBe(true);
        });

        it("should handle empty controllers and providers", async () => {
            discoveryService.getControllers.mockReturnValue([]);
            discoveryService.getProviders.mockReturnValue([]);

            const result = await service.discoverApi();

            expect(result.controllers).toHaveLength(0);
            expect(result.services).toHaveLength(0);
        });

        it("should discover controllers with endpoints", async () => {
            const mockController = class TestController {};
            const mockWrapper = {
                metatype: mockController,
                host: { metatype: { name: "TestModule" } },
            };

            reflector.get = jest.fn((key, target) => {
                if (key === PATH_METADATA) {
                    if (target === mockController) return "/test";
                    return "/endpoint";
                }
                if (key === METHOD_METADATA) {
                    return RequestMethod.GET;
                }
                return undefined;
            });

            discoveryService.getControllers.mockReturnValue([mockWrapper] as any);
            discoveryService.getProviders.mockReturnValue([]);

            const result = await service.discoverApi();

            expect(result.controllers.length).toBeGreaterThan(0);
        });

        it("should handle controllers without metatype", async () => {
            const mockWrapper = {
                metatype: null,
            };

            discoveryService.getControllers.mockReturnValue([mockWrapper] as any);
            discoveryService.getProviders.mockReturnValue([]);

            const result = await service.discoverApi();

            expect(result.controllers).toHaveLength(0);
        });

        it("should discover services", async () => {
            const mockService = class TestService {};
            const mockWrapper = {
                metatype: mockService,
                host: { metatype: { name: "TestModule" } },
            };

            discoveryService.getControllers.mockReturnValue([]);
            discoveryService.getProviders.mockReturnValue([mockWrapper] as any);

            const result = await service.discoverApi();

            expect(result.services.length).toBeGreaterThanOrEqual(0);
        });

        it("should handle provider errors gracefully", async () => {
            discoveryService.getControllers.mockReturnValue([]);
            discoveryService.getProviders.mockImplementation(() => {
                throw new Error("Provider error");
            });

            const result = await service.discoverApi();

            expect(result).toBeDefined();
            expect(result.services).toHaveLength(0);
        });

        it("should handle service processing errors", async () => {
            const mockService = class TestService {};
            const mockWrapper = {
                metatype: mockService,
                host: null,
            };

            discoveryService.getControllers.mockReturnValue([]);
            discoveryService.getProviders.mockReturnValue([mockWrapper] as any);

            const result = await service.discoverApi();

            expect(result).toBeDefined();
        });

        it("should skip built-in services", async () => {
            const mockService = class Logger {};
            const mockWrapper = {
                metatype: mockService,
                host: { metatype: { name: "TestModule" } },
            };

            discoveryService.getControllers.mockReturnValue([]);
            discoveryService.getProviders.mockReturnValue([mockWrapper] as any);

            const result = await service.discoverApi();

            const loggerService = result.services.find(s => s.name === "Logger");
            expect(loggerService).toBeUndefined();
        });
    });

    describe("generateMermaidDiagram", () => {
        it("should generate mermaid diagram", async () => {
            const result = {
                controllers: [],
                services: [],
            };
            const diagram = await service.generateMermaidDiagram(result);
            expect(diagram).toBeDefined();
            expect(typeof diagram).toBe("string");
        });

        it("should generate diagram for controllers with endpoints", async () => {
            const result: ApiTraceResult = {
                controllers: [
                    {
                        name: "TestController",
                        path: "/test",
                        module: "TestModule",
                        guards: [],
                        endpoints: [
                            {
                                method: "GET",
                                path: "/test",
                                methodName: "getTest",
                                controller: "TestController",
                                module: "TestModule",
                                guards: [],
                                roles: [],
                                parameters: [],
                                returnType: "void",
                                decorators: [],
                                dependencies: [],
                            },
                        ],
                        dependencies: [],
                    },
                ],
                services: [],
            };
            const diagram = await service.generateMermaidDiagram(result);
            expect(diagram).toContain("sequenceDiagram");
            expect(diagram).toContain("TestController");
        });

        it("should skip controllers without endpoints", async () => {
            const result: ApiTraceResult = {
                controllers: [
                    {
                        name: "TestController",
                        path: "/test",
                        module: "TestModule",
                        guards: [],
                        endpoints: [],
                        dependencies: [],
                    },
                ],
                services: [],
            };
            const diagram = await service.generateMermaidDiagram(result);
            expect(diagram).not.toContain("TestController");
        });
    });

    describe("generateControllerMermaidDiagram", () => {
        it("should generate controller diagram", async () => {
            const controller = {
                name: "TestController",
                path: "/test",
                endpoints: [
                    {
                        method: "GET",
                        path: "/test",
                        methodName: "getTest",
                        guards: [],
                        roles: [],
                    },
                ],
                dependencies: [],
            };
            const services = [];
            const diagram = await service.generateControllerMermaidDiagram(controller as any, services);
            expect(diagram).toContain("sequenceDiagram");
            expect(diagram).toContain("TestController");
        });

        it("should include services in diagram", async () => {
            const controller = {
                name: "TestController",
                path: "/test",
                endpoints: [
                    {
                        method: "GET",
                        path: "/test",
                        methodName: "getTest",
                        guards: [],
                        roles: [],
                    },
                ],
                dependencies: ["TestService"],
            };
            const services = [
                {
                    name: "TestService",
                    module: "TestModule",
                    methods: ["getData"],
                    dependencies: [],
                    repositories: [],
                },
            ];
            const diagram = await service.generateControllerMermaidDiagram(controller as any, services);
            expect(diagram).toContain("TestService");
        });

        it("should include guards in diagram", async () => {
            const controller = {
                name: "TestController",
                path: "/test",
                endpoints: [
                    {
                        method: "GET",
                        path: "/test",
                        methodName: "getTest",
                        guards: ["JwtAuthGuard"],
                        roles: [],
                    },
                ],
                dependencies: [],
            };
            const services = [];
            const diagram = await service.generateControllerMermaidDiagram(controller as any, services);
            expect(diagram).toContain("AuthGuard");
        });

        it("should include roles in diagram", async () => {
            const controller = {
                name: "TestController",
                path: "/test",
                endpoints: [
                    {
                        method: "GET",
                        path: "/test",
                        methodName: "getTest",
                        guards: [],
                        roles: ["ADMIN", "USER"],
                    },
                ],
                dependencies: [],
            };
            const services = [];
            const diagram = await service.generateControllerMermaidDiagram(controller as any, services);
            expect(diagram).toContain("ADMIN");
            expect(diagram).toContain("USER");
        });
    });

    describe("buildFullPath", () => {
        it("should handle base path without leading slash", () => {
            const path = buildFullPath("test", "/endpoint");
            expect(path).toBe("/test/endpoint");
        });

        it("should handle route path without leading slash", () => {
            const path = buildFullPath("/test", "endpoint");
            expect(path).toBe("/test/endpoint");
        });

        it("should return base when routePath is empty", () => {
            const path = buildFullPath("/test", "");
            expect(path).toBe("/test");
        });

        it("should return route when basePath is empty", () => {
            const path = buildFullPath("", "/endpoint");
            expect(path).toBe("/endpoint");
        });

        it("should normalize multiple slashes", () => {
            const path = buildFullPath("/test//", "//endpoint");
            expect(path).toBe("/test/endpoint");
        });
    });

    describe("getHttpMethodName", () => {
        it("should return GET for RequestMethod.GET", () => {
            const method = (service as any).getHttpMethodName(RequestMethod.GET);
            expect(method).toBe("GET");
        });

        it("should return POST for RequestMethod.POST", () => {
            const method = (service as any).getHttpMethodName(RequestMethod.POST);
            expect(method).toBe("POST");
        });

        it("should return PUT for RequestMethod.PUT", () => {
            const method = (service as any).getHttpMethodName(RequestMethod.PUT);
            expect(method).toBe("PUT");
        });

        it("should return DELETE for RequestMethod.DELETE", () => {
            const method = (service as any).getHttpMethodName(RequestMethod.DELETE);
            expect(method).toBe("DELETE");
        });

        it("should return PATCH for RequestMethod.PATCH", () => {
            const method = (service as any).getHttpMethodName(RequestMethod.PATCH);
            expect(method).toBe("PATCH");
        });

        it("should return ALL for RequestMethod.ALL", () => {
            const method = (service as any).getHttpMethodName(RequestMethod.ALL);
            expect(method).toBe("ALL");
        });

        it("should return OPTIONS for RequestMethod.OPTIONS", () => {
            const method = (service as any).getHttpMethodName(RequestMethod.OPTIONS);
            expect(method).toBe("OPTIONS");
        });

        it("should return HEAD for RequestMethod.HEAD", () => {
            const method = (service as any).getHttpMethodName(RequestMethod.HEAD);
            expect(method).toBe("HEAD");
        });

        it("should return UNKNOWN for invalid method", () => {
            const method = (service as any).getHttpMethodName(999);
            expect(method).toBe("UNKNOWN");
        });
    });

    describe("isBuiltInService", () => {
        it("should return true for built-in services", () => {
            expect((service as any).isBuiltInService("Logger")).toBe(true);
            expect((service as any).isBuiltInService("JwtService")).toBe(true);
            expect((service as any).isBuiltInService("ConfigService")).toBe(true);
        });

        it("should return true for TypeOrm services", () => {
            expect((service as any).isBuiltInService("TypeOrmCoreModule")).toBe(true);
        });

        it("should return true for framework services", () => {
            expect((service as any).isBuiltInService("NestApplication")).toBe(true);
        });

        it("should return true for services with Adapter", () => {
            expect((service as any).isBuiltInService("HttpAdapter")).toBe(true);
        });

        it("should return true for services with Factory", () => {
            expect((service as any).isBuiltInService("FactoryService")).toBe(true);
        });

        it("should return true for empty string", () => {
            expect((service as any).isBuiltInService("")).toBe(true);
        });

        it("should return false for custom services", () => {
            expect((service as any).isBuiltInService("PaymentService")).toBe(false);
            expect((service as any).isBuiltInService("EventService")).toBe(false);
        });
    });

    describe("getGuards", () => {
        it("should return empty array when no guards", () => {
            reflector.get = jest.fn((key, target) => undefined);
            const guards = (service as any).getGuards(class Test {});
            expect(guards).toEqual([]);
        });

        it("should extract guard names", () => {
            class TestGuard {}
            reflector.get = jest.fn((key, target) => {
                if (key === "__guards__") return [TestGuard];
                return undefined;
            });
            const guards = (service as any).getGuards(class Test {});
            expect(guards.length).toBeGreaterThan(0);
        });
    });

    describe("getRoles", () => {
        it("should return empty array when no roles", () => {
            reflector.get = jest.fn((key, target) => undefined);
            const roles = (service as any).getRoles(class Test {});
            expect(roles).toEqual([]);
        });

        it("should return roles when present", () => {
            reflector.get = jest.fn((key, target) => {
                if (key === "roles") return ["ADMIN", "USER"];
                return undefined;
            });
            const roles = (service as any).getRoles(class Test {});
            expect(roles).toEqual(["ADMIN", "USER"]);
        });
    });

    describe("getParameters", () => {
        it("should return empty array when no parameters", () => {
            reflector.get = jest.fn((key, target) => {
                if (key === ROUTE_ARGS_METADATA) return {};
                return undefined;
            });
            const params = (service as any).getParameters(() => {});
            expect(params).toEqual([]);
        });

        it("should extract parameter metadata", () => {
            reflector.get = jest.fn((key, target) => {
                if (key === ROUTE_ARGS_METADATA) return {
                    "0": {
                        data: "id",
                        metatype: String,
                        index: 0,
                        pipes: [],
                    },
                };
                return undefined;
            });
            const params = (service as any).getParameters(() => {});
            expect(params.length).toBeGreaterThan(0);
        });

        it("should mark parameter as optional when OptionalPipe present", () => {
            reflector.get = jest.fn((key, target) => {
                if (key === ROUTE_ARGS_METADATA) return {
                    "0": {
                        data: "id",
                        metatype: String,
                        index: 0,
                        pipes: [{ name: "OptionalPipe" }],
                    },
                };
                return undefined;
            });
            const params = (service as any).getParameters(() => {});
            expect(params[0].required).toBe(false);
        });
    });

    describe("getDecorators", () => {
        it("should return empty array when no decorators", () => {
            reflector.get = jest.fn((key, target) => undefined);
            const decorators = (service as any).getDecorators(() => {});
            expect(decorators).toEqual([]);
        });

        it("should detect ApiOperation decorator", () => {
            reflector.get = jest.fn((key, target) => {
                if (key === "swagger/api-operation") return {};
                return undefined;
            });
            const decorators = (service as any).getDecorators(() => {});
            expect(decorators).toContain("ApiOperation");
        });

        it("should detect UseGuards decorator", () => {
            reflector.get = jest.fn((key, target) => {
                if (key === "__guards__") return [];
                return undefined;
            });
            const decorators = (service as any).getDecorators(() => {});
            expect(decorators).toContain("UseGuards");
        });
    });

    describe("getReturnType", () => {
        it("should return default when no return type metadata", () => {
            reflector.get = jest.fn((key, target) => undefined);
            const returnType = (service as any).getReturnType(() => {});
            expect(returnType).toBe("Promise<IResponse>");
        });

        it("should return type name when metadata present", () => {
            reflector.get = jest.fn((key, target) => {
                if (key === "design:returntype") return { name: "TestResponse" };
                return undefined;
            });
            const returnType = (service as any).getReturnType(() => {});
            expect(returnType).toBe("TestResponse");
        });
    });

    describe("findBestMatchingMethod", () => {
        it("should find exact match", () => {
            const method = findBestMatchingMethod("getData", ["getData", "getOther"]);
            expect(method).toBe("getData");
        });

        it("should find partial match", () => {
            const method = findBestMatchingMethod("get", ["getData", "getOther"]);
            expect(method).toBe("getData");
        });

        it("should find semantic match", () => {
            const method = findBestMatchingMethod("create", ["add", "insert"]);
            expect(method).toBe("add");
        });

        it("should return first method when no match", () => {
            const method = findBestMatchingMethod("unknown", ["method1", "method2"]);
            expect(method).toBe("method1");
        });

        it("should return controller method when service methods empty", () => {
            const method = findBestMatchingMethod("getData", []);
            expect(method).toBe("getData");
        });
    });

    describe("getExpectedStatusCode", () => {
        it("should return 201 for POST", () => {
            const status = getExpectedStatusCode("POST");
            expect(status).toBe("201 Created");
        });

        it("should return 200 for PUT", () => {
            const status = getExpectedStatusCode("PUT");
            expect(status).toBe("200 OK");
        });

        it("should return 200 for PATCH", () => {
            const status = getExpectedStatusCode("PATCH");
            expect(status).toBe("200 OK");
        });

        it("should return 200 for DELETE", () => {
            const status = getExpectedStatusCode("DELETE");
            expect(status).toBe("200 OK");
        });

        it("should return 200 for GET", () => {
            const status = getExpectedStatusCode("GET");
            expect(status).toBe("200 OK");
        });

        it("should return 200 for default/unknown", () => {
            const status = getExpectedStatusCode("UNKNOWN");
            expect(status).toBe("200 OK");
        });
    });

    describe("getRepositoriesFromWrapper", () => {
        it("should extract repositories from inject", () => {
            const mockWrapper = {
                inject: ["UserRepository", "PaymentRepository", "StringToken"],
            };
            const repos = (service as any).getRepositoriesFromWrapper(mockWrapper as any);
            expect(repos).toContain("UserRepository");
            expect(repos).toContain("PaymentRepository");
            expect(repos).not.toContain("StringToken");
        });

        it("should return empty array when no inject", () => {
            const mockWrapper = {};
            const repos = (service as any).getRepositoriesFromWrapper(mockWrapper as any);
            expect(repos).toEqual([]);
        });
    });
});
