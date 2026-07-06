# apitrace

Discover API endpoints at runtime and generate [Mermaid](https://mermaid.js.org/) sequence diagrams for documentation and debugging.

Repository: [github.com/chandpriyankara/apitrace](https://github.com/chandpriyankara/apitrace)

## Install

```bash
pnpm add @tix.lk/apitrace
```

## Generate diagrams from discovery data

Use the core API with your own controller/service metadata:

```typescript
import { generateMermaidDiagram } from '@tix.lk/apitrace';

const diagram = await generateMermaidDiagram(
  {
    controllers: [
      {
        name: 'UserController',
        path: '/users',
        module: 'UserModule',
        guards: [],
        dependencies: ['UserService'],
        endpoints: [
          {
            method: 'GET',
            path: '/users',
            methodName: 'findAll',
            controller: 'UserController',
            module: 'UserModule',
            guards: [],
            roles: [],
            parameters: [],
            returnType: 'Promise<User[]>',
            decorators: [],
            dependencies: [],
          },
        ],
      },
    ],
    services: [
      {
        name: 'UserService',
        module: 'UserModule',
        methods: ['findAll'],
        dependencies: [],
        repositories: ['UserRepository'],
      },
    ],
  },
  {
    apiName: 'My API',
    sourceRoot: './src',
  },
);

console.log(diagram); // paste into mermaid.live
```

## Runtime discovery module

For decorator-based Node.js applications, register the built-in discovery module:

```typescript
import { join } from 'path';
import { ApiTraceModule } from '@tix.lk/apitrace';

ApiTraceModule.forRoot({
  apiName: 'My API',
  sourceRoot: join(process.cwd(), 'src'),
});
```

This exposes `GET /api-trace/sequence-diagram` and returns plain Mermaid text.

Peer dependencies apply when using the runtime discovery module.

## Exports

| Export | Purpose |
|--------|---------|
| `generateMermaidDiagram` | Build a full diagram from discovery data |
| `generateControllerMermaidDiagram` | Diagram for a single route handler |
| `ApiTraceModule` | Runtime discovery + optional HTTP endpoint |
| `ApiTraceService` | Programmatic discovery and diagram generation |
| `buildFullPath`, `findBestMatchingMethod` | Routing and method-matching helpers |

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
